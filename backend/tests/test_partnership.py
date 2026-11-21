import json
import base64
from io import BytesIO

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from PIL import Image

from app.api import auth, partnership
from app.core import security
from app.main import app


APPLICATION_ID = "00000000-0000-0000-0000-000000000001"


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


def test_application_encrypts_card_code(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    key = Fernet.generate_key()
    monkeypatch.setattr(partnership.settings, "partnership_proof_encryption_key", key.decode())
    calls = []

    def rpc(request, name, params):
        calls.append((name, params))
        return APPLICATION_ID

    monkeypatch.setattr(partnership, "partnership_rpc", rpc)
    response = client.post("/photographer/partnership-applications", data={"code": "private-card-code"})
    assert response.status_code == 201
    name, params = calls[0]
    assert name == "submit_partnership_application"
    assert params["p_proof_type"] == "code"
    assert "private-card-code" not in params["p_encrypted_proof"]
    assert json.loads(Fernet(key).decrypt(params["p_encrypted_proof"].encode())) == {"code": "private-card-code", "photographer_id": "current-user"}


def test_application_requires_one_proof_and_configured_key(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    assert client.post("/photographer/partnership-applications", data={"code": ""}).status_code == 422
    response = client.post("/photographer/partnership-applications", data={"code": "code"}, files={"file": ("card.png", b"image", "image/png")})
    assert response.status_code == 422
    invalid_code = "x" * 129
    response = client.post("/photographer/partnership-applications", data={"code": invalid_code})
    assert response.status_code == 422
    assert invalid_code not in response.text
    monkeypatch.setattr(partnership.settings, "partnership_proof_encryption_key", "")
    assert client.post("/photographer/partnership-applications", data={"code": "code"}).status_code == 503


def test_image_proof_is_validated_and_encrypted(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    key = Fernet.generate_key()
    monkeypatch.setattr(partnership.settings, "partnership_proof_encryption_key", key.decode())
    calls = []
    def rpc(request, name, params):
        calls.append(params)
        return APPLICATION_ID

    monkeypatch.setattr(partnership, "partnership_rpc", rpc)
    output = BytesIO()
    Image.new("RGB", (1, 1)).save(output, format="PNG")
    image = output.getvalue()
    assert client.post("/photographer/partnership-applications", files={"file": ("card.png", image, "image/png")}).status_code == 201
    proof = json.loads(Fernet(key).decrypt(calls[0]["p_encrypted_proof"].encode()))
    assert proof == {"mime_type": "image/png", "base64": base64.b64encode(image).decode(), "photographer_id": "current-user"}
    assert client.post("/photographer/partnership-applications", files={"file": ("card.png", b"\x89PNG\r\n\x1a\nbad", "image/png")}).status_code == 422
    assert len(calls) == 1


@pytest.mark.parametrize("role", ["agent", "photographer"])
def test_proof_and_review_are_admin_only(client, monkeypatch, role):
    set_role(monkeypatch, role)
    assert client.get(f"/admin/partnership-applications/{APPLICATION_ID}/proof").status_code == 403
    assert client.put(f"/admin/partnership-applications/{APPLICATION_ID}/review", json={"approve": True}).status_code == 403


def test_admin_proof_is_decrypted_only_after_audited_rpc(client, monkeypatch):
    set_role(monkeypatch, "admin")
    key = Fernet.generate_key()
    monkeypatch.setattr(partnership.settings, "partnership_proof_encryption_key", key.decode())
    ciphertext = Fernet(key).encrypt(b'{"code":"private","photographer_id":"owner"}').decode()
    calls = []
    def rpc(request, name, params):
        calls.append((name, params))
        return {"proof_type": "code", "encrypted_proof": ciphertext, "photographer_id": "owner"}

    monkeypatch.setattr(partnership, "partnership_rpc", rpc)
    response = client.get(f"/admin/partnership-applications/{APPLICATION_ID}/proof")
    assert response.status_code == 200
    assert response.json() == {"proof_type": "code", "proof": {"code": "private"}}
    assert response.headers["cache-control"] == "private, no-store"
    assert calls == [("view_partnership_proof", {"p_application_id": APPLICATION_ID})]


def test_admin_proof_rejects_ciphertext_copied_from_another_owner(client, monkeypatch):
    set_role(monkeypatch, "admin")
    key = Fernet.generate_key()
    monkeypatch.setattr(partnership.settings, "partnership_proof_encryption_key", key.decode())
    ciphertext = Fernet(key).encrypt(b'{"code":"private","photographer_id":"other"}').decode()
    monkeypatch.setattr(partnership, "partnership_rpc", lambda *args: {
        "proof_type": "code", "encrypted_proof": ciphertext, "photographer_id": "owner",
    })
    assert client.get(f"/admin/partnership-applications/{APPLICATION_ID}/proof").status_code == 502


def test_rejection_requires_reason(client, monkeypatch):
    set_role(monkeypatch, "admin")
    response = client.put(f"/admin/partnership-applications/{APPLICATION_ID}/review", json={"approve": False, "reason": "  "})
    assert response.status_code == 422


def test_proof_deletion_requires_admin_and_reason(client, monkeypatch):
    set_role(monkeypatch, "photographer")
    assert client.post(f"/admin/partnership-applications/{APPLICATION_ID}/delete-proof", json={"reason": "cleanup"}).status_code == 403
    set_role(monkeypatch, "admin")
    assert client.post(f"/admin/partnership-applications/{APPLICATION_ID}/delete-proof", json={"reason": "  "}).status_code == 422
    monkeypatch.setattr(partnership, "partnership_rpc", lambda *args: True)
    assert client.post(f"/admin/partnership-applications/{APPLICATION_ID}/delete-proof", json={"reason": "cleanup"}).status_code == 200
