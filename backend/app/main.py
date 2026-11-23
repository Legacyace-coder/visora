from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import auth

from app.api.admin import router as admin_router
from app.api.acquisitions import router as acquisitions_router
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.photographer import router as photographer_router
from app.api.partnership import router as partnership_router
from app.api.public_agents import router as public_agents_router
from app.api.withdrawals import router as withdrawals_router
from app.api.workspace import router as workspace_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    version="0.4.0",
    description="API for the photography publishing platform.",
)


class SuspendedAccountMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            access_token = request.cookies.get(auth.ACCESS_COOKIE)
            if access_token:
                try:
                    client = auth.get_supabase_client()
                    profile = auth.get_profile_for_token(client, access_token)
                    if profile.get("suspended_at"):
                        return JSONResponse(
                            status_code=403,
                            content={
                                "detail": "Your account is suspended. Read-only access remains available.",
                            },
                        )
                except Exception:
                    pass
        return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
app.add_middleware(SuspendedAccountMiddleware)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(dashboard_router)
app.include_router(photographer_router)
app.include_router(acquisitions_router)
app.include_router(workspace_router)
app.include_router(partnership_router)
app.include_router(public_agents_router)
app.include_router(withdrawals_router)


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "ok",
        "service": "photography-publishing-api",
    }


@app.get("/", include_in_schema=False)
async def root():
    return {
        "message": "Photography Publishing API",
        "docs": "/docs",
    }

