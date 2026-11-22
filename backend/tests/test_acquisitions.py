from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import acquisitions, auth
from app.core import security
from app.main import app


SUBMISSION_ID = "00000000-0000-0000-0000-000000000001"
PHOTO_ID = "00000000-0000-0000-0000-000000000002"


def offer_data():
    return {
        "submission_id": SUBMISSION_ID,
        "photo_ids": [PHOTO_ID],
        "amount_cents": "12550",
        "rights_type": "license",
        "exclusive": False,
        "territory": " Worldwide ",
        "permitted_uses": " Display ",
        "attribution": " Photographer ",
        "agreement_terms": " Agreement ",
        "gallery_permission": True,
    }


@pytest.mark.parametrize("amount", ["0", "-1", "1.50", "9223372036854775808"])
def test_offer_rejects_invalid_or_unrepresentable_amount(amount):
    with pytest.raises(ValidationError):
        acquisitions.OfferCreate.model_validate({**offer_data(), "amount_cents": amount})


def test_offer_rejects_duplicate_photographs():
    with pytest.raises(ValidationError):
        acquisitions.OfferCreate.model_validate({**offer_data(), "photo_ids": [PHOTO_ID, PHOTO_ID]})


def test_offer_acceptance_requires_explicit_consent():
    with pytest.raises(ValidationError):
        acquisitions.OfferResponse(accept=True, confirm_terms=False)
    assert acquisitions.OfferResponse(accept=False).confirm_terms is False


@pytest.mark.parametrize("role", ["photographer", "agent"])
def test_admin_offer_and_publication_endpoints_require_admin(monkeypatch, role):
    monkeypatch.setattr(security.auth, "get_supabase_client", lambda: object())
    monkeypatch.setattr(
        security.auth, "get_profile_for_token", lambda client, token: {"id": "user", "role": role}
    )
    with TestClient(app) as client:
        client.cookies.set(auth.ACCESS_COOKIE, "test-token")
        assert client.post("/admin/acquisition-offers", json=offer_data()).status_code == 403
        assert client.post("/admin/acquisition-offers/quote", json={
            "submission_id": SUBMISSION_ID, "photo_ids": [PHOTO_ID],
        }).status_code == 403
        assert client.post(
            "/admin/publications", json={"offer_id": SUBMISSION_ID, "photo_id": PHOTO_ID}
        ).status_code == 403


@pytest.mark.parametrize("quote,expected", [
    ({"amount_cents": "12000", "partner_count": 1, "non_partner_count": 0}, 200),
    ({"amount_cents": "10000", "partner_count": 0, "non_partner_count": 1}, 200),
    ({"amount_cents": "10000", "partner_count": 1, "non_partner_count": 0}, 502),
])
def test_admin_offer_quote_validates_database_result(monkeypatch, quote, expected):
    monkeypatch.setattr(security.auth, "get_supabase_client", lambda: object())
    monkeypatch.setattr(security.auth, "get_profile_for_token", lambda client, token: {"id": "admin", "role": "admin"})
    monkeypatch.setattr(acquisitions, "get_admin_client", lambda request, user: object())
    monkeypatch.setattr(acquisitions, "execute_rpc", lambda client, name, params: quote)
    with TestClient(app) as client:
        client.cookies.set(auth.ACCESS_COOKIE, "test-token")
        response = client.post("/admin/acquisition-offers/quote", json={
            "submission_id": SUBMISSION_ID, "photo_ids": [PHOTO_ID],
        })
    assert response.status_code == expected


def test_changed_acquisition_quote_returns_conflict():
    class ChangedQuote(Exception):
        code = "P1002"

    class Client:
        def rpc(self, name, params):
            raise ChangedQuote()

    with pytest.raises(HTTPException) as error:
        acquisitions.execute_rpc(Client(), "create_acquisition_offer", {})
    assert error.value.status_code == 409
    assert "new quote" in error.value.detail


def test_offer_acceptance_reports_non_partner_limit():
    class LimitError(Exception):
        code = "P1003"

    class Client:
        def rpc(self, name, params):
            raise LimitError()

    with pytest.raises(HTTPException) as error:
        acquisitions.execute_rpc(Client(), "respond_to_acquisition_offer", {})
    assert error.value.status_code == 409
    assert "remaining non-partner allowance" in error.value.detail


def test_offer_response_uses_authoritative_transaction(monkeypatch):
    calls = []

    class Rpc:
        def execute(self):
            return type("Result", (), {"data": "accepted"})()

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return Rpc()

    monkeypatch.setattr(acquisitions, "get_user_client", lambda request: Client())
    result = acquisitions.respond_to_offer(
        UUID(SUBMISSION_ID),
        acquisitions.OfferResponse(accept=True, confirm_terms=True),
        None,
        {"id": "owner"},
    )
    assert result == {"status": "accepted"}
    assert calls == [("respond_to_acquisition_offer", {
        "p_offer_id": SUBMISSION_ID,
        "p_accept": True,
        "p_confirm_terms": True,
    })]


def test_conflicting_acquisition_returns_conflict():
    class DuplicateError(Exception):
        code = "23505"

    class Rpc:
        def execute(self):
            raise DuplicateError()

    class Client:
        def rpc(self, name, params):
            return Rpc()

    with pytest.raises(HTTPException) as error:
        acquisitions.execute_rpc(Client(), "respond_to_acquisition_offer", {})
    assert error.value.status_code == 409


def test_missing_original_is_reported_as_publication_conflict():
    class MissingOriginal(Exception):
        code = "P1001"

    class Rpc:
        def execute(self):
            raise MissingOriginal()

    class Client:
        def rpc(self, name, params):
            return Rpc()

    with pytest.raises(HTTPException) as error:
        acquisitions.execute_rpc(Client(), "publish_acquired_photo", {})
    assert error.value.status_code == 409
    assert "original photograph is unavailable" in error.value.detail


def test_unpublished_image_never_uses_service_credentials(monkeypatch):
    class Query:
        def select(self, fields):
            return self

        def eq(self, field, value):
            return self

        def limit(self, value):
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    class Client:
        def table(self, name):
            return Query()

    monkeypatch.setattr(acquisitions.auth, "get_supabase_client", lambda: Client())

    def forbidden_service():
        raise AssertionError("Private storage must not be accessed")

    monkeypatch.setattr(acquisitions.auth, "get_supabase_service_client", forbidden_service)
    with pytest.raises(HTTPException) as error:
        acquisitions.public_gallery_image(UUID(SUBMISSION_ID))
    assert error.value.status_code == 404


def test_public_image_serves_original_with_safe_headers(monkeypatch):
    original = b"original-image" * 400000

    class Query:
        def __init__(self, data):
            self.data = data

        def select(self, fields):
            return self

        def eq(self, field, value):
            return self

        def limit(self, value):
            return self

        def execute(self):
            return type("Result", (), {"data": [self.data]})()

    class Public:
        def table(self, name):
            assert name == "gallery_publications"
            return Query({"photo_id": PHOTO_ID, "photographer_id": "owner"})

    class Service:
        def table(self, name):
            assert name == "photographer_photos"
            return Query({"storage_path": "owner/original.jpg", "mime_type": "image/jpeg"})

    monkeypatch.setattr(acquisitions.auth, "get_supabase_client", lambda: Public())
    monkeypatch.setattr(acquisitions.auth, "get_supabase_service_client", lambda: Service())
    monkeypatch.setattr(acquisitions.settings, "supabase_url", "https://example.test")
    monkeypatch.setattr(acquisitions.settings, "supabase_secret_key", "test-secret")
    client_class = httpx.Client

    def upstream(request):
        assert str(request.url) == "https://example.test/storage/v1/object/photographer-originals/owner/original.jpg"
        assert request.headers["apikey"] == "test-secret"
        assert request.headers["authorization"] == "Bearer test-secret"
        return httpx.Response(200, content=original)

    def make_client(**kwargs):
        assert kwargs["follow_redirects"] is False
        assert kwargs["trust_env"] is False
        return client_class(transport=httpx.MockTransport(upstream), **kwargs)

    monkeypatch.setattr(acquisitions.httpx, "Client", make_client)
    with TestClient(app) as client:
        response = client.get(f"/gallery/{SUBMISSION_ID}/image")
    assert len(original) > 4_500_000
    assert response.content == original
    assert response.headers["content-type"] == "image/jpeg"
    assert "content-length" not in response.headers
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_public_image_rejects_traversal_before_request(monkeypatch):
    class Query:
        def __init__(self, data):
            self.data = data

        def select(self, fields):
            return self

        def eq(self, field, value):
            return self

        def limit(self, value):
            return self

        def execute(self):
            return type("Result", (), {"data": [self.data]})()

    class Public:
        def table(self, name):
            return Query({"photo_id": PHOTO_ID, "photographer_id": "owner"})

    class Service:
        def table(self, name):
            return Query({"storage_path": "owner/../private.jpg", "mime_type": "image/jpeg"})

    monkeypatch.setattr(acquisitions.auth, "get_supabase_client", lambda: Public())
    monkeypatch.setattr(acquisitions.auth, "get_supabase_service_client", lambda: Service())

    def forbidden_client(**kwargs):
        raise AssertionError("Invalid storage paths must not be requested")

    monkeypatch.setattr(acquisitions.httpx, "Client", forbidden_client)
    with pytest.raises(HTTPException) as error:
        acquisitions.public_gallery_image(UUID(SUBMISSION_ID))
    assert error.value.status_code == 502


def test_wallet_preserves_bigint_precision(monkeypatch):
    class Query:
        def select(self, fields):
            return self

        def eq(self, field, value):
            assert (field, value) == ("photographer_id", "owner")
            return self

        def limit(self, value):
            return self

        def execute(self):
            return type("Result", (), {"data": [{
                "currency": "USD",
                "available_balance_cents": 9007199254740993,
                "pending_balance_cents": 0,
            }]})()

    class Client:
        def table(self, name):
            return Query()

    monkeypatch.setattr(acquisitions, "get_user_client", lambda request: Client())
    result = acquisitions.get_wallet(None, {"id": "owner"})
    assert result["wallet"]["available_balance_cents"] == "9007199254740993"
