import logging
from datetime import date
from typing import Literal
from urllib.parse import quote
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from app.api import auth
from app.api.admin import get_admin_client
from app.api.photographer import BUCKET, get_user_client, require_photographer
from app.core.security import require_roles
from app.core.config import settings


router = APIRouter(tags=["Acquisitions and gallery"])
PUBLICATION_COLUMNS = (
    "id,offer_id,photo_id,photographer_id,title,attribution,expires_on,"
    "published_at,unpublished_at"
)


class OfferCreate(BaseModel):
    submission_id: UUID
    photo_ids: list[UUID] = Field(min_length=1, max_length=100)
    amount_cents: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    rights_type: Literal["license", "assignment"]
    exclusive: bool
    territory: str = Field(min_length=1, max_length=500)
    permitted_uses: str = Field(min_length=1, max_length=5000)
    attribution: str = Field(min_length=1, max_length=500)
    agreement_terms: str = Field(min_length=1, max_length=10000)
    expires_on: date | None = None
    gallery_permission: bool

    @field_validator("territory", "permitted_uses", "attribution", "agreement_terms", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("amount_cents")
    @classmethod
    def validate_amount(cls, value: str) -> str:
        if int(value) > 9223372036854775807:
            raise ValueError("Amount exceeds the supported wallet range.")
        return value

    @field_validator("photo_ids")
    @classmethod
    def validate_photo_ids(cls, values: list[UUID]) -> list[UUID]:
        if len(set(values)) != len(values):
            raise ValueError("Photographs must be unique.")
        return values


class OfferResponse(BaseModel):
    accept: bool
    confirm_terms: bool = False

    @model_validator(mode="after")
    def validate_consent(self):
        if self.accept and not self.confirm_terms:
            raise ValueError("Confirm the agreement before accepting.")
        return self


class PublicationCreate(BaseModel):
    offer_id: UUID
    photo_id: UUID


def execute_rpc(client, name: str, params: dict):
    try:
        return client.rpc(name, params).execute().data
    except Exception as error:
        logging.exception("Acquisition operation %s failed", name)
        code = getattr(error, "code", None)
        if code == "23505":
            raise HTTPException(
                status_code=409,
                detail="The offer or photograph has already been processed.",
            ) from error
        if code == "P0002":
            raise HTTPException(status_code=404, detail="The requested record was not found.") from error
        if code == "P1001":
            raise HTTPException(status_code=409, detail="An original photograph is unavailable; the action was not completed.") from error
        if code in {"22023", "23514", "23502"}:
            raise HTTPException(status_code=422, detail="The request does not meet the agreement requirements.") from error
        if code == "42501":
            raise HTTPException(status_code=403, detail="You cannot perform this action.") from error
        raise HTTPException(status_code=502, detail="The operation could not be completed.") from error


def list_offers(client, offset: int) -> dict:
    offers = execute_rpc(client, "list_acquisition_offers", {"p_offset": offset})
    if not isinstance(offers, list):
        logging.error("Acquisition offer list returned an invalid response")
        raise HTTPException(status_code=502, detail="Offers could not be loaded.")
    return {"offers": offers[:25], "has_more": len(offers) > 25}


def list_publications(client, offset: int, owner_id: str | None = None) -> dict:
    query = client.table("gallery_publications").select(PUBLICATION_COLUMNS)
    if owner_id is not None:
        query = query.eq("photographer_id", owner_id)
    result = query.order("published_at", desc=True).order("id", desc=True).range(offset, offset + 25).execute()
    publications = result.data or []
    return {"publications": publications[:25], "has_more": len(publications) > 25}


@router.get("/admin/acquisition-offers")
def admin_list_offers(
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
    offset: int = Query(default=0, ge=0),
):
    return list_offers(get_admin_client(request, current_user), offset)


@router.post("/admin/acquisition-offers", status_code=201)
def create_offer(
    payload: OfferCreate,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    client = get_admin_client(request, current_user)
    offer_id = execute_rpc(client, "create_acquisition_offer", {
        "p_submission_id": str(payload.submission_id),
        "p_photo_ids": [str(photo_id) for photo_id in payload.photo_ids],
        "p_amount_cents": payload.amount_cents,
        "p_rights_type": payload.rights_type,
        "p_exclusive": payload.exclusive,
        "p_territory": payload.territory,
        "p_permitted_uses": payload.permitted_uses,
        "p_attribution": payload.attribution,
        "p_agreement_terms": payload.agreement_terms,
        "p_expires_on": payload.expires_on.isoformat() if payload.expires_on else None,
        "p_gallery_permission": payload.gallery_permission,
    })
    if not offer_id:
        raise HTTPException(status_code=502, detail="The offer could not be created.")
    return {"id": offer_id}


@router.post("/admin/acquisition-offers/{offer_id}/cancel")
def cancel_offer(
    offer_id: UUID,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = execute_rpc(get_admin_client(request, current_user), "cancel_acquisition_offer", {
        "p_offer_id": str(offer_id),
    })
    if result is not True:
        raise HTTPException(status_code=409, detail="The offer is no longer pending.")
    return {"message": "Offer cancelled."}


@router.get("/photographer/acquisition-offers")
def photographer_list_offers(
    request: Request,
    current_user: dict = Depends(require_photographer),
    offset: int = Query(default=0, ge=0),
):
    return list_offers(get_user_client(request), offset)


@router.post("/photographer/acquisition-offers/{offer_id}/response")
def respond_to_offer(
    offer_id: UUID,
    payload: OfferResponse,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    result = execute_rpc(get_user_client(request), "respond_to_acquisition_offer", {
        "p_offer_id": str(offer_id),
        "p_accept": payload.accept,
        "p_confirm_terms": payload.confirm_terms,
    })
    if result not in ("accepted", "declined"):
        raise HTTPException(status_code=502, detail="The offer response could not be saved.")
    return {"status": result}


@router.get("/photographer/wallet")
def get_wallet(
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    result = (
        get_user_client(request).table("wallet_accounts")
        .select("currency,available_balance_cents,pending_balance_cents")
        .eq("photographer_id", current_user["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        return {"wallet": None}
    wallet = result.data[0]
    return {"wallet": {
        "currency": wallet["currency"],
        "available_balance_cents": str(wallet["available_balance_cents"]),
        "pending_balance_cents": str(wallet["pending_balance_cents"]),
    }}


@router.get("/admin/publications")
def admin_list_publications(
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
    offset: int = Query(default=0, ge=0),
):
    return list_publications(get_admin_client(request, current_user), offset)


@router.post("/admin/publications", status_code=201)
def publish_photo(
    payload: PublicationCreate,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    publication_id = execute_rpc(get_admin_client(request, current_user), "publish_acquired_photo", {
        "p_offer_id": str(payload.offer_id),
        "p_photo_id": str(payload.photo_id),
    })
    if not publication_id:
        raise HTTPException(status_code=502, detail="The photograph could not be published.")
    return {"id": publication_id}


@router.post("/admin/publications/{publication_id}/unpublish")
def unpublish_photo(
    publication_id: UUID,
    request: Request,
    current_user: dict = Depends(require_roles("admin")),
):
    result = execute_rpc(get_admin_client(request, current_user), "unpublish_gallery_photo", {
        "p_publication_id": str(publication_id),
    })
    if result is not True:
        raise HTTPException(status_code=409, detail="The publication is no longer active.")
    return {"message": "Photograph unpublished."}


@router.get("/photographer/publications")
def photographer_list_publications(
    request: Request,
    current_user: dict = Depends(require_photographer),
    offset: int = Query(default=0, ge=0),
):
    return list_publications(get_user_client(request), offset, current_user["id"])


@router.get("/gallery")
def public_gallery(offset: int = Query(default=0, ge=0)):
    return list_publications(auth.get_supabase_client(), offset)


@router.get("/gallery/{publication_id}/image")
def public_gallery_image(publication_id: UUID):
    public = auth.get_supabase_client()
    result = (
        public.table("gallery_publications")
        .select("photo_id,photographer_id")
        .eq("id", str(publication_id))
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Publication not found.")
    publication = result.data[0]
    try:
        service = auth.get_supabase_service_client()
        photo = (
            service.table("photographer_photos")
            .select("storage_path,mime_type")
            .eq("id", publication["photo_id"])
            .eq("photographer_id", publication["photographer_id"])
            .limit(1)
            .execute()
        )
        if not photo.data:
            raise RuntimeError("Published photograph metadata not found.")
        record = photo.data[0]
        path = record["storage_path"]
        if (
            not path.startswith(f"{publication['photographer_id']}/")
            or "\\" in path
            or any(part in {"", ".", ".."} for part in path.split("/"))
            or record["mime_type"] not in {"image/jpeg", "image/png", "image/webp"}
        ):
            raise RuntimeError("Invalid published photograph metadata.")
        storage_url = (
            f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
            f"{BUCKET}/{quote(path, safe='/')}"
        )
        storage_client = httpx.Client(timeout=30.0, follow_redirects=False, trust_env=False)
        storage_response = None
        try:
            request = storage_client.build_request(
                "GET",
                storage_url,
                headers={
                    "apikey": settings.supabase_secret_key,
                    "Authorization": f"Bearer {settings.supabase_secret_key}",
                },
            )
            storage_response = storage_client.send(request, stream=True)
            storage_response.raise_for_status()
        except Exception:
            if storage_response is not None:
                storage_response.close()
            storage_client.close()
            raise
    except Exception as error:
        logging.exception("Published photograph retrieval failed")
        raise HTTPException(status_code=502, detail="The published photograph is unavailable.") from error

    def stream_original():
        try:
            yield from storage_response.iter_bytes(chunk_size=65536)
        except httpx.HTTPError:
            logging.exception("Published photograph stream failed")
            raise
        finally:
            storage_response.close()
            storage_client.close()

    return StreamingResponse(
        stream_original(),
        media_type=record["mime_type"],
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox",
        },
    )
