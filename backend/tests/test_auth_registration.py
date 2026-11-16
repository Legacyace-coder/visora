from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import auth
from app.main import app


client = TestClient(app)


class FakeSupabaseAuth:
    def __init__(self):
        self.payload = None

    def sign_up(self, payload):
        self.payload = payload
        return SimpleNamespace(
            user=SimpleNamespace(id="test-user-id"),
            session=None,
        )


class FakeSupabaseClient:
    def __init__(self):
        self.auth = FakeSupabaseAuth()


def configure_fake_supabase(monkeypatch):
    fake = FakeSupabaseClient()

    monkeypatch.setattr(auth, "create_client", lambda *args, **kwargs: fake)
    monkeypatch.setattr(auth.settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(auth.settings, "supabase_publishable_key", "test-key")

    return fake


def base_payload():
    return {
        "account_type": "photographer",
        "full_name": "Test Photographer",
        "display_name": "Test Studio",
        "email": "photographer@example.com",
        "password": "StrongPassword123",
        "referral_code": "P-ABC-12345",
        "agent_code": "A-XYZ-67890",
    }


def test_photographer_registration_sends_both_referral_codes(monkeypatch):
    fake = configure_fake_supabase(monkeypatch)

    response = client.post("/auth/register", json=base_payload())

    assert response.status_code == 201
    assert response.json()["confirmation_required"] is True

    metadata = fake.auth.payload["options"]["data"]

    assert metadata["account_type"] == "photographer"
    assert metadata["referral_code"] == "P-ABC-12345"
    assert metadata["agent_code"] == "A-XYZ-67890"


def test_agent_registration_sends_agent_account_type(monkeypatch):
    fake = configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload.update({
        "account_type": "agent",
        "referral_code": None,
        "agent_code": None,
    })

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 201

    metadata = fake.auth.payload["options"]["data"]

    assert metadata["account_type"] == "agent"
    assert metadata["referral_code"] is None
    assert metadata["agent_code"] is None


def test_public_registration_cannot_select_admin(monkeypatch):
    configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload["account_type"] = "admin"

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 422


def test_agent_cannot_register_with_referral_codes(monkeypatch):
    configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload["account_type"] = "agent"

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 400
    assert "cannot register" in response.json()["detail"].lower()


def test_invalid_photographer_code_is_rejected(monkeypatch):
    configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload["referral_code"] = "INVALID"

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 400
