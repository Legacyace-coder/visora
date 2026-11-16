from fastapi import APIRouter, Depends

from app.core.security import require_roles

router = APIRouter(prefix="/dashboard", tags=["Dashboards"])


@router.get("/photographer")
def photographer_dashboard(
    user: dict = Depends(require_roles("photographer")),
):
    return {
        "message": "Photographer dashboard access granted.",
        "user": user,
    }


@router.get("/agent")
def agent_dashboard(
    user: dict = Depends(require_roles("agent")),
):
    return {
        "message": "Agent dashboard access granted.",
        "user": user,
    }


@router.get("/admin")
def admin_dashboard(
    user: dict = Depends(require_roles("admin")),
):
    return {
        "message": "Admin dashboard access granted.",
        "user": user,
    }