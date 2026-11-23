import base64
import binascii
import json
import logging
from typing import Literal
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field, model_validator

from app.api.photographer import detect_image_type, get_user_client
from app.api.workspace import MAX_PROFILE_PHOTO_BYTES, valid_profile_photo
from app.core.config import settings
from app.core.security import require_roles


router = APIRouter(tags=["Partnership applications"])
logger = logging.getLogger(__name__)
MAX_AGREEMENT_BYTES = 2 * 1024 * 1024


class PartnershipReview(BaseModel):
    approve: bool
    reason: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def require_rejection_reason(self):
        self.reason = self.reason.strip()
        if not self.approve and not self.reason:
            raise ValueError("A rejection reason is required.")
        return self


class ProofDeletion(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def require_reason(self):
        self.reason = self.reason.strip()
        if not self.reason:
            raise ValueError("A deletion reason is required.")
        return self


def proof_cipher() -> Fernet:
    try:
        return Fernet(settings.partnership_proof_encryption_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        logger.error("Partnership proof encryption key is missing or invalid.")
        raise HTTPException(503, "Partnership verification is not configured.") from error


def partnership_rpc(request: Request, name: str, params: dict):
    try:
        return get_user_client(request).rpc(name, params).execute().data
    except Exception as error:
        code = getattr(error, "code", None)
        if code == "42501":
            raise HTTPException(403, "You cannot perform this action.") from error
        if code == "23505":
            raise HTTPException(409, "An application already exists or has been reviewed.") from error
        if code == "P0002":
            raise HTTPException(404, "Application not found.") from error
        if code in {"22023", "23514"}:
            raise HTTPException(422, "The application or decision is invalid.") from error
        logger.error("Partnership operation %s failed: %s", name, type(error).__name__)
        raise HTTPException(502, "The partnership operation could not be completed.") from error


@router.post("/admin/agreements/{kind}", status_code=201)
async def upload_agreement(
    kind: Literal["partnership", "acquisition"],
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles("admin")),
):
    content = await file.read(MAX_AGREEMENT_BYTES + 1)
    if len(content) > MAX_AGREEMENT_BYTES:
        raise HTTPException(413, "Agreement PDFs must be 2 MB or smaller.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(422, "Choose a PDF agreement.")
    result = partnership_rpc(request, "upload_agreement_document", {
        "p_kind": kind, "p_base64": base64.b64encode(content).decode("ascii"),
    })
    try:
        document_id = str(UUID(result))
    except (ValueError, TypeError, AttributeError) as error:
        logger.error("Agreement upload returned an invalid response")
        raise HTTPException(502, "Agreement upload could not be confirmed.") from error
    return {"id": document_id}


@router.get("/agreements/{kind}")
def download_agreement(
    kind: Literal["partnership", "acquisition"],
    request: Request,
    document_id: UUID | None = None,
    current_user: dict = Depends(require_roles("admin", "photographer")),
):
    result = partnership_rpc(request, "get_agreement_document", {
        "p_kind": kind, "p_id": str(document_id) if document_id else None,
    })
    if result is None:
        raise HTTPException(404, "No agreement has been uploaded yet.")
    try:
        if not isinstance(result, dict):
            raise ValueError("Invalid agreement")
        UUID(result["id"])
        content = base64.b64decode("".join(result["base64"].split()), validate=True)
        if not content.startswith(b"%PDF-") or len(content) > MAX_AGREEMENT_BYTES:
            raise ValueError("Invalid PDF")
    except (KeyError, TypeError, ValueError, AttributeError, binascii.Error) as error:
        logger.error("Agreement download returned an invalid response: %s", error)
        raise HTTPException(502, "Agreement could not be downloaded.") from error
    return Response(content, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{kind}-agreement.pdf"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.get("/admin/partners/weekly-progress")
def admin_partner_weekly_progress(
    request: Request, offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_roles("admin")),
):
    rows = partnership_rpc(request, "admin_partner_weekly_progress", {"p_offset": offset})
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        logger.error("Partner weekly progress returned an invalid response")
        raise HTTPException(502, "Partner progress could not be loaded.")
    return {"partners": rows[:25], "has_more": len(rows) > 25}


@router.post("/photographer/partnership-applications", status_code=201)
async def submit_application(
    request: Request,
    code: str = Form(default=""),
    file: UploadFile | None = File(default=None),
    current_user: dict = Depends(require_roles("photographer")),
):
    code = code.strip()
    if len(code) > 128:
        raise HTTPException(422, "Card codes must be 128 characters or fewer.")
    if bool(code) == bool(file and file.filename):
        raise HTTPException(422, "Provide either a card code or a card image.")
    if code:
        proof_type = "code"
        proof = {"code": code, "photographer_id": current_user["id"]}
    else:
        if file is None:
            raise HTTPException(422, "Provide a card image.")
        content = await file.read(MAX_PROFILE_PHOTO_BYTES + 1)
        if len(content) > MAX_PROFILE_PHOTO_BYTES:
            raise HTTPException(413, "Card images must be 2 MB or smaller.")
        image_type = detect_image_type(content)
        if not image_type or not valid_profile_photo(content, image_type[0]):
            raise HTTPException(422, "Choose a valid JPEG, PNG or WebP card image.")
        proof_type = "image"
        proof = {
            "mime_type": image_type[0], "base64": base64.b64encode(content).decode("ascii"),
            "photographer_id": current_user["id"],
        }
    ciphertext = proof_cipher().encrypt(json.dumps(proof).encode("utf-8")).decode("ascii")
    result = partnership_rpc(request, "submit_partnership_application", {
        "p_proof_type": proof_type,
        "p_encrypted_proof": ciphertext,
    })
    if not isinstance(result, str):
        logger.error("Partnership application returned an invalid response")
        raise HTTPException(502, "The application could not be submitted.")
    return {"id": result}


def list_applications(request: Request, offset: int) -> dict:
    applications = partnership_rpc(request, "list_partnership_applications", {"p_offset": offset})
    if not isinstance(applications, list):
        logger.error("Partnership application list returned an invalid response")
        raise HTTPException(502, "Applications could not be loaded.")
    return {"applications": applications[:25], "has_more": len(applications) > 25}


@router.get("/photographer/partnership-applications")
def photographer_applications(
    request: Request, offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_roles("photographer")),
):
    return list_applications(request, offset)


@router.get("/admin/partnership-applications")
def admin_applications(
    request: Request, offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_roles("admin")),
):
    return list_applications(request, offset)


