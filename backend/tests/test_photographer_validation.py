import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.requests import Request
from uuid import UUID

from app.api import photographer
from app.api.photographer import CollectionCreate, PhotoMetadata, SubmissionCreate
from app.core.config import settings
from app.main import app


class FakePhotoQuery:
    def select(self, fields):
        return self

    def eq(self, field, value):
        return self

    def in_(self, field, values):
        return self

    def execute(self):
        return type("Result", (), {
            "data": [{"id": "00000000-0000-0000-0000-000000000001"}]
        })()


class FakeRpc:
    def execute(self):
        return type("Result", (), {
            "data": {"id": "submission-id", "status": "pending"}
        })()


class FakeSubmissionClient:
    def __init__(self):
        self.rpc_name = None
        self.rpc_params = None

    def table(self, table_name):
        assert table_name == "photographer_photos"
        return FakePhotoQuery()

    def rpc(self, name, params):
        self.rpc_name = name
        self.rpc_params = params
        return FakeRpc()


def test_collection_title_is_trimmed_before_length_validation():
    assert CollectionCreate(title="  Street portraits  ").title == "Street portraits"


def test_whitespace_only_collection_title_is_rejected():
    with pytest.raises(ValidationError):
        CollectionCreate(title="   ")


def test_submission_title_and_cover_note_are_normalized():
    submission = SubmissionCreate(
        submission_type="individual",
        title="  Evening light  ",
        cover_note="   ",
        photo_ids=["00000000-0000-0000-0000-000000000001"],
    )

    assert submission.title == "Evening light"
    assert submission.cover_note is None


def test_whitespace_only_submission_title_is_rejected():
    with pytest.raises(ValidationError):
        SubmissionCreate(
            submission_type="individual",
            title="   ",
            photo_ids=["00000000-0000-0000-0000-000000000001"],
        )


def test_overview_counts_current_and_legacy_processing_statuses(monkeypatch):
    monkeypatch.setattr(photographer, "get_user_client", lambda request: object())

    def fake_count_rows(client, table, owner_id, status=None):
        return {
            "processing": 2,
            "under_review": 3,
        }.get(status, 0)

    monkeypatch.setattr(photographer, "count_rows", fake_count_rows)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/photographer/overview",
        "headers": [],
        "query_string": b"",
    })

    overview = photographer.photographer_overview(
        request,
        {"id": "test-photographer"},
    )

    assert overview["statistics"]["processing_submissions"] == 5
    assert "under_review_submissions" not in overview["statistics"]


def test_legacy_review_status_is_normalized_for_the_api():
    assert photographer.normalize_submission_status("under_review") == "processing"
    assert photographer.normalize_submission_status("processing") == "processing"


def test_submission_uses_the_transactional_rpc(monkeypatch):
    fake_client = FakeSubmissionClient()
    monkeypatch.setattr(
        photographer,
        "get_user_client",
        lambda request: fake_client,
    )
    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/photographer/submissions",
        "headers": [],
        "query_string": b"",
    })
    payload = SubmissionCreate(
        submission_type="individual",
        title="Portfolio selection",
        photo_ids=["00000000-0000-0000-0000-000000000001"],
    )

    result = photographer.create_submission(
        payload,
        request,
        {"id": "photographer-id"},
    )

    assert fake_client.rpc_name == "create_photographer_submission"
    assert fake_client.rpc_params["p_title"] == "Portfolio selection"
    assert result["submission"]["id"] == "submission-id"
    assert result["photo_count"] == 1


def test_photo_metadata_normalizes_fields_and_serializes_capture_date():
    metadata = PhotoMetadata.model_validate({
        "title": "  Dusk  ",
        "description": "  ",
        "capture_date": "2026-11-20",
        "location": "  Paris  ",
        "keywords": [" street ", "portrait"],
    })
    assert metadata.model_dump(mode="json") == {
        "title": "Dusk",
        "description": None,
        "capture_date": "2026-11-20",
        "location": "Paris",
        "keywords": ["street", "portrait"],
    }


@pytest.mark.parametrize("keywords", [[""], ["x" * 81], ["tag"] * 31])
def test_photo_metadata_rejects_invalid_keywords(keywords):
    with pytest.raises(ValidationError):
        PhotoMetadata(keywords=keywords)


def test_photo_metadata_rejects_invalid_capture_date():
    with pytest.raises(ValidationError):
        PhotoMetadata.model_validate({"capture_date": "2026-02-30"})


def test_update_photo_limits_update_to_owner(monkeypatch):
    class UpdateQuery:
        def __init__(self):
            self.filters = {}
            self.values = None

        def update(self, values):
            self.values = values
            return self

        def eq(self, field, value):
            self.filters[field] = value
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    query = UpdateQuery()

    class Client:
        def table(self, name):
            assert name == "photographer_photos"
            return query

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())
    request = Request({
        "type": "http",
        "method": "PUT",
        "path": "/photographer/photos",
        "headers": [],
        "query_string": b"",
    })
    photo_id = UUID("00000000-0000-0000-0000-000000000001")
    with pytest.raises(HTTPException) as error:
        photographer.update_photo(photo_id, PhotoMetadata(title="Updated"), request, {"id": "owner"})
    assert error.value.status_code == 404
    assert query.filters == {"id": str(photo_id), "photographer_id": "owner"}
    assert query.values["title"] == "Updated"


