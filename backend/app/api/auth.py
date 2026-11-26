import logging
import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from supabase import create_client

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

ACCESS_COOKIE = "pp_access_token"
REFRESH_COOKIE = "pp_refresh_token"
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30


class RegistrationRequest(BaseModel):
    account_type: Literal["photographer", "agent"]
    full_name: str = Field(min_length=2, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    captcha_token: str = Field(min_length=1, max_length=4096)
    referral_code: str | None = None
    agent_code: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("full_name", "display_name", mode="before")
    @classmethod
    def normalize_names(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("referral_code", "agent_code")
    @classmethod
    def normalize_codes(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return value.strip().upper()


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    captcha_token: str = Field(min_length=1, max_length=4096)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address.")
        return value


def get_supabase_client():
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Authentication service is not configured.")

    return create_client(
        settings.supabase_url,
        settings.supabase_publishable_key,
    )


def get_supabase_service_client():
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(
            503,
            "Referral verification is not configured.",
        )

    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
    )


def verify_referral_codes(
    referral_code: str | None,
    agent_code: str | None,
) -> tuple[dict | None, dict | None]:
    if not referral_code and not agent_code:
        return None, None

    try:
        client = get_supabase_service_client()
        photographer = None
        agent = None

        if referral_code:
            result = (
                client.table("profiles")
                .select("id,role")
                .eq("referral_code", referral_code)
                .eq("role", "photographer")
                .maybe_single()
                .execute()
            )
            photographer = result.data
            if not photographer:
                raise HTTPException(
                    400,
                    "The photographer referral code was not found.",
                )

        if agent_code:
            result = (
                client.table("profiles")
                .select("id,role")
                .eq("agent_code", agent_code)
                .eq("role", "agent")
                .maybe_single()
                .execute()
            )
            agent = result.data
            if not agent:
                raise HTTPException(400, "The agent code was not found.")

        return photographer, agent
    except HTTPException:
        raise
    except Exception:
        logger.exception("Referral code verification failed.")
        raise HTTPException(
            503,
            "Referral verification is temporarily unavailable.",
        )


def persist_referral_links(
    user_id: str,
    referring_photographer: dict | None,
    referring_agent: dict | None,
) -> None:
    links = {}
    if referring_photographer:
        links["referred_by"] = referring_photographer["id"]
    if referring_agent:
        links["referred_by_agent"] = referring_agent["id"]

    if not links:
        return

    try:
        result = (
            get_supabase_service_client()
            .table("profiles")
            .update(links)
            .eq("id", user_id)
            .select("id")
            .execute()
        )
        if not result.data:
            raise RuntimeError("The new account profile was not available.")
    except Exception:
        logger.exception("Verified referral links could not be saved for user_id=%s", user_id)
        raise HTTPException(
            503,
            "The account was created, but its referral details could not be saved. Contact support.",
        )


def set_session_cookies(response: Response, session) -> None:
    secure = settings.app_env.lower() not in {"development", "dev", "test"}
    access_age = max(int(session.expires_in or 3600), 60)

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=session.access_token,
        max_age=access_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=session.refresh_token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookies(response: Response) -> None:
    secure = settings.app_env.lower() not in {"development", "dev", "test"}

    for cookie_name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(
            key=cookie_name,
            path="/",
            httponly=True,
            secure=secure,
            samesite="lax",
        )


def get_profile_for_token(client, access_token: str) -> dict:
    try:
        auth_result = client.auth.get_user(access_token)
        user = auth_result.user

        if not user:
            raise HTTPException(401, "Your session is invalid or has expired.")

        # Use the authenticated user's JWT so profile RLS remains enforced.
        client.postgrest.auth(access_token)

        result = (
            client.table("profiles")
            .select("id,role,display_name,referral_code,agent_code,suspended_at,suspension_reason")
            .eq("id", user.id)
            .maybe_single()
            .execute()
        )

        profile = result.data
        if not profile:
            raise HTTPException(403, "No platform profile is associated with this account.")

        return {
            "id": profile["id"],
            "email": user.email,
            "role": profile["role"],
            "display_name": profile["display_name"],
            "referral_code": profile.get("referral_code"),
            "agent_code": profile.get("agent_code"),
            "suspended_at": profile.get("suspended_at"),
            "suspension_reason": profile.get("suspension_reason"),
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Authenticated profile lookup failed.")
        raise HTTPException(401, "Your session is invalid or has expired.")


@router.get("/captcha-config")
def captcha_config() -> dict:
    site_key = settings.turnstile_site_key.strip()
    return {
        "enabled": bool(site_key),
        "site_key": site_key or None,
    }


@router.post("/register", status_code=201)
def register_account(payload: RegistrationRequest) -> dict:
    if payload.account_type == "agent":
        raise HTTPException(
            403,
            "Agent accounts can only be created by an administrator.",
        )

    if payload.referral_code and not re.fullmatch(
        r"P-[A-Z0-9]{3}-[A-Z0-9]{5}",
        payload.referral_code,
    ):
        raise HTTPException(400, "The photographer referral code format is invalid.")

    if payload.agent_code and not re.fullmatch(
        r"A-[A-Z0-9]{3}-[A-Z0-9]{5}",
        payload.agent_code,
    ):
        raise HTTPException(400, "The agent code format is invalid.")

    referring_photographer, referring_agent = verify_referral_codes(
        payload.referral_code,
        payload.agent_code,
    )

    metadata = {
        "account_type": payload.account_type,
        "full_name": payload.full_name,
        "display_name": payload.display_name,
        "referral_code": payload.referral_code,
        "agent_code": payload.agent_code,
        "referred_by": referring_photographer["id"] if referring_photographer else None,
        "referred_by_agent": referring_agent["id"] if referring_agent else None,
    }

    try:
        client = get_supabase_client()
        result = client.auth.sign_up({
            "email": payload.email,
            "password": payload.password,
            "options": {
                "data": metadata,
                "captcha_token": payload.captcha_token,
                "email_redirect_to": (
                    f"{settings.frontend_url.rstrip('/')}/login.html"
                ),
            },
        })

        if not result.user:
            raise HTTPException(400, "Registration could not be completed.")

        persist_referral_links(
            result.user.id,
            referring_photographer,
            referring_agent,
        )

        confirmation_required = result.session is None

        return {
            "message": (
                "Account created. Check your email to confirm your address."
                if confirmation_required
                else "Account created successfully. You can now sign in."
            ),
            "confirmation_required": confirmation_required,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Supabase registration failed for account_type=%s",
            payload.account_type,
        )
        raise HTTPException(
            400,
            "Registration failed. Check your details and referral codes, or try again later.",
        )


@router.post("/login")
def login(payload: LoginRequest, response: Response) -> dict:
    try:
        client = get_supabase_client()
        result = client.auth.sign_in_with_password({
            "email": payload.email,
            "password": payload.password,
            "options": {
                "captcha_token": payload.captcha_token,
            },
        })

        if not result.user or not result.session:
            raise HTTPException(
                401,
                "Sign-in could not be completed. Check your details and email confirmation.",
            )

        profile = get_profile_for_token(
            client,
            result.session.access_token,
        )

        set_session_cookies(response, result.session)

        return {
            "message": "Signed in successfully.",
            "user": profile,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Supabase sign-in failed.")
        raise HTTPException(
            401,
            "Sign-in failed. Check your email, password, and email confirmation.",
        )


@router.get("/me")
def get_current_account(request: Request) -> dict:
    access_token = request.cookies.get(ACCESS_COOKIE)

    if not access_token:
        raise HTTPException(401, "You are not signed in.")

    client = get_supabase_client()
    profile = get_profile_for_token(client, access_token)

    return {"user": profile}


@router.post("/refresh")
def refresh_session(request: Request, response: Response) -> dict:
    refresh_token = request.cookies.get(REFRESH_COOKIE)

    if not refresh_token:
        raise HTTPException(401, "Your session has expired. Please sign in again.")

    try:
        client = get_supabase_client()
        result = client.auth.refresh_session(refresh_token)

        if not result.user or not result.session:
            raise HTTPException(401, "Your session has expired. Please sign in again.")

        profile = get_profile_for_token(
            client,
            result.session.access_token,
        )

        set_session_cookies(response, result.session)

        return {
            "message": "Session refreshed.",
            "user": profile,
        }

    except HTTPException:
        raise
    except Exception:
        logger.exception("Session refresh failed.")
        clear_session_cookies(response)
        raise HTTPException(401, "Your session has expired. Please sign in again.")


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    access_token = request.cookies.get(ACCESS_COOKIE)
    refresh_token = request.cookies.get(REFRESH_COOKIE)

    if access_token and refresh_token:
        try:
            client = get_supabase_client()
            client.auth.set_session(access_token, refresh_token)
            client.auth.sign_out()
        except Exception:
            # Always clear this browser's cookies, even if remote revocation fails.
            logger.exception("Supabase sign-out/revocation failed.")

    clear_session_cookies(response)

    return {"message": "Signed out."}