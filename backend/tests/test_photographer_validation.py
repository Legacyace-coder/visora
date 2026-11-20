import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.api import photographer
from app.api.photographer import CollectionCreate, SubmissionCreate


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
