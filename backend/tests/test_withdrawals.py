from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api import auth, withdrawals
from app.core import security
from app.main import app


WITHDRAWAL_ID = "00000000-0000-0000-0000-000000000099"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(security.auth, "get_supabase_client", lambda: object())
    with TestClient(app) as test_client:
        test_client.cookies.set(auth.ACCESS_COOKIE, "test-token")
        yield test_client


def set_role(monkeypatch, role, suspended_at=None):
    monkeypatch.setattr(
        security.auth,
        "get_profile_for_token",
        lambda client, token: {
            "id": "current-user",
            "role": role,
            "suspended_at": suspended_at,
        },
    )


@pytest.mark.parametrize("amount", ["0", "-1", "9223372036854775808"])
def test_withdrawal_request_validates_amount(amount):
    with pytest.raises(Exception):
        withdrawals.WithdrawalRequest(
            amount_cents=amount,
            method="USDT",
            destination="Test destination",
        )


def test_photographer_can_create_withdrawal(monkeypatch, client):
    set_role(monkeypatch, "photographer")
    calls = []

    class Rpc:
        def execute(self):
            return type("Result", (), {"data": WITHDRAWAL_ID})()

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return Rpc()

    monkeypatch.setattr(withdrawals, "get_user_client", lambda request: Client())
    response = client.post("/photographer/withdrawals", json={
        "amount_cents": "1500000",
        "method": "USDT",
        "destination": "test-usdt-address",
    })
    assert response.status_code == 201
    assert response.json() == {"id": WITHDRAWAL_ID}
    assert calls == [("request_photographer_withdrawal", {
        "p_amount_cents": 1500000,
        "p_method": "USDT",
        "p_destination": "test-usdt-address",
    })]


def test_suspended_photographer_cannot_create_withdrawal(monkeypatch, client):
    set_role(monkeypatch, "photographer", suspended_at="2026-11-21T00:00:00Z")
    response = client.post("/photographer/withdrawals", json={
        "amount_cents": "1500000",
        "method": "USDT",
        "destination": "test-usdt-address",
    })
    assert response.status_code == 403


@pytest.mark.parametrize("role", ["photographer", "agent"])
def test_fee_recipient_requires_admin(monkeypatch, client, role):
    set_role(monkeypatch, role)
    response = client.put("/admin/withdrawal-fee-recipient", json={"recipient": "Test account"})
    assert response.status_code == 403


def test_admin_receipt_actions_use_authoritative_rpc(monkeypatch, client):
    set_role(monkeypatch, "admin")
    calls = []

    class Rpc:
        def execute(self):
            return type("Result", (), {"data": True})()

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return Rpc()

    monkeypatch.setattr(withdrawals, "get_admin_client", lambda request, user: Client())
    fee = client.post(
        f"/admin/withdrawals/{WITHDRAWAL_ID}/fee",
        json={"receipt_reference": "fee-ref", "verified": True},
    )
    payout = client.post(
        f"/admin/withdrawals/{WITHDRAWAL_ID}/pay",
        json={"payout_receipt_reference": "payout-ref"},
    )
    assert fee.status_code == 200
    assert payout.status_code == 200
    assert ("record_withdrawal_fee_payment", {
        "p_request_id": WITHDRAWAL_ID,
        "p_receipt_reference": "fee-ref",
        "p_verified": True,
    }) in calls
