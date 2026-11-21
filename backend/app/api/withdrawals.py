import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.api import auth
from app.api.admin import get_admin_client
from app.api.photographer import get_user_client
from app.core.security import require_roles


router = APIRouter(tags=["Withdrawals"])
logger = logging.getLogger(__name__)


class WithdrawalAmount(BaseModel):
    amount_cents: str = Field(pattern=r"^[1-9][0-9]{0,18}$")

    @field_validator("amount_cents")
    @classmethod
    def validate_amount(cls, value: str) -> str:
        if int(value) > 9223372036854775807:
            raise ValueError("Amount exceeds the supported withdrawal range.")
        return value


class WithdrawalRequest(WithdrawalAmount):
    method: str
    destination: str = Field(min_length=1, max_length=1000)
    expected_fee_total_cents: str = Field(pattern=r"^(0|[1-9][0-9]{0,18})$")
    expected_withdrawal_fee_cents: str = Field(pattern=r"^(0|[1-9][0-9]{0,18})$")
    expected_company_charge_cents: str = Field(pattern=r"^(0|[1-9][0-9]{0,18})$")
    expected_fee_recipient: str | None = Field(max_length=1000)

    @field_validator("method")
    @classmethod
    def validate_method(cls, value: str) -> str:
        value = value.strip()
        if value not in {"USDT", "bank_transfer", "cash_delivery"}:
            raise ValueError("Choose USDT, bank transfer, or cash delivery.")
        return value

    @field_validator("destination", mode="before")
    @classmethod
    def normalize_destination(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("expected_fee_total_cents", "expected_withdrawal_fee_cents", "expected_company_charge_cents")
    @classmethod
    def validate_expected_fee(cls, value: str) -> str:
        if int(value) > 9223372036854775807:
            raise ValueError("Fee exceeds the supported withdrawal range.")
        return value


class WithdrawalFeeQuote(BaseModel):
    exempt: bool = Field(strict=True)
    fee_total_cents: str = Field(pattern=r"^(0|[1-9][0-9]{0,18})$")
    withdrawal_fee_cents: str = Field(pattern=r"^(0|[1-9][0-9]{0,18})$")
    company_charge_cents: str = Field(pattern=r"^(0|[1-9][0-9]{0,18})$")
    fee_recipient: str | None


class ReceiptUpdate(BaseModel):
    receipt_reference: str = Field(min_length=1, max_length=1000)
    verified: bool = False

    @field_validator("receipt_reference", mode="before")
    @classmethod
    def normalize_receipt(cls, value):
        return value.strip() if isinstance(value, str) else value


class WithdrawalDecision(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    refund_receipt_reference: str | None = Field(default=None, max_length=1000)

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("refund_receipt_reference", mode="before")
    @classmethod
    def normalize_refund(cls, value):
        return value.strip() or None if isinstance(value, str) else value


class PayoutUpdate(BaseModel):
    payout_receipt_reference: str = Field(min_length=1, max_length=1000)

    @field_validator("payout_receipt_reference", mode="before")
    @classmethod
    def normalize_receipt(cls, value):
        return value.strip() if isinstance(value, str) else value


class FeeRecipientUpdate(BaseModel):
    recipient: str = Field(default="", max_length=1000)

    @field_validator("recipient", mode="before")
    @classmethod
    def normalize_recipient(cls, value):
        return value.strip() if isinstance(value, str) else value


def execute_rpc(client, name: str, params: dict):
    try:
        return client.rpc(name, params).execute().data
    except Exception as error:
        logger.exception("Withdrawal operation %s failed", name)
        code = getattr(error, "code", None)
        if code == "42501":
            raise HTTPException(403, "You cannot perform this action.") from error
        if code == "23505":
            raise HTTPException(409, "The withdrawal is already being processed.") from error
        if code == "VQ001":
            raise HTTPException(409, "The withdrawal fee has changed. Request a new quote.") from error
        if code == "VQ002":
            raise HTTPException(409, "The fee recipient is not configured. Contact Visora.") from error
        if code in {"22023", "23514", "23502"}:
            raise HTTPException(422, "The withdrawal request is not valid.") from error
        raise HTTPException(502, "The withdrawal operation could not be completed.") from error


def list_withdrawals(client, offset: int) -> dict:
    result = execute_rpc(client, "list_withdrawal_requests", {"p_offset": offset})
    if not isinstance(result, list):
        logger.error("Withdrawal list returned an invalid response")
        raise HTTPException(502, "Withdrawals could not be loaded.")
    records = []
    for item in result[:25]:
        if not isinstance(item, dict):
            logger.error("Withdrawal list returned an invalid record")
            raise HTTPException(502, "Withdrawals could not be loaded.")
        record = dict(item)
        for field in ("amount_cents", "withdrawal_fee_cents", "company_charge_cents", "fee_total_cents"):
            value = record.get(field)
            if value is None and field != "amount_cents":
                continue
            if (type(value) is not int and not isinstance(value, str)) or not str(value).isdigit():
                logger.error("Withdrawal list returned an invalid %s", field)
                raise HTTPException(502, "Withdrawals could not be loaded.")
            record[field] = str(value)
        records.append(record)
    return {"withdrawals": records, "has_more": len(result) > 25}


@router.get("/withdrawal-settings")
def withdrawal_settings(
    request: Request,
    current_user: dict = Depends(require_roles("photographer", "admin")),
):
    client = get_admin_client(request, current_user) if current_user["role"] == "admin" else get_user_client(request)
    result = execute_rpc(client, "get_withdrawal_settings", {})
    if not isinstance(result, dict):
        logger.error("Withdrawal settings returned an invalid response")
        raise HTTPException(502, "Withdrawal settings could not be loaded.")
    return result


@router.post("/photographer/withdrawals", status_code=201)
def create_withdrawal(
    payload: WithdrawalRequest,
    request: Request,
    current_user: dict = Depends(require_roles("photographer")),
):
    if current_user.get("suspended_at"):
        raise HTTPException(403, "Your account is suspended.")
    request_id = execute_rpc(get_user_client(request), "request_photographer_withdrawal", {
        "p_amount_cents": int(payload.amount_cents),
        "p_method": payload.method,
        "p_destination": payload.destination,
        "p_expected_fee_total_cents": int(payload.expected_fee_total_cents),
        "p_expected_withdrawal_fee_cents": int(payload.expected_withdrawal_fee_cents),
        "p_expected_company_charge_cents": int(payload.expected_company_charge_cents),
        "p_expected_fee_recipient": payload.expected_fee_recipient,
    })
    if not isinstance(request_id, str):
        logger.error("Withdrawal creation returned an invalid response")
        raise HTTPException(502, "The withdrawal request could not be confirmed. Refresh withdrawals before submitting again.")
    return {"id": request_id}


@router.post("/photographer/withdrawals/fee-quote")
def withdrawal_fee_quote(
    payload: WithdrawalAmount,
    request: Request,
    current_user: dict = Depends(require_roles("photographer")),
):
    if current_user.get("suspended_at"):
        raise HTTPException(403, "Your account is suspended.")
    result = execute_rpc(get_user_client(request), "photographer_withdrawal_fee_quote", {
        "p_amount_cents": int(payload.amount_cents),
    })
    try:
        quote = WithdrawalFeeQuote.model_validate(result)
        if (int(quote.fee_total_cents) != int(quote.withdrawal_fee_cents) + int(quote.company_charge_cents)
                or int(quote.fee_total_cents) > 9223372036854775807
                or (quote.exempt and quote.fee_total_cents != "0")):
            raise ValueError("Invalid fee quote")
    except (ValidationError, ValueError) as error:
        logger.error("Withdrawal fee quote returned an invalid response: %s", error)
        raise HTTPException(502, "The withdrawal fee could not be calculated.") from error
    return quote


@router.get("/photographer/withdrawals")
def photographer_withdrawals(
    request: Request,
    current_user: dict = Depends(require_roles("photographer")),
    offset: int = Query(default=0, ge=0),
):
    return list_withdrawals(get_user_client(request), offset)


@router.get("/admin/withdrawals")
def admin_withdrawals(
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
    offset: int = Query(default=0, ge=0),
):
    return list_withdrawals(get_admin_client(request, current_user), offset)


@router.put("/admin/withdrawal-fee-recipient")
def update_fee_recipient(
    payload: FeeRecipientUpdate,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = execute_rpc(get_admin_client(request, current_user), "set_withdrawal_fee_recipient", {
        "p_recipient": payload.recipient,
    })
    if result is not True:
        raise HTTPException(502, "The fee recipient could not be saved.")
    return {"message": "Fee recipient saved."}


@router.post("/admin/withdrawals/{withdrawal_id}/fee")
def record_fee(
    withdrawal_id: UUID,
    payload: ReceiptUpdate,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = execute_rpc(get_admin_client(request, current_user), "record_withdrawal_fee_payment", {
        "p_request_id": str(withdrawal_id),
        "p_receipt_reference": payload.receipt_reference,
        "p_verified": payload.verified,
    })
    if result is not True:
        raise HTTPException(409, "The withdrawal fee could not be recorded.")
    return {"message": "Fee payment recorded."}


@router.post("/admin/withdrawals/{withdrawal_id}/reject")
def reject_withdrawal(
    withdrawal_id: UUID,
    payload: WithdrawalDecision,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = execute_rpc(get_admin_client(request, current_user), "reject_withdrawal_request", {
        "p_request_id": str(withdrawal_id),
        "p_reason": payload.reason,
        "p_refund_receipt_reference": payload.refund_receipt_reference,
    })
    if result is not True:
        raise HTTPException(409, "The withdrawal could not be rejected.")
    return {"message": "Withdrawal rejected."}


@router.post("/admin/withdrawals/{withdrawal_id}/pay")
def pay_withdrawal(
    withdrawal_id: UUID,
    payload: PayoutUpdate,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = execute_rpc(get_admin_client(request, current_user), "pay_withdrawal_request", {
        "p_request_id": str(withdrawal_id),
        "p_payout_receipt_reference": payload.payout_receipt_reference,
    })
    if result is not True:
        raise HTTPException(409, "The withdrawal could not be paid.")
    return {"message": "Withdrawal payout recorded."}