@router.get("/admin/partnership-applications/{application_id}/proof")
def get_application_proof(
    application_id: UUID, request: Request, response: Response,
    current_user: dict = Depends(require_roles("admin")),
):
    cipher = proof_cipher()
    result = partnership_rpc(request, "view_partnership_proof", {"p_application_id": str(application_id)})
    if not isinstance(result, dict) or result.get("proof_type") not in {"code", "image"} or not isinstance(result.get("encrypted_proof"), str):
        logger.error("Partnership proof returned an invalid response")
        raise HTTPException(502, "The proof could not be loaded.")
    try:
        proof = json.loads(cipher.decrypt(result["encrypted_proof"].encode("ascii")))
    except (InvalidToken, ValueError, UnicodeError) as error:
        logger.error("Partnership proof could not be decrypted")
        raise HTTPException(502, "The proof could not be decrypted.") from error
    if not isinstance(proof, dict) or not isinstance(result.get("photographer_id"), str) or proof.get("photographer_id") != result["photographer_id"]:
        raise HTTPException(502, "The proof is invalid.")
    if result["proof_type"] == "code":
        if not isinstance(proof.get("code"), str) or not proof["code"].strip() or len(proof["code"]) > 128:
            raise HTTPException(502, "The proof is invalid.")
        proof = {"code": proof["code"]}
    else:
        if proof.get("mime_type") not in {"image/jpeg", "image/png", "image/webp"} or not isinstance(proof.get("base64"), str):
            raise HTTPException(502, "The proof is invalid.")
        try:
            content = base64.b64decode(proof["base64"], validate=True)
        except (ValueError, binascii.Error) as error:
            raise HTTPException(502, "The proof is invalid.") from error
        if len(content) > MAX_PROFILE_PHOTO_BYTES or not valid_profile_photo(content, proof["mime_type"]):
            raise HTTPException(502, "The proof is invalid.")
        proof = {"mime_type": proof["mime_type"], "base64": proof["base64"]}
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return {"proof_type": result["proof_type"], "proof": proof}


@router.put("/admin/partnership-applications/{application_id}/review")
def review_application(
    application_id: UUID, payload: PartnershipReview, request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = partnership_rpc(request, "review_partnership_application", {
        "p_application_id": str(application_id), "p_approve": payload.approve, "p_reason": payload.reason,
    })
    if not isinstance(result, dict) or result.get("status") not in {"approved", "rejected"}:
        logger.error("Partnership review returned an invalid response")
        raise HTTPException(502, "The decision could not be saved.")
    return result


@router.post("/admin/partnership-applications/{application_id}/delete-proof")
def delete_application_proof(
    application_id: UUID, payload: ProofDeletion, request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = partnership_rpc(request, "delete_partnership_proof", {
        "p_application_id": str(application_id), "p_reason": payload.reason,
    })
    if result is not True:
        logger.error("Partnership proof deletion returned an invalid response")
        raise HTTPException(502, "The proof could not be deleted.")
    return {"message": "Proof deleted; the application and audit record are retained."}
