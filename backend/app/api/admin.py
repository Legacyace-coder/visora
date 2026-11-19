from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.api import auth
from app.core.security import require_roles

router = APIRouter(tags=["Platform Settings"])

SETTING_KEY = "partnership_purchase_url"


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
    return client


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

