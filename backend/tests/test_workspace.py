import base64
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from supabase_auth.errors import AuthApiError

from app.api import auth, workspace
from app.core import security
from app.main import app


def png_image():
    output = BytesIO()
    Image.new("RGB", (1, 1), color="red").save(output, format="PNG")
    return output.getvalue()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(security.auth, "get_supabase_client", lambda: object())
    with TestClient(app) as test_client:
        test_client.cookies.set(auth.ACCESS_COOKIE, "test-token")
        yield test_client


def set_role(monkeypatch, role):
    monkeypatch.setattr(
        security.auth, "get_profile_for_token",
        lambda client, token: {"id": "current-user", "role": role},
    )


def test_display_name_is_trimmed_and_passed_to_identity_scoped_rpc(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    calls = []

    def rpc(request, name, params):
        calls.append((name, params))
        return "Jane"

    monkeypatch.setattr(workspace, "workspace_rpc", rpc)
    response = client.put("/account/display-name", json={"display_name": " Jane "})
    assert response.status_code == 200
    assert response.json() == {"display_name": "Jane"}
    assert calls == [("update_workspace_display_name", {"p_display_name": "Jane"})]
    assert client.put("/account/display-name", json={"display_name": "   "}).status_code == 422


def test_referral_report_denies_non_agents(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    assert client.get("/agent/referrals").status_code == 403


@pytest.mark.parametrize("role", ["agent", "admin"])
def test_weekly_target_requires_photographer(client, monkeypatch, role):
    set_role(monkeypatch, role)
    assert client.get("/photographer/weekly-target").status_code == 403


def test_weekly_target_returns_partner_progress(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    calls = []

    def rpc(request, name, params):
        calls.append((name, params))
        return {
            "is_partner": True, "target": 200, "approved_count": 215,
            "week_start": "2026-11-16T00:00:00+00:00",
            "week_end": "2026-11-23T00:00:00+00:00",
        }

    monkeypatch.setattr(workspace, "workspace_rpc", rpc)
    response = client.get("/photographer/weekly-target")
    assert response.status_code == 200
    assert response.json()["approved_count"] == 215
    assert response.json()["target"] == 200
    assert calls == [("photographer_weekly_target", {})]


def test_weekly_target_for_non_partner(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    monkeypatch.setattr(workspace, "workspace_rpc", lambda *args: {"is_partner": False})
    assert client.get("/photographer/weekly-target").json() == {"is_partner": False}


@pytest.mark.parametrize("role", ["agent", "admin"])
def test_acquisition_limit_requires_photographer(client, monkeypatch, role):
    set_role(monkeypatch, role)
    assert client.get("/photographer/acquisition-limit").status_code == 403


@pytest.mark.parametrize("result", [
    {"is_partner": False, "limit": 160, "acquired_count": 159, "remaining": 1},
    {"is_partner": False, "limit": 160, "acquired_count": 165, "remaining": 0},
    {"is_partner": True, "limit": 160, "acquired_count": 200, "remaining": 0},
])
def test_acquisition_limit_returns_progress(client, monkeypatch, result):
    set_role(monkeypatch, "photographer")
    calls = []

    def rpc(request, name, params):
        calls.append((name, params))
        return result

    monkeypatch.setattr(workspace, "workspace_rpc", rpc)
    response = client.get("/photographer/acquisition-limit")
    assert response.status_code == 200
    assert response.json() == result
    assert calls == [("photographer_acquisition_limit", {})]


@pytest.mark.parametrize("result", [
    None,
    {"is_partner": False, "limit": 160, "acquired_count": 159, "remaining": 2},
    {"is_partner": "false", "limit": 160, "acquired_count": 0, "remaining": 160},
])
def test_acquisition_limit_rejects_invalid_progress(client, monkeypatch, result):
    set_role(monkeypatch, "photographer")
    monkeypatch.setattr(workspace, "workspace_rpc", lambda *args: result)
    assert client.get("/photographer/acquisition-limit").status_code == 502


@pytest.mark.parametrize("result", [
    None,
    {"is_partner": True, "target": 200, "approved_count": -1},
    {"is_partner": True, "target": 200, "approved_count": 1,
     "week_start": "2026-11-23T00:00:00Z", "week_end": "2026-11-16T00:00:00Z"},
])
def test_weekly_target_rejects_invalid_database_response(client, monkeypatch, result):
    set_role(monkeypatch, "photographer")
    monkeypatch.setattr(workspace, "workspace_rpc", lambda *args: result)
    assert client.get("/photographer/weekly-target").status_code == 502


def test_referral_report_paginates_without_disclosing_extra_row(client, monkeypatch):
    set_role(monkeypatch, "agent")
    calls = []

    def rpc(request, name, params):
        calls.append((name, params))
        return {
            "total": 26, "with_submissions": 2, "with_accepted_submissions": 1,
            "photographers": [{"display_name": str(i)} for i in range(26)],
        }

    monkeypatch.setattr(workspace, "workspace_rpc", rpc)
    response = client.get("/agent/referrals?offset=25")
    assert response.status_code == 200
    assert len(response.json()["photographers"]) == 25
    assert response.json()["has_more"] is True
    assert calls == [("agent_referral_report", {"p_offset": 25})]


def test_referral_report_surfaces_invalid_database_response(client, monkeypatch):
    set_role(monkeypatch, "agent")
    monkeypatch.setattr(workspace, "workspace_rpc", lambda *args: {"photographers": []})
    assert client.get("/agent/referrals").status_code == 502


@pytest.mark.parametrize("role", ["agent", "photographer"])
def test_admin_report_denies_non_admins(client, monkeypatch, role):
    set_role(monkeypatch, role)
    assert client.get("/admin/workspace-report").status_code == 403


def test_admin_report_returns_counts_and_paginated_accounts(client, monkeypatch):
    set_role(monkeypatch, "admin")
    monkeypatch.setattr(workspace, "workspace_rpc", lambda *args: {
        "photographers": 26, "agents": 1, "submissions": 2, "pending_submissions": 1,
        "accounts": [{"id": str(i), "role": "photographer", "display_name": "Test"} for i in range(26)],
    })
    response = client.get("/admin/workspace-report")
    assert response.status_code == 200
    assert response.json()["photographers"] == 26
    assert len(response.json()["accounts"]) == 25
    assert response.json()["has_more"] is True


def test_profile_photo_upload_validates_type_and_size(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    calls = []

    def rpc(request, name, params):
        calls.append((name, params))
        return True

    monkeypatch.setattr(workspace, "workspace_rpc", rpc)
    image = png_image()
    response = client.put("/account/photo", files={"file": ("avatar.png", image, "image/png")})
    assert response.status_code == 200
    assert calls == [("set_workspace_profile_photo", {
        "p_mime_type": "image/png", "p_base64": base64.b64encode(image).decode(),
    })]
    assert client.put("/account/photo", files={"file": ("bad.png", b"not an image", "image/png")}).status_code == 422
    assert client.put("/account/photo", files={"file": ("bad.png", b"\x89PNG\r\n\x1a\nimage", "image/png")}).status_code == 422
    assert client.put("/account/photo", files={"file": ("large.png", image + b"\x00" * 2097152, "image/png")}).status_code == 413
    assert len(calls) == 1


def test_profile_photo_read_and_delete(client, monkeypatch):
    set_role(monkeypatch, "agent")
    image = png_image()
    def rpc(request, name, params):
        if name == "get_workspace_profile_photo":
            return {"mime_type": "image/png", "base64": base64.b64encode(image).decode()}
        assert name == "delete_workspace_profile_photo"
        return True

    monkeypatch.setattr(workspace, "workspace_rpc", rpc)
    response = client.get("/account/photo")
    assert response.content == image
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert client.delete("/account/photo").status_code == 200


def test_profile_photo_rejects_malformed_database_content(client, monkeypatch):
    set_role(monkeypatch, "agent")
    monkeypatch.setattr(workspace, "workspace_rpc", lambda *args: {"mime_type": "image/png", "base64": "!!!"})
    assert client.get("/account/photo").status_code == 502


class CredentialAuth:
    def __init__(self, fail=False, user_id="current-user"):
        self.fail = fail
        self.user_id = user_id
        self.updates = []
        self.session = SimpleNamespace(access_token="new-access", refresh_token="new-refresh", expires_in=3600)

    def sign_in_with_password(self, payload):
        assert payload["email"] == "current@example.test"
        if self.fail:
            raise AuthApiError("Invalid login", 400, "invalid_credentials")
        return SimpleNamespace(user=SimpleNamespace(id=self.user_id), session=self.session)

    def update_user(self, attributes):
        self.updates.append(attributes)
        return SimpleNamespace(user=SimpleNamespace(id=self.user_id, email="current@example.test"))


def credential_client(monkeypatch, fake):
    monkeypatch.setattr(
        security.auth, "get_profile_for_token",
        lambda client, token: {"id": "current-user", "role": "agent", "email": "current@example.test"},
    )
    monkeypatch.setattr(auth, "get_supabase_client", lambda: SimpleNamespace(auth=fake))
    monkeypatch.setattr(auth.settings, "app_env", "test")


def test_credential_update_requires_current_password(client, monkeypatch):
    fake = CredentialAuth(fail=True)
    credential_client(monkeypatch, fake)
    response = client.put("/account/credentials", json={"current_password": "wrong", "new_password": "newpass123"})
    assert response.status_code == 401
    assert fake.updates == []


def test_credential_update_refuses_mismatched_identity(client, monkeypatch):
    fake = CredentialAuth(user_id="other-user")
    credential_client(monkeypatch, fake)
    response = client.put("/account/credentials", json={"current_password": "current", "new_password": "newpass123"})
    assert response.status_code == 401
    assert fake.updates == []


def test_password_update_clears_cookies_after_success(client, monkeypatch):
    fake = CredentialAuth()
    credential_client(monkeypatch, fake)
    response = client.put("/account/credentials", json={"current_password": "current", "new_password": "newpass123"})
    assert response.status_code == 200
    assert response.json()["sign_in_required"] is True
    assert fake.updates == [{"password": "newpass123"}]
    assert any("pp_access_token=" in cookie and "Max-Age=0" in cookie for cookie in response.headers.get_list("set-cookie"))


def test_email_update_keeps_actual_account_email_until_confirmed(client, monkeypatch):
    fake = CredentialAuth()
    credential_client(monkeypatch, fake)
    response = client.put("/account/credentials", json={"current_password": "current", "new_email": " New@Example.test "})
    assert response.status_code == 200
    assert response.json()["email"] == "current@example.test"
    assert fake.updates == [{"email": "new@example.test"}]
    assert any("pp_refresh_token=new-refresh" in cookie for cookie in response.headers.get_list("set-cookie"))
