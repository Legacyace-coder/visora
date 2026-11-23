from types import SimpleNamespace
import base64
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from app.api import public_agents
from app.core.security import get_current_user
from app.main import app

client = TestClient(app)


class FakeClient:
    def __init__(self, value):
        self.value = value
        self.params = None

    def rpc(self, name, params):
        assert name == "lookup_public_agent"
        self.params = params
        return self

    def execute(self):
        return SimpleNamespace(data=self.value)


def test_agent_lookup_returns_only_public_fields(monkeypatch):
    fake = FakeClient({"display_name": "A Studio", "active": True, "photo": None, "email": "private@example.test"})
    monkeypatch.setattr(public_agents, "get_supabase_service_client", lambda: fake)
    response = client.get("/public/agents/a-abc-12345")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert fake.params == {"p_code": "A-ABC-12345"}
    assert response.json() == {"display_name": "A Studio", "active": True, "photo": None}


def test_agent_lookup_unknown_invalid_and_suspended(monkeypatch):
    fake = FakeClient(None)
    monkeypatch.setattr(public_agents, "get_supabase_service_client", lambda: fake)
    assert client.get("/public/agents/not-a-code").status_code == 422
    assert fake.params is None
    assert client.get("/public/agents/A-ABC-12345").status_code == 404
    fake.value = {"display_name": "A Studio", "active": False, "photo": None}
    assert client.get("/public/agents/A-ABC-12345").json()["active"] is False


def test_agent_lookup_rejects_bad_photo(monkeypatch):
    fake = FakeClient({"display_name": "A Studio", "active": True, "photo": {"mime_type": "image/png", "base64": "bad"}})
    monkeypatch.setattr(public_agents, "get_supabase_service_client", lambda: fake)
    assert client.get("/public/agents/A-ABC-12345").status_code == 502


def test_agent_lookup_returns_valid_photo(monkeypatch):
    buffer = BytesIO()
    metadata = PngInfo()
    metadata.add_text("private", "sensitive")
    Image.new("RGB", (1, 1), color="red").save(buffer, format="PNG", pnginfo=metadata)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    fake = FakeClient({"display_name": "A Studio", "active": True, "photo": {"mime_type": "image/png", "base64": encoded}})
    monkeypatch.setattr(public_agents, "get_supabase_service_client", lambda: fake)
    response = client.get("/public/agents/A-ABC-12345")
    assert response.status_code == 200
    assert response.json()["photo"]["mime_type"] == "image/png"
    with Image.open(BytesIO(base64.b64decode(response.json()["photo"]["base64"]))) as image:
        assert image.size == (1, 1)
        assert image.getpixel((0, 0)) == (255, 0, 0, 255)
        assert "private" not in image.info


def test_agent_lookup_does_not_report_failure_as_not_found(monkeypatch):
    def broken():
        raise RuntimeError("offline")
    monkeypatch.setattr(public_agents, "get_supabase_service_client", broken)
    assert client.get("/public/agents/A-ABC-12345").status_code == 502


class FakeAgentAdmin:
    def __init__(self):
        self.auth = SimpleNamespace(admin=self)
        self.payload = None
        self.profile = {"role": "agent", "agent_code": "A-ABC-12345"}

    def create_user(self, payload):
        self.payload = payload
        return SimpleNamespace(user=SimpleNamespace(id="00000000-0000-0000-0000-000000000001"))

    def table(self, name):
        assert name == "profiles"
        return self

    def select(self, fields):
        assert fields == "role,agent_code"
        return self

    def eq(self, field, value):
        assert field == "id" and value == "00000000-0000-0000-0000-000000000001"
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self.profile)


def test_only_admin_creates_agents_and_creation_is_verified(monkeypatch):
    fake = FakeAgentAdmin()
    monkeypatch.setattr(public_agents, "get_supabase_service_client", lambda: fake)
    payload = {"full_name": " Agent Name ", "display_name": " Agent ", "email": "AGENT@example.test", "password": "temporary-password"}
    try:
        app.dependency_overrides[get_current_user] = lambda: {"id": "admin-id", "role": "photographer"}
        assert client.post("/admin/agents", json=payload).status_code == 403
        assert fake.payload is None
        app.dependency_overrides[get_current_user] = lambda: {"id": "admin-id", "role": "admin"}
        response = client.post("/admin/agents", json=payload)
        assert response.status_code == 201
        assert response.json()["agent_code"] == "A-ABC-12345"
        assert fake.payload["email"] == "agent@example.test"
        assert fake.payload["user_metadata"]["account_type"] == "agent"
        assert fake.payload["app_metadata"] == {"visora_admin_agent": True, "visora_created_by": "admin-id"}
        assert fake.payload["email_confirm"] is True
        fake.profile = {"role": "photographer", "agent_code": None}
        assert client.post("/admin/agents", json=payload).status_code == 502
    finally:
        app.dependency_overrides.pop(get_current_user, None)
