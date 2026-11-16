from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.photographer import router as photographer_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    version="0.4.0",
    description="API for the photography publishing platform.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(photographer_router)


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
