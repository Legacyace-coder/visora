import logging
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from app.api import auth
from app.core.security import require_roles

router = APIRouter(tags=["Platform Settings"])

SETTING_KEY = "partnership_purchase_url"
SUBMISSION_COLUMNS = (
    "id,photographer_id,submission_type,collection_id,title,cover_note,status,"
    "submitted_at,reviewed_at,reviewed_by,photographer_feedback"
)


class SubmissionReview(BaseModel):
    expected_status: Literal["pending", "under_review"]
    status: Literal["under_review", "accepted", "rejected"]
    photographer_feedback: str | None = Field(default=None, max_length=5000)

    @field_validator("photographer_feedback", mode="before")
    @classmethod
    def normalize_feedback(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_transition(self):
        if self.status == "under_review" and self.expected_status != "pending":
            raise ValueError("This submission is already under review.")
        if self.status == "rejected" and not self.photographer_feedback:
            raise ValueError("Feedback is required when rejecting a submission.")
        return self


class PurchaseUrlUpdate(BaseModel):
    url: str = Field(default="", max_length=2048)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        if not value:
            return value

        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ValueError("Enter a valid HTTP or HTTPS URL.")

        return value


def get_admin_client(request: Request, current_user: dict):
    token = request.cookies.get(auth.ACCESS_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="You are not signed in.")

    client = auth.get_supabase_client()
    client.postgrest.auth(token)
    client.storage._headers["Authorization"] = f"Bearer {token}"
    return client


@router.get("/admin/submissions")
def list_admin_submissions(
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
    offset: int = Query(default=0, ge=0),
):
    client = get_admin_client(request, current_user)
    result = (
        client.table("submissions")
        .select(SUBMISSION_COLUMNS)
        .order("submitted_at", desc=True)
        .order("id", desc=True)
        .range(offset, offset + 100)
        .execute()
    )
    submissions = result.data or []
    return {"submissions": submissions[:100], "has_more": len(submissions) > 100}


@router.get("/admin/submissions/{submission_id}")
def get_admin_submission(
    submission_id: UUID,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    client = get_admin_client(request, current_user)
    result = (
        client.table("submissions")
        .select(SUBMISSION_COLUMNS)
        .eq("id", str(submission_id))
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    items = []
    offset = 0
    while True:
        page = (
            client.table("submission_items")
            .select("photo_id")
            .eq("submission_id", str(submission_id))
            .order("photo_id")
            .range(offset, offset + 99)
            .execute()
        ).data or []
        items.extend(page)
        if len(page) < 100:
            break
        offset += len(page)

    photos = []
    photo_ids = [item["photo_id"] for item in items]
    for offset in range(0, len(photo_ids), 100):
        photo_result = (
            client.table("photographer_photos")
            .select("id,title,description,original_filename")
            .in_("id", photo_ids[offset:offset + 100])
            .execute()
        )
        photos.extend(photo_result.data or [])
    if len(photos) != len(photo_ids):
        logging.error("Submitted photographs unavailable for submission %s", submission_id)
        raise HTTPException(status_code=502, detail="Submitted photographs could not be loaded.")

    notes = client.rpc(
        "admin_submission_private_notes", {"p_submission_id": str(submission_id)}
    ).execute()
    return {"submission": result.data[0], "photos": photos, "private_notes": notes.data}


@router.get("/admin/submissions/{submission_id}/photos/{photo_id}/preview")
def get_admin_submission_photo_preview(
    submission_id: UUID,
    photo_id: UUID,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    client = get_admin_client(request, current_user)
    item = (
        client.table("submission_items")
        .select("photo_id")
        .eq("submission_id", str(submission_id))
        .eq("photo_id", str(photo_id))
        .limit(1)
        .execute()
    )
    if not item.data:
        raise HTTPException(status_code=404, detail="Submitted photograph not found.")

    photo = (
        client.table("photographer_photos")
        .select("storage_path")
        .eq("id", str(photo_id))
        .limit(1)
        .execute()
    )
    if not photo.data:
        raise HTTPException(status_code=404, detail="Submitted photograph not found.")
    try:
        signed = client.storage.from_("photographer-originals").create_signed_url(
            photo.data[0]["storage_path"], 300
        )
        if not signed.get("signedURL"):
            raise RuntimeError("Storage did not return a signed URL.")
    except Exception as error:
        logging.exception("Submission photograph preview creation failed")
        raise HTTPException(status_code=502, detail="Photograph preview is unavailable.") from error
    return {"preview_url": signed["signedURL"], "expires_in": 300}


@router.put("/admin/submissions/{submission_id}/review")
def review_submission(
    submission_id: UUID,
    payload: SubmissionReview,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    client = get_admin_client(request, current_user)
    try:
        result = client.rpc(
            "review_photographer_submission",
            {
                "p_submission_id": str(submission_id),
                "p_expected_status": payload.expected_status,
                "p_status": payload.status,
                "p_photographer_feedback": payload.photographer_feedback,
            },
        ).execute()
    except Exception as error:
        logging.exception("Submission review update failed")
        raise HTTPException(status_code=502, detail="The review could not be saved.") from error
    if not result.data:
        raise HTTPException(
            status_code=409,
            detail="The submission changed or is no longer available. Reload the review queue.",
        )
    return {"submission": result.data}


@router.get("/public-settings/partnership-purchase")
def get_public_partnership_purchase_url():
    try:
        client = auth.get_supabase_client()
        result = (
            client.table("platform_public_settings")
            .select("setting_value")
            .eq("setting_key", SETTING_KEY)
            .maybe_single()
            .execute()
        )
        return {"url": (result.data or {}).get("setting_value", "")}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Partnership purchase settings are temporarily unavailable.",
        )


@router.get("/admin/settings/partnership-purchase")
def get_admin_partnership_purchase_url(
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    try:
        client = get_admin_client(request, current_user)
        result = (
            client.table("platform_public_settings")
            .select("setting_value,updated_at")
            .eq("setting_key", SETTING_KEY)
            .maybe_single()
            .execute()
        )
        data = result.data or {}
        return {
            "url": data.get("setting_value", ""),
            "updated_at": data.get("updated_at"),
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="The purchase link setting could not be loaded.",
        )


@router.put("/admin/settings/partnership-purchase")
def update_admin_partnership_purchase_url(
    payload: PurchaseUrlUpdate,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    try:
        client = get_admin_client(request, current_user)
        result = (
            client.table("platform_public_settings")
            .update({
                "setting_value": payload.url,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user["id"],
            })
            .eq("setting_key", SETTING_KEY)
            .select("setting_value")
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail="The purchase link could not be saved.",
            )

        return {
            "message": "Partnership purchase link saved.",
            "url": result.data[0]["setting_value"],
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="The purchase link could not be saved. Please try again.",
        )

