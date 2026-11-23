import base64
import binascii
from io import BytesIO
import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from PIL import Image, ImageOps
from pydantic import BaseModel, Field, StrictBool, ValidationError, field_validator

from app.api.auth import RegistrationRequest, get_supabase_service_client
from app.api.workspace import MAX_PROFILE_PHOTO_BYTES, valid_profile_photo
from app.core.security import require_roles

router = APIRouter(tags=["Public agent verification"])
logger = logging.getLogger(__name__)


class PublicPhoto(BaseModel):
    mime_type: str
    base64: str


class PublicAgent(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    active: StrictBool
    photo: PublicPhoto | None


class AgentCreation(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name", "display_name", mode="before")
    @classmethod
    def normalize_names(cls, value):
        return RegistrationRequest.normalize_names(value)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return RegistrationRequest.normalize_email(value)


@router.post("/admin/agents", status_code=201)
def create_agent(payload: AgentCreation, current_user: dict = Depends(require_roles("admin"))):
    try:
        client = get_supabase_service_client()
    except HTTPException as error:
        raise HTTPException(503, "Agent registration is not configured.") from error
    try:
        result = client.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {
                "account_type": "agent",
                "full_name": payload.full_name,
                "display_name": payload.display_name,
                "referral_code": None,
                "agent_code": None,
                "referred_by": None,
                "referred_by_agent": None,
            },
            "app_metadata": {"visora_admin_agent": True, "visora_created_by": str(current_user["id"])},
        })
        if not result.user:
            raise ValueError("No account returned")
        user_id = str(UUID(str(result.user.id)))
        profile = client.table("profiles").select("role,agent_code").eq("id", user_id).maybe_single().execute().data
        if not isinstance(profile, dict) or profile.get("role") != "agent" or not isinstance(profile.get("agent_code"), str) \
           or not re.fullmatch(r"A-[A-Z0-9]{3}-[A-Z0-9]{5}", profile["agent_code"]):
            raise ValueError("Agent profile not confirmed")
    except Exception as error:
        logger.error("Agent creation could not be confirmed: %s", type(error).__name__)
        raise HTTPException(502, "Agent creation could not be confirmed. The account may have been created; check accounts before retrying.") from error
    return {"id": user_id, "agent_code": profile["agent_code"]}


@router.get("/public/agents/{agent_code}")
def verify_agent(agent_code: str, response: Response):
    response.headers["Cache-Control"] = "no-store"
    no_cache = {"Cache-Control": "no-store"}
    code = agent_code.strip().upper()
    if not re.fullmatch(r"A-[A-Z0-9]{3}-[A-Z0-9]{5}", code):
        raise HTTPException(422, "Enter a valid agent code, for example A-ABC-12345.", headers=no_cache)
    try:
        result = get_supabase_service_client().rpc("lookup_public_agent", {"p_code": code}).execute().data
    except HTTPException as error:
        raise HTTPException(error.status_code, "Agent verification is not configured.", headers=no_cache) from error
    except Exception as error:
        logger.error("Agent verification failed: %s", type(error).__name__)
        raise HTTPException(502, "Agent verification is temporarily unavailable.", headers=no_cache) from error
    if result is None:
        raise HTTPException(404, "No agent was found for this code.", headers=no_cache)
    try:
        agent = PublicAgent.model_validate(result)
        if agent.photo:
            image = base64.b64decode("".join(agent.photo.base64.split()), validate=True)
            if len(image) > MAX_PROFILE_PHOTO_BYTES or not valid_profile_photo(image, agent.photo.mime_type):
                raise ValueError("Invalid photo")
            with Image.open(BytesIO(image)) as source:
                portrait = ImageOps.exif_transpose(source)
                portrait.thumbnail((512, 512))
                portrait = portrait.convert("RGBA")
                portrait.info.clear()
                output = BytesIO()
                portrait.save(output, format="PNG")
            agent.photo.mime_type = "image/png"
            agent.photo.base64 = base64.b64encode(output.getvalue()).decode("ascii")
    except (ValidationError, ValueError, binascii.Error, OSError, Image.DecompressionBombError) as error:
        logger.error("Agent verification returned invalid data: %s", type(error).__name__)
        raise HTTPException(502, "Agent verification is temporarily unavailable.", headers=no_cache) from error
    return agent
