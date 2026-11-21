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
        "expected_fee_total_cents": "375000",
        "expected_withdrawal_fee_cents": "225000",
        "expected_company_charge_cents": "150000",
        "expected_fee_recipient": "Example recipient",
    })
    assert response.status_code == 201
    assert response.json() == {"id": WITHDRAWAL_ID}
    assert calls == [("request_photographer_withdrawal", {
        "p_amount_cents": 1500000,
        "p_method": "USDT",
        "p_destination": "test-usdt-address",
        "p_expected_fee_total_cents": 375000,
        "p_expected_withdrawal_fee_cents": 225000,
        "p_expected_company_charge_cents": 150000,
        "p_expected_fee_recipient": "Example recipient",
    })]


def test_suspended_photographer_cannot_create_withdrawal(monkeypatch, client):
    set_role(monkeypatch, "photographer", suspended_at="2026-11-21T00:00:00Z")
    response = client.post("/photographer/withdrawals", json={
        "amount_cents": "1500000",
        "method": "USDT",
        "destination": "test-usdt-address",
        "expected_fee_total_cents": "375000",
        "expected_withdrawal_fee_cents": "225000",
        "expected_company_charge_cents": "150000",
        "expected_fee_recipient": "Example recipient",
    })
    assert response.status_code == 403


@pytest.mark.parametrize("role", ["admin", "agent"])
def test_fee_quote_requires_photographer(monkeypatch, client, role):
    set_role(monkeypatch, role)
    assert client.post("/photographer/withdrawals/fee-quote", json={"amount_cents": "1500200"}).status_code == 403


@pytest.mark.parametrize("exempt,total,withdrawal,company", [
    (False, "375100", "225000", "150100"),
    (True, "0", "0", "0"),
])
def test_fee_quote_returns_authoritative_amounts(monkeypatch, client, exempt, total, withdrawal, company):
    set_role(monkeypatch, "photographer")
    calls = []

    def rpc(_client, name, params):
        calls.append((name, params))
        return {
            "exempt": exempt, "fee_total_cents": total,
            "withdrawal_fee_cents": withdrawal, "company_charge_cents": company, "fee_recipient": "Example recipient",
        }

    monkeypatch.setattr(withdrawals, "get_user_client", lambda request: object())
    monkeypatch.setattr(withdrawals, "execute_rpc", rpc)
    response = client.post("/photographer/withdrawals/fee-quote", json={"amount_cents": "1500200"})
    assert response.status_code == 200
    assert response.json() == {
        "exempt": exempt, "fee_total_cents": total,
        "withdrawal_fee_cents": withdrawal, "company_charge_cents": company, "fee_recipient": "Example recipient",
    }
    assert calls == [("photographer_withdrawal_fee_quote", {"p_amount_cents": 1500200})]


def test_fee_quote_rejects_inconsistent_database_response(monkeypatch, client):
    set_role(monkeypatch, "photographer")
    monkeypatch.setattr(withdrawals, "get_user_client", lambda request: object())
    monkeypatch.setattr(withdrawals, "execute_rpc", lambda *args: {
        "exempt": True, "fee_total_cents": "100",
        "withdrawal_fee_cents": "50", "company_charge_cents": "50", "fee_recipient": None,
    })
    assert client.post("/photographer/withdrawals/fee-quote", json={"amount_cents": "1500200"}).status_code == 502


@pytest.mark.parametrize("code", ["VQ001", "VQ002"])
def test_withdrawal_reports_changed_quote_or_missing_recipient(monkeypatch, client, code):
    set_role(monkeypatch, "photographer")

    class RpcError(Exception):
        def __init__(self):
            self.code = code

    class Client:
        def rpc(self, name, params):
            raise RpcError()

    monkeypatch.setattr(withdrawals, "get_user_client", lambda request: Client())
    response = client.post("/photographer/withdrawals", json={
        "amount_cents": "1500000", "method": "USDT", "destination": "test",
        "expected_fee_total_cents": "375000", "expected_withdrawal_fee_cents": "225000",
        "expected_company_charge_cents": "150000", "expected_fee_recipient": "Example recipient",
    })
    assert response.status_code == 409
    assert ("changed" if code == "VQ001" else "not configured") in response.json()["detail"]


def test_withdrawal_list_preserves_large_amount_precision(monkeypatch):
    monkeypatch.setattr(withdrawals, "execute_rpc", lambda *args: [{
        "amount_cents": 9223372036854775807,
        "withdrawal_fee_cents": 225000, "company_charge_cents": 150000,
        "fee_total_cents": 0,
    }])
    record = withdrawals.list_withdrawals(object(), 0)["withdrawals"][0]
    assert record["amount_cents"] == "9223372036854775807"
    assert record["fee_total_cents"] == "0"


def test_withdrawal_requires_confirmed_fee_quote(monkeypatch, client):
    set_role(monkeypatch, "photographer")
    response = client.post("/photographer/withdrawals", json={
        "amount_cents": "1500000", "method": "USDT", "destination": "test",
    })
    assert response.status_code == 422


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