def test_upload_persists_metadata(monkeypatch):
    class Storage:
        def from_(self, bucket):
            assert bucket == photographer.BUCKET
            return self

        def upload(self, path, content, options):
            assert path.startswith("owner/")

    class PhotoTable:
        def insert(self, values):
            self.values = values
            return self

        def execute(self):
            return type("Result", (), {"data": [self.values]})()

    table = PhotoTable()

    class Client:
        storage = Storage()

        def table(self, name):
            assert name == "photographer_photos"
            return table

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())
    app.dependency_overrides[photographer.require_photographer] = lambda: {"id": "owner"}
    try:
        with TestClient(app) as client:
            response = client.post(
                "/photographer/photos",
                files={"file": ("photo.jpg", b"\xff\xd8\xfftest", "image/jpeg")},
                data={
                    "title": " View ",
                    "capture_date": "2026-11-20",
                    "location": " Paris ",
                    "keywords": " street, portrait ",
                },
            )
    finally:
        app.dependency_overrides.pop(photographer.require_photographer)

    assert response.status_code == 201
    assert table.values["title"] == "View"
    assert table.values["capture_date"] == "2026-11-20"
    assert table.values["location"] == "Paris"
    assert table.values["keywords"] == ["street", "portrait"]


def test_photo_update_cors_preflight():
    with TestClient(app) as client:
        response = client.options(
            "/photographer/photos/00000000-0000-0000-0000-000000000001",
            headers={
                "Origin": settings.allowed_origins[0],
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]


def test_delete_rejects_referenced_photograph(monkeypatch):
    class ForeignKeyError(Exception):
        code = "23503"

    class Rpc:
        def execute(self):
            raise ForeignKeyError()

    class Client:
        def rpc(self, name, params):
            assert name == "delete_photographer_photo"
            return Rpc()

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())
    with pytest.raises(HTTPException) as error:
        photographer.delete_photo(
            UUID("00000000-0000-0000-0000-000000000001"),
            None,
            {"id": "owner"},
        )
    assert error.value.status_code == 409


def test_failed_storage_cleanup_keeps_queue_entry_for_retry():
    class Queue:
        removed = False

        def select(self, fields):
            return self

        def delete(self):
            self.removed = True
            return self

        def eq(self, field, value):
            return self

        def execute(self):
            return type("Result", (), {
                "data": [{"photo_id": "photo", "storage_path": "owner/photo.jpg"}]
            })()

    class Storage:
        def from_(self, bucket):
            return self

        def remove(self, paths):
            raise RuntimeError("Storage unavailable")

    queue = Queue()

    class Client:
        storage = Storage()

        def table(self, name):
            assert name == "photograph_deletion_queue"
            return queue

    with pytest.raises(RuntimeError, match="Storage unavailable"):
        photographer.cleanup_deleted_photos(Client(), "owner")
    assert not queue.removed


def test_storage_cleanup_removes_original_then_queue_entry():
    operations = []

    class Queue:
        deleting = False

        def select(self, fields):
            return self

        def delete(self):
            self.deleting = True
            return self

        def eq(self, field, value):
            if self.deleting:
                operations.append(("filter", field, value))
            return self

        def execute(self):
            if self.deleting:
                operations.append(("delete",))
                return type("Result", (), {"data": []})()
            return type("Result", (), {
                "data": [{"photo_id": "photo", "storage_path": "owner/photo.jpg"}]
            })()

    class Storage:
        def from_(self, bucket):
            assert bucket == photographer.BUCKET
            return self

        def remove(self, paths):
            operations.append(("storage", paths))

    queue = Queue()

    class Client:
        storage = Storage()

        def table(self, name):
            return queue

    assert photographer.cleanup_deleted_photos(Client(), "owner") == 1
    assert operations == [
        ("storage", ["owner/photo.jpg"]),
        ("filter", "photo_id", "photo"),
        ("filter", "photographer_id", "owner"),
        ("delete",),
    ]


def test_delete_reports_pending_cleanup(monkeypatch):
    class Rpc:
        def execute(self):
            return type("Result", (), {"data": True})()

    class Client:
        def rpc(self, name, params):
            return Rpc()

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())

    def fail_cleanup(client, owner_id):
        raise RuntimeError("Storage unavailable")

    monkeypatch.setattr(photographer, "cleanup_deleted_photos", fail_cleanup)
    with pytest.raises(HTTPException) as error:
        photographer.delete_photo(
            UUID("00000000-0000-0000-0000-000000000001"),
            None,
            {"id": "owner"},
        )
    assert error.value.status_code == 502
    assert "cleanup is pending" in error.value.detail
