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


class FakeProfileQuery:
    def __init__(self, profiles):
        self.profiles = profiles
        self.filters = {}
        self.update_values = None

    def update(self, values):
        self.update_values = values
        return self

    def select(self, fields):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self.update_values is not None:
            self.profiles.append({
                "id": self.filters["id"],
                **self.update_values,
            })
            return SimpleNamespace(data=[{"id": self.filters["id"]}])

        matches = [
            profile
            for profile in self.profiles
            if all(profile.get(key) == value for key, value in self.filters.items())
        ]
        return SimpleNamespace(data=matches[0] if len(matches) == 1 else None)


class FakeSupabaseClient:
    def __init__(self):
        self.auth = FakeSupabaseAuth()
        self.profiles = [
            {
                "id": "photographer-referrer-id",
                "role": "photographer",
                "referral_code": "P-ABC-12345",
                "agent_code": None,
            },
            {
                "id": "agent-referrer-id",
                "role": "agent",
                "referral_code": None,
                "agent_code": "A-XYZ-67890",
            },
        ]

    def table(self, table_name):
        assert table_name == "profiles"
        return FakeProfileQuery(self.profiles)


def configure_fake_supabase(monkeypatch):
    fake = FakeSupabaseClient()

    monkeypatch.setattr(auth, "create_client", lambda *args, **kwargs: fake)
    monkeypatch.setattr(auth.settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(auth.settings, "supabase_publishable_key", "test-key")
    monkeypatch.setattr(auth.settings, "supabase_secret_key", "test-secret")

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
    assert metadata["referred_by"] == "photographer-referrer-id"
    assert metadata["referred_by_agent"] == "agent-referrer-id"
    created_profile = next(
        profile for profile in fake.profiles
        if profile.get("id") == "test-user-id"
    )
    assert created_profile["referred_by"] == "photographer-referrer-id"
    assert created_profile["referred_by_agent"] == "agent-referrer-id"


def test_agent_registration_requires_admin(monkeypatch):
    fake = configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload.update({
        "account_type": "agent",
        "referral_code": None,
        "agent_code": None,
    })

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 403
    assert fake.auth.payload is None


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

    assert response.status_code == 403
    assert "administrator" in response.json()["detail"].lower()


def test_invalid_photographer_code_is_rejected(monkeypatch):
    configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload["referral_code"] = "INVALID"

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 400


def test_unknown_referral_code_is_rejected(monkeypatch):
    configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload["referral_code"] = "P-DEF-54321"

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_referral_code_must_match_referrer_role(monkeypatch):
    fake = configure_fake_supabase(monkeypatch)
    fake.profiles[0]["role"] = "agent"

    response = client.post("/auth/register", json=base_payload())

    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()
    assert fake.auth.payload is None


def test_whitespace_only_names_are_rejected(monkeypatch):
    configure_fake_supabase(monkeypatch)

    payload = base_payload()
    payload["full_name"] = "   "

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 422
