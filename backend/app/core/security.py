from fastapi import Depends, HTTPException, Request

from app.api import auth


def get_current_user(request: Request) -> dict:
    access_token = request.cookies.get(auth.ACCESS_COOKIE)

    if not access_token:
        raise HTTPException(401, "You are not signed in.")

    client = auth.get_supabase_client()
    return auth.get_profile_for_token(client, access_token)


def require_roles(*allowed_roles: str):
    def role_guard(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="Your account does not have permission to access this area.",
            )

        return current_user

    return role_guard