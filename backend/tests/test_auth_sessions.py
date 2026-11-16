from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import auth
from app.main import app


client = TestClient(app)


class FakePostgrest:
    def auth(self, token):
        self.token = token


class FakeQuery:
    def select(self, fields):
        return self

    def eq(self, field, value):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data={
            "id": "test-user-id",
            "role": "photographer",
            "display_name": "Test Studio",
            "referral_code": "P-ABC-12345",
            "agent_code": None,
        })


class FakeAuth:
    def __init__(self):
        self.sign_out_called = False
        self.session_set = False

    def sign_in_with_password(self, payload):
        return make_auth_response()

    def get_user(self, access_token):
        assert access_token == "test-access-token"
        return SimpleNamespace(
            user=SimpleNamespace(
                id="test-user-id",
                email="photographer@example.com",
            )
        )

    def refresh_session(self, refresh_token):
        assert refresh_token == "test-refresh-token"
        return make_auth_response()

    def set_session(self, access_token, refresh_token):
        self.session_set = True

    def sign_out(self):
        self.sign_out_called = True


class FakeSupabaseClient:
    def __init__(self):
        self.auth = FakeAuth()
        self.postgrest = FakePostgrest()

    def table(self, table_name):
        assert table_name == "profiles"
        return FakeQuery()


def make_auth_response():
    session = SimpleNamespace(
        access_token="test-access-token",
        refresh_token="test-refresh-token",
        expires_in=3600,
    )
    user = SimpleNamespace(
        id="test-user-id",
        email="photographer@example.com",
    )
    return SimpleNamespace(user=user, session=session)


def configure_fake_supabase(monkeypatch):
    fake = FakeSupabaseClient()

    monkeypatch.setattr(auth, "create_client", lambda *args, **kwargs: fake)
    monkeypatch.setattr(auth.settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(auth.settings, "supabase_publishable_key", "test-key")
    monkeypatch.setattr(auth.settings, "app_env", "test")

    return fake


def test_login_sets_httponly_session_cookies(monkeypatch):
    configure_fake_supabase(monkeypatch)

    response = client.post(
        "/auth/login",
        json={
            "email": "photographer@example.com",
            "password": "StrongPassword123",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "photographer"
    assert response.json()["user"]["display_name"] == "Test Studio"

    cookies = response.headers.get_list("set-cookie")
    assert any("pp_access_token=" in cookie and "HttpOnly" in cookie for cookie in cookies)
    assert any("pp_refresh_token=" in cookie and "HttpOnly" in cookie for cookie in cookies)


def test_me_requires_a_session_cookie():
    client.cookies.clear()

    response = client.get("/auth/me")

    assert response.status_code == 401


def test_me_returns_authenticated_profile(monkeypatch):
    configure_fake_supabase(monkeypatch)
    client.cookies.set(auth.ACCESS_COOKIE, "test-access-token")

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["user"]["id"] == "test-user-id"
    assert response.json()["user"]["role"] == "photographer"

    client.cookies.clear()


def test_refresh_renews_session_cookies(monkeypatch):
    configure_fake_supabase(monkeypatch)
    client.cookies.set(auth.REFRESH_COOKIE, "test-refresh-token")

    response = client.post("/auth/refresh")

    assert response.status_code == 200
    assert response.json()["message"] == "Session refreshed."
    assert any(
        "pp_access_token=" in cookie
        for cookie in response.headers.get_list("set-cookie")
    )

    client.cookies.clear()


def test_logout_clears_session_cookies_and_signs_out(monkeypatch):
    fake = configure_fake_supabase(monkeypatch)

    client.cookies.set(auth.ACCESS_COOKIE, "test-access-token")
    client.cookies.set(auth.REFRESH_COOKIE, "test-refresh-token")

    response = client.post("/auth/logout")

    assert response.status_code == 200
    assert response.json()["message"] == "Signed out."
    assert fake.auth.session_set is True
    assert fake.auth.sign_out_called is True
    assert any(
        "pp_access_token=" in cookie and "Max-Age=0" in cookie
        for cookie in response.headers.get_list("set-cookie")
    )

    client.cookies.clear()