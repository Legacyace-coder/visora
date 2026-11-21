import base64
import binascii
from io import BytesIO
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
from supabase_auth.errors import AuthApiError

from app.api import auth
from app.api.photographer import detect_image_type, get_user_client
from app.core.security import get_current_user, require_roles


router = APIRouter(tags=["Workspace"])
logger = logging.getLogger(__name__)
MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024
MAX_PROFILE_PHOTO_PIXELS = 20_000_000


def valid_profile_photo(content: bytes, mime_type: str) -> bool:
    detected = detect_image_type(content)
    if not detected or detected[0] != mime_type:
        return False
    try:
        with Image.open(BytesIO(content)) as image:
            if image.width * image.height > MAX_PROFILE_PHOTO_PIXELS:
                return False
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, ValueError):
        return False
    return True


class DisplayNameUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("display_name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class CredentialUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_email: str | None = Field(default=None, min_length=5, max_length=254)
    new_password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("new_email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return auth.RegistrationRequest.normalize_email(value) if value is not None else None


def workspace_rpc(request: Request, name: str, params: dict):
    try:
        return get_user_client(request).rpc(name, params).execute().data
    except Exception as error:
        logger.exception("Workspace operation %s failed", name)
        if getattr(error, "code", None) == "42501":
            raise HTTPException(403, "You cannot perform this action.") from error
        if getattr(error, "code", None) == "22023":
            raise HTTPException(422, "Invalid workspace request.") from error
        raise HTTPException(502, "The workspace operation could not be completed.") from error


@router.put("/account/display-name")
def update_display_name(
    payload: DisplayNameUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    name = workspace_rpc(request, "update_workspace_display_name", {"p_display_name": payload.display_name})
    if not isinstance(name, str) or not name:
        logger.error("Display name update returned an invalid response")
        raise HTTPException(502, "The display name could not be updated.")
    return {"display_name": name}


@router.put("/account/photo")
async def upload_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    content = await file.read(MAX_PROFILE_PHOTO_BYTES + 1)
    if len(content) > MAX_PROFILE_PHOTO_BYTES:
        raise HTTPException(413, "Profile photos must be 2 MB or smaller.")
    image_type = detect_image_type(content)
    if not image_type or not valid_profile_photo(content, image_type[0]):
        raise HTTPException(422, "Choose a JPEG, PNG or WebP image.")
    result = workspace_rpc(request, "set_workspace_profile_photo", {
        "p_mime_type": image_type[0],
        "p_base64": base64.b64encode(content).decode("ascii"),
    })
    if result is not True:
        logger.error("Profile photo update returned an invalid response")
        raise HTTPException(502, "The profile photo could not be saved.")
    return {"message": "Profile photo saved."}


@router.get("/account/photo")
def get_profile_photo(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    result = workspace_rpc(request, "get_workspace_profile_photo", {})
    if result is None:
        raise HTTPException(404, "No profile photo has been uploaded.")
    if (
        not isinstance(result, dict)
        or result.get("mime_type") not in {"image/jpeg", "image/png", "image/webp"}
        or not isinstance(result.get("base64"), str)
    ):
        logger.error("Profile photo returned an invalid response")
        raise HTTPException(502, "The profile photo could not be loaded.")
    try:
        content = base64.b64decode(result["base64"].replace("\n", ""), validate=True)
    except (KeyError, TypeError, binascii.Error) as error:
        logger.exception("Profile photo content is invalid")
        raise HTTPException(502, "The profile photo could not be loaded.") from error
    if len(content) > MAX_PROFILE_PHOTO_BYTES or not valid_profile_photo(content, result["mime_type"]):
        logger.error("Profile photo content does not match its type")
        raise HTTPException(502, "The profile photo could not be loaded.")
    return Response(content, media_type=result["mime_type"], headers={
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.delete("/account/photo")
def delete_profile_photo(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    result = workspace_rpc(request, "delete_workspace_profile_photo", {})
    if not isinstance(result, bool):
        logger.error("Profile photo deletion returned an invalid response")
        raise HTTPException(502, "The profile photo could not be removed.")
    return {"message": "Profile photo removed." if result else "No profile photo to remove."}


@router.put("/account/credentials")
def update_credentials(
    payload: CredentialUpdate,
    response: Response,
    current_user: dict = Depends(get_current_user),
):
    if (payload.new_email is None) == (payload.new_password is None):
        raise HTTPException(422, "Change either your email or password in one request.")
    if payload.new_password is not None and payload.new_password == payload.current_password:
        raise HTTPException(422, "Choose a new password different from your current password.")
    email = current_user.get("email")
    if not isinstance(email, str) or not email:
        raise HTTPException(409, "Your account has no email address for password verification.")
    client = auth.get_supabase_client()
    try:
        verified = client.auth.sign_in_with_password({
            "email": email,
            "password": payload.current_password,
        })
    except AuthApiError as error:
        if error.status in (400, 401) and error.code == "invalid_credentials":
            raise HTTPException(401, "Your current password is incorrect.") from error
        logger.warning("Account reauthentication failed with status %s", error.status)
        raise HTTPException(503, "Account verification is temporarily unavailable.") from error
    except Exception as error:
        logger.error("Account reauthentication failed: %s", type(error).__name__)
        raise HTTPException(503, "Account verification is temporarily unavailable.") from error
    if not verified.user or not verified.session or verified.user.id != current_user["id"]:
        raise HTTPException(401, "Account verification failed.")
    try:
        if payload.new_email is not None:
            updated = client.auth.update_user({"email": payload.new_email})
        else:
            updated = client.auth.update_user({"password": payload.new_password})
    except AuthApiError as error:
        if error.status in (400, 422):
            raise HTTPException(422, "The new credential does not meet authentication requirements.") from error
        logger.warning("Account credential update failed with status %s", error.status)
        raise HTTPException(503, "Account settings are temporarily unavailable.") from error
    except Exception as error:
        logger.error("Account credential update failed: %s", type(error).__name__)
        raise HTTPException(503, "Account settings are temporarily unavailable.") from error
    if not updated.user or updated.user.id != current_user["id"]:
        logger.error("Credential update returned an invalid account")
        raise HTTPException(502, "Account settings could not be updated.")
    if payload.new_password is not None:
        auth.clear_session_cookies(response)
        return {"message": "Password changed. Sign in again with your new password.", "sign_in_required": True}
    auth.set_session_cookies(response, verified.session)
    return {
        "message": "Email change requested. Follow any confirmation instructions sent by email.",
        "email": updated.user.email,
        "sign_in_required": False,
    }


@router.get("/agent/referrals")
def agent_referrals(
    request: Request,
    current_user: dict = Depends(require_roles("agent")),
    offset: int = Query(default=0, ge=0),
):
    result = workspace_rpc(request, "agent_referral_report", {"p_offset": offset})
    if (
        not isinstance(result, dict)
        or not isinstance(result.get("photographers"), list)
        or any(not isinstance(result.get(key), int) for key in (
            "total", "with_submissions", "with_accepted_submissions"
        ))
    ):
        logger.error("Agent referral report returned an invalid response")
        raise HTTPException(502, "The referral report could not be loaded.")
    photographers = result["photographers"]
    return {
        "total": result["total"],
        "with_submissions": result["with_submissions"],
        "with_accepted_submissions": result["with_accepted_submissions"],
        "photographers": photographers[:25],
        "has_more": len(photographers) > 25,
    }


@router.get("/admin/workspace-report")
def admin_workspace_report(
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
    offset: int = Query(default=0, ge=0),
):
    result = workspace_rpc(request, "admin_workspace_report", {"p_offset": offset})
    if (
        not isinstance(result, dict)
        or not isinstance(result.get("accounts"), list)
        or any(not isinstance(result.get(key), int) for key in (
            "photographers", "agents", "submissions", "pending_submissions"
        ))
    ):
        logger.error("Administrator workspace report returned an invalid response")
        raise HTTPException(502, "The workspace report could not be loaded.")
    accounts = result["accounts"]
    return {
        "photographers": result["photographers"],
        "agents": result["agents"],
        "submissions": result["submissions"],
        "pending_submissions": result["pending_submissions"],
        "accounts": accounts[:25],
        "has_more": len(accounts) > 25,
    }
