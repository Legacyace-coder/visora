import pytest
from uuid import UUID

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import admin, auth, photographer
from app.core import security
from app.main import app


SUBMISSION_ID = "00000000-0000-0000-0000-000000000001"


class Result:
    def __init__(self, data):
        self.data = data


class Rpc:
    def __init__(self, result):
        self.result = result

    def execute(self):
        return Result(self.result)


class ReviewClient:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return Rpc(self.result)


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(security.auth, "get_supabase_client", lambda: object())
    with TestClient(app) as client:
        yield client


def sign_in(client, monkeypatch, role):
    monkeypatch.setattr(
        security.auth,
        "get_profile_for_token",
        lambda client, token: {"id": "user-id", "role": role},
    )
    client.cookies.set(auth.ACCESS_COOKIE, "test-token")


@pytest.mark.parametrize("role", ["photographer", "agent"])
def test_review_endpoints_require_admin(api, monkeypatch, role):
    sign_in(api, monkeypatch, role)
    assert api.get("/admin/submissions").status_code == 403
    assert api.get(f"/admin/submissions/{SUBMISSION_ID}").status_code == 403
    assert api.put(
        f"/admin/submissions/{SUBMISSION_ID}/review",
        json={"expected_status": "pending", "status": "accepted"},
    ).status_code == 403


def test_rejection_requires_nonblank_feedback(api, monkeypatch):
    sign_in(api, monkeypatch, "admin")
    response = api.put(
        f"/admin/submissions/{SUBMISSION_ID}/review",
        json={
            "expected_status": "pending",
            "status": "rejected",
            "photographer_feedback": "  ",
        },
    )
    assert response.status_code == 422


def test_review_uses_conditional_rpc_and_trims_feedback(api, monkeypatch):
    sign_in(api, monkeypatch, "admin")
    fake = ReviewClient({"id": SUBMISSION_ID, "status": "rejected"})
    monkeypatch.setattr(admin, "get_admin_client", lambda request, user: fake)
    response = api.put(
        f"/admin/submissions/{SUBMISSION_ID}/review",
        json={
            "expected_status": "under_review",
            "status": "rejected",
            "photographer_feedback": "  Please refine your edit.  ",
        },
    )
    assert response.status_code == 200
    assert fake.calls == [(
        "review_photographer_submission",
        {
            "p_submission_id": SUBMISSION_ID,
            "p_expected_status": "under_review",
            "p_status": "rejected",
            "p_photographer_feedback": "Please refine your edit.",
        },
    )]


def test_stale_review_returns_conflict(api, monkeypatch):
    sign_in(api, monkeypatch, "admin")
    fake = ReviewClient(None)
    monkeypatch.setattr(admin, "get_admin_client", lambda request, user: fake)
    response = api.put(
        f"/admin/submissions/{SUBMISSION_ID}/review",
        json={"expected_status": "pending", "status": "accepted"},
    )
    assert response.status_code == 409


def test_final_decisions_cannot_be_submitted_as_expected_status(api, monkeypatch):
    sign_in(api, monkeypatch, "admin")
    response = api.put(
        f"/admin/submissions/{SUBMISSION_ID}/review",
        json={"expected_status": "accepted", "status": "rejected", "photographer_feedback": "No"},
    )
    assert response.status_code == 422


def test_photographer_submission_query_does_not_select_private_notes(monkeypatch):
    class Query:
        fields = ""

        def select(self, fields):
            self.fields = fields
            return self

        def eq(self, field, value):
            assert (field, value) == ("photographer_id", "owner")
            return self

        def order(self, field, desc):
            return self

        def range(self, start, end):
            assert (start, end) == (0, 100)
            return self

        def execute(self):
            return Result([{
                "status": "under_review",
                "photographer_feedback": "Visible feedback",
            }])

    query = Query()

    class Client:
        def table(self, name):
            return query

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())
    result = photographer.list_submissions(None, {"id": "owner"}, 0)
    assert "reviewer_notes" not in query.fields
    assert "photographer_feedback" in query.fields
    assert result["submissions"][0]["status"] == "processing"
    assert result["submissions"][0]["photographer_feedback"] == "Visible feedback"


def test_portfolio_paginates_and_reports_total(monkeypatch):
    class Query:
        def select(self, fields, count):
            assert count == "exact"
            return self

        def eq(self, field, value):
            assert (field, value) == ("photographer_id", "owner")
            return self

        def order(self, field, desc):
            assert (field, desc) in (("created_at", True), ("id", True))
            return self

        def range(self, start, end):
            assert (start, end) == (100, 200)
            return self

        def execute(self):
            result = Result([{"id": str(i)} for i in range(101)])
            result.count = 250
            return result

    class Client:
        def table(self, name):
            assert name == "photographer_photos"
            return Query()

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())
    result = photographer.list_photos(None, {"id": "owner"}, 100)
    assert len(result["photos"]) == 100
    assert result["total"] == 250
    assert result["has_more"] is True


def test_submission_history_has_next_page(monkeypatch):
    class Query:
        def select(self, fields):
            return self

        def eq(self, field, value):
            return self

        def order(self, field, desc):
            return self

        def range(self, start, end):
            assert (start, end) == (100, 200)
            return self

        def execute(self):
            return Result([{"id": str(i), "status": "pending"} for i in range(101)])

    class Client:
        def table(self, name):
            return Query()

    monkeypatch.setattr(photographer, "get_user_client", lambda request: Client())
    result = photographer.list_submissions(None, {"id": "owner"}, 100)
    assert len(result["submissions"]) == 100
    assert result["has_more"] is True


def test_preview_rejects_photograph_outside_submission(monkeypatch):
    class Query:
        def select(self, fields):
            return self

        def eq(self, field, value):
            return self

        def limit(self, count):
            return self

        def execute(self):
            return Result([])

    class Client:
        def table(self, name):
            assert name == "submission_items"
            return Query()

    monkeypatch.setattr(admin, "get_admin_client", lambda request, user: Client())
    with pytest.raises(HTTPException) as error:
        admin.get_admin_submission_photo_preview(
            UUID(SUBMISSION_ID),
            UUID("00000000-0000-0000-0000-000000000002"),
            None,
            {"id": "admin"},
        )
    assert error.value.status_code == 404


def test_admin_detail_includes_submitted_photos_and_private_notes(monkeypatch):
    class Query:
        def __init__(self, table):
            self.table = table

        def select(self, fields):
            assert "reviewer_notes" not in fields
            return self

        def eq(self, field, value):
            return self

        def limit(self, size):
            return self

        def order(self, field):
            return self

        def range(self, start, end):
            return self

        def in_(self, field, values):
            assert values == ["photo-id"]
            return self

        def execute(self):
            return Result({
                "submissions": [{"id": SUBMISSION_ID, "status": "pending"}],
                "submission_items": [{"photo_id": "photo-id"}],
                "photographer_photos": [{"id": "photo-id", "original_filename": "work.jpg"}],
            }[self.table])

    class Client:
        def table(self, name):
            return Query(name)

        def rpc(self, name, params):
            assert name == "admin_submission_private_notes"
            assert params == {"p_submission_id": SUBMISSION_ID}
            return Rpc("Internal note")

    monkeypatch.setattr(admin, "get_admin_client", lambda request, user: Client())
    result = admin.get_admin_submission(UUID(SUBMISSION_ID), None, {"id": "admin"})
    assert result["photos"][0]["id"] == "photo-id"
    assert result["private_notes"] == "Internal note"
