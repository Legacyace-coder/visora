import pytest

from fastapi.testclient import TestClient

from app.api import auth
from app.core import security
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_cookies():
    client.cookies.clear()
    yield
    client.cookies.clear()


def configure_user(monkeypatch, role):
    monkeypatch.setattr(
        security.auth,
        "get_supabase_client",
        lambda: object(),
    )

    monkeypatch.setattr(
        security.auth,
        "get_profile_for_token",
        lambda client, token: {
            "id": "test-user-id",
            "email": "test@example.com",
            "role": role,
            "display_name": "Test Account",
            "referral_code": None,
            "agent_code": None,
        },
    )

    client.cookies.set(auth.ACCESS_COOKIE, "test-access-token")


@pytest.mark.parametrize(
    ("role", "endpoint"),
    [
        ("photographer", "/dashboard/photographer"),
        ("agent", "/dashboard/agent"),
        ("admin", "/dashboard/admin"),
    ],
)
def test_each_role_can_access_its_own_dashboard(
    monkeypatch,
    role,
    endpoint,
):
    configure_user(monkeypatch, role)

    response = client.get(endpoint)

    assert response.status_code == 200
    assert response.json()["user"]["role"] == role


@pytest.mark.parametrize(
    ("role", "endpoint"),
    [
        ("photographer", "/dashboard/agent"),
        ("photographer", "/dashboard/admin"),
        ("agent", "/dashboard/photographer"),
        ("agent", "/dashboard/admin"),
        ("admin", "/dashboard/photographer"),
        ("admin", "/dashboard/agent"),
    ],
)
def test_role_cannot_access_another_dashboard(
    monkeypatch,
    role,
    endpoint,
):
    configure_user(monkeypatch, role)

    response = client.get(endpoint)

    assert response.status_code == 403


def test_dashboard_requires_authentication():
    response = client.get("/dashboard/photographer")

    assert response.status_code == 401