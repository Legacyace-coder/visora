import logging
from datetime import date
from pathlib import PurePath
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.api import auth
from app.core.security import require_roles


router = APIRouter(
    prefix="/photographer",
    tags=["Photographer"],
)

BUCKET = "photographer-originals"
MAX_FILE_SIZE = 25 * 1024 * 1024

PHOTO_COLUMNS = (
    "id,photographer_id,storage_path,original_filename,mime_type,"
    "file_size_bytes,width,height,title,description,capture_date,location,keywords,"
    "created_at,updated_at"
)


class PhotoMetadata(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=3000)
    capture_date: date | None = None
    location: str | None = Field(default=None, max_length=255)
    keywords: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("title", "description", "location", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, values):
        keywords = [value.strip() for value in values]
        if any(not value or len(value) > 80 for value in keywords):
            raise ValueError("Keywords must be between 1 and 80 characters.")
        return keywords


class CollectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=3000)

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value


class CollectionPhotoAttach(BaseModel):
    photo_id: UUID


class SubmissionCreate(BaseModel):
    submission_type: Literal["individual", "collection"]
    title: str = Field(min_length=1, max_length=180)
    cover_note: str | None = Field(default=None, max_length=5000)
    photo_ids: list[UUID] = Field(default_factory=list, max_length=100)
    collection_id: UUID | None = None

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("cover_note", mode="before")
    @classmethod
    def normalize_cover_note(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value


def get_user_client(request: Request):
    token = request.cookies.get(auth.ACCESS_COOKIE)

    if not token:
        raise HTTPException(status_code=401, detail="You are not signed in.")

    client = auth.get_supabase_client()
    client.postgrest.auth(token)
    client.storage._headers["Authorization"] = f"Bearer {token}"
    return client


def require_photographer(
    current_user: dict = Depends(require_roles("photographer")),
) -> dict:
    return current_user


def count_rows(client, table, owner_id, status=None) -> int:
    query = (
        client.table(table)
        .select("id", count="exact", head=True)
        .eq("photographer_id", owner_id)
    )

    if status:
        query = query.eq("status", status)

    result = query.execute()
    return result.count or 0


def normalize_submission_status(status: str) -> str:
    return "processing" if status == "under_review" else status


def detect_image_type(content: bytes) -> tuple[str, str] | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"

    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"

    if (
        len(content) >= 12
        and content[:4] == b"RIFF"
        and content[8:12] == b"WEBP"
    ):
        return "image/webp", ".webp"

    return None


@router.get("/overview")
def photographer_overview(
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]

    photos = count_rows(client, "photographer_photos", owner_id)
    collections = count_rows(client, "photographer_collections", owner_id)

    submissions = count_rows(client, "submissions", owner_id)
    pending = count_rows(client, "submissions", owner_id, "pending")
    processing = (
        count_rows(client, "submissions", owner_id, "processing")
        + count_rows(client, "submissions", owner_id, "under_review")
    )
    accepted = count_rows(client, "submissions", owner_id, "accepted")
    rejected = count_rows(client, "submissions", owner_id, "rejected")

    return {
        "profile": {
            "id": owner_id,
            "display_name": current_user.get("display_name"),
            "email": current_user.get("email"),
            "referral_code": current_user.get("referral_code"),
        },
        "statistics": {
            "photos": photos,
            "collections": collections,
            "submissions": submissions,
            "pending_submissions": pending,
            "processing_submissions": processing,
            "accepted_submissions": accepted,
            "rejected_submissions": rejected,
        },
        "earnings": {
            "currency": "USD",
            "available": None,
            "pending": None,
            "message": "Current wallet balances are available at /photographer/wallet.",
        },
    }


@router.get("/photos")
def list_photos(
    request: Request,
    current_user: dict = Depends(require_photographer),
    offset: int = Query(default=0, ge=0),
):
    client = get_user_client(request)

    result = (
        client.table("photographer_photos")
        .select(PHOTO_COLUMNS, count="exact")
        .eq("photographer_id", current_user["id"])
        .order("created_at", desc=True)
        .order("id", desc=True)
        .range(offset, offset + 100)
        .execute()
    )

    if result.count is None:
        logging.error("Photographer portfolio returned no total count")
        raise HTTPException(502, "Your portfolio could not be loaded.")
    photos = result.data or []
    return {"photos": photos[:100], "total": result.count, "has_more": len(photos) > 100}


@router.get("/photos/{photo_id}/preview")
def get_photo_preview(
    photo_id: UUID,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]

    photo_result = (
        client.table("photographer_photos")
        .select("id,storage_path")
        .eq("id", str(photo_id))
        .eq("photographer_id", owner_id)
        .limit(1)
        .execute()
    )

    if not photo_result.data:
        raise HTTPException(
            status_code=404,
            detail="Photo not found.",
        )

    photo = photo_result.data[0]
    storage_path = photo["storage_path"]

    expected_prefix = f"{owner_id}/"
    if not storage_path.startswith(expected_prefix):
        raise HTTPException(
            status_code=404,
            detail="Photo not found.",
        )

    try:
        signed_result = (
            client.storage
            .from_(BUCKET)
            .create_signed_url(storage_path, 300)
        )
    except Exception:
        logging.exception("Photographer photo preview URL creation failed")
        raise HTTPException(
            status_code=502,
            detail="The photo preview is temporarily unavailable.",
        )

    return {
        "photo_id": str(photo_id),
        "preview_url": signed_result.get("signedURL"),
        "expires_in": 300,
    }

@router.post("/photos", status_code=201)
async def upload_photo(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(default=None, max_length=160),
    description: str | None = Form(default=None, max_length=3000),
    capture_date: str | None = Form(default=None),
    location: str | None = Form(default=None, max_length=255),
    keywords: str | None = Form(default=None, max_length=2429),
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]

    try:
        metadata = PhotoMetadata(
            title=title,
            description=description,
            capture_date=capture_date or None,
            location=location,
            keywords=keywords.split(",") if keywords and keywords.strip() else [],
        )
    except ValidationError as error:
        raise HTTPException(status_code=422, detail="Invalid photograph metadata.") from error

    original_filename = PurePath(file.filename or "upload").name.strip()

    if not original_filename:
        raise HTTPException(status_code=400, detail="A filename is required.")

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="The maximum image size is 25 MB.",
        )

    detected = detect_image_type(content)

    if detected is None:
        raise HTTPException(
            status_code=415,
            detail="Only valid JPEG, PNG, and WebP images are accepted.",
        )

    mime_type, extension = detected
    photo_id = str(uuid4())
    storage_path = f"{owner_id}/{photo_id}{extension}"
    uploaded = False
    try:
        client.storage.from_(BUCKET).upload(
            storage_path,
            content,
            {
                "content-type": mime_type,
                "upsert": "false",
            },
        )
        uploaded = True

        result = (
            client.table("photographer_photos")
            .insert({
                "id": photo_id,
                "photographer_id": owner_id,
                "storage_path": storage_path,
                "original_filename": original_filename[:255],
                "mime_type": mime_type,
                "file_size_bytes": len(content),
                **metadata.model_dump(mode="json"),
            })
            .execute()
        )

        if not result.data:
            raise RuntimeError("Photo metadata was not saved.")

        return {"photo": result.data[0]}

    except Exception:
        logging.exception("Photographer photo upload failed")
        if uploaded:
            try:
                client.storage.from_(BUCKET).remove([storage_path])
            except Exception:
                logging.exception(
                    "Uploaded photo cleanup failed for storage_path=%s",
                    storage_path,
                )

        raise HTTPException(
            status_code=400,
            detail="The photo could not be uploaded. Please try again.",
        )


@router.put("/photos/{photo_id}")
def update_photo(
    photo_id: UUID,
    payload: PhotoMetadata,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    result = (
        client.table("photographer_photos")
        .update(payload.model_dump(mode="json"))
        .eq("id", str(photo_id))
        .eq("photographer_id", current_user["id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return {"photo": result.data[0]}


def cleanup_deleted_photos(client, owner_id: str) -> int:
    pending = (
        client.table("photograph_deletion_queue")
        .select("photo_id,storage_path")
        .eq("photographer_id", owner_id)
        .execute()
    )
    for item in pending.data or []:
        path = item["storage_path"]
        if not path.startswith(f"{owner_id}/"):
            raise RuntimeError("Invalid pending photograph storage path.")
        client.storage.from_(BUCKET).remove([path])
        (
            client.table("photograph_deletion_queue")
            .delete()
            .eq("photo_id", item["photo_id"])
            .eq("photographer_id", owner_id)
            .execute()
        )
    return len(pending.data or [])


@router.post("/photo-deletion-cleanup")
def retry_photo_deletion_cleanup(
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    try:
        count = cleanup_deleted_photos(client, current_user["id"])
    except Exception as error:
        logging.exception("Pending photograph storage cleanup failed")
        raise HTTPException(
            status_code=502,
            detail="Some originals could not be deleted. Please retry cleanup.",
        ) from error
    return {"cleaned_up": count}


@router.delete("/photos/{photo_id}")
def delete_photo(
    photo_id: UUID,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]
    try:
        result = client.rpc(
            "delete_photographer_photo",
            {"p_photo_id": str(photo_id), "p_photographer_id": owner_id},
        ).execute()
    except Exception as error:
        if getattr(error, "code", None) == "23503":
            raise HTTPException(
                status_code=409,
                detail="This photograph is in use and cannot be deleted.",
            ) from error
        logging.exception("Photograph deletion failed")
        raise HTTPException(status_code=502, detail="The photograph could not be deleted.") from error

    if not result.data:
        raise HTTPException(status_code=404, detail="Photo not found.")

    try:
        cleanup_deleted_photos(client, owner_id)
    except Exception as error:
        logging.exception("Deleted photograph storage cleanup failed")
        raise HTTPException(
            status_code=502,
            detail="Photograph removed from your portfolio, but original cleanup is pending. Use retry cleanup.",
        ) from error
    return {"message": "Photograph deleted."}


@router.post("/collections", status_code=201)
def create_collection(
    payload: CollectionCreate,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)

    result = (
        client.table("photographer_collections")
        .insert({
            "photographer_id": current_user["id"],
            "title": payload.title.strip(),
            "description": payload.description,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=400, detail="Collection could not be created.")

    return {"collection": result.data[0]}


@router.get("/collections")
def list_collections(
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)

    result = (
        client.table("photographer_collections")
        .select("id,photographer_id,title,description,created_at,updated_at")
        .eq("photographer_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )

    return {"collections": result.data or []}


@router.post("/collections/{collection_id}/photos", status_code=201)
def add_photo_to_collection(
    collection_id: UUID,
    payload: CollectionPhotoAttach,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]

    collection = (
        client.table("photographer_collections")
        .select("id")
        .eq("id", str(collection_id))
        .eq("photographer_id", owner_id)
        .maybe_single()
        .execute()
    )

    if not collection.data:
        raise HTTPException(status_code=404, detail="Collection not found.")

    photo = (
        client.table("photographer_photos")
        .select("id")
        .eq("id", str(payload.photo_id))
        .eq("photographer_id", owner_id)
        .maybe_single()
        .execute()
    )

    if not photo.data:
        raise HTTPException(status_code=404, detail="Photo not found.")

    try:
        result = (
            client.table("collection_photos")
            .insert({
                "collection_id": str(collection_id),
                "photo_id": str(payload.photo_id),
                "photographer_id": owner_id,
            })
            .execute()
        )
    except Exception as error:
        logging.exception("Adding a photographer photo to a collection failed")
        duplicate = getattr(error, "code", None) == "23505"
        raise HTTPException(
            status_code=409 if duplicate else 502,
            detail=(
                "The photo is already in this collection."
                if duplicate
                else "The photo could not be added. Please try again."
            ),
        )

    if not result.data:
        raise HTTPException(status_code=409, detail="The photo is already in this collection.")
    return {"message": "Photo added to collection.", "item": result.data[0]}


@router.post("/submissions", status_code=201)
def create_submission(
    payload: SubmissionCreate,
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]

    if payload.submission_type == "individual":
        if payload.collection_id is not None:
            raise HTTPException(
                status_code=422,
                detail="Individual submissions cannot include a collection ID.",
            )

        if not payload.photo_ids:
            raise HTTPException(
                status_code=422,
                detail="Select at least one photo.",
            )

        if len(set(payload.photo_ids)) != len(payload.photo_ids):
            raise HTTPException(
                status_code=422,
                detail="Duplicate photo IDs are not allowed.",
            )

        photo_ids = [str(photo_id) for photo_id in payload.photo_ids]

        owned_photos = (
            client.table("photographer_photos")
            .select("id")
            .eq("photographer_id", owner_id)
            .in_("id", photo_ids)
            .execute()
        )

        if len(owned_photos.data or []) != len(photo_ids):
            raise HTTPException(
                status_code=404,
                detail="One or more selected photos were not found in your portfolio.",
            )

    else:
        if payload.photo_ids:
            raise HTTPException(
                status_code=422,
                detail="Collection submissions use collection_id, not photo_ids.",
            )

        if not payload.collection_id:
            raise HTTPException(
                status_code=422,
                detail="A collection ID is required.",
            )

        collection = (
            client.table("photographer_collections")
            .select("id")
            .eq("id", str(payload.collection_id))
            .eq("photographer_id", owner_id)
            .maybe_single()
            .execute()
        )

        if not collection.data:
            raise HTTPException(status_code=404, detail="Collection not found.")

        collection_items = (
            client.table("collection_photos")
            .select("photo_id")
            .eq("collection_id", str(payload.collection_id))
            .eq("photographer_id", owner_id)
            .execute()
        )

        photo_ids = [item["photo_id"] for item in (collection_items.data or [])]

        if not photo_ids:
            raise HTTPException(
                status_code=422,
                detail="Add at least one photo to the collection before submitting it.",
            )

    try:
        result = client.rpc(
            "create_photographer_submission",
            {
                "p_photographer_id": owner_id,
                "p_submission_type": payload.submission_type,
                "p_collection_id": (
                    str(payload.collection_id)
                    if payload.collection_id else None
                ),
                "p_title": payload.title,
                "p_cover_note": payload.cover_note,
                "p_photo_ids": photo_ids,
            },
        ).execute()
    except Exception:
        logging.exception("Photographer submission transaction failed")
        raise HTTPException(
            status_code=502,
            detail="The submission could not be saved. Please try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=502,
            detail="The submission could not be saved. Please try again.",
        )

    return {
        "submission": result.data,
        "photo_count": len(photo_ids),
    }


@router.get("/submissions")
def list_submissions(
    request: Request,
    current_user: dict = Depends(require_photographer),
    offset: int = Query(default=0, ge=0),
):
    client = get_user_client(request)

    result = (
        client.table("submissions")
        .select(
            "id,submission_type,collection_id,title,cover_note,status,"
            "submitted_at,reviewed_at,photographer_feedback"
        )
        .eq("photographer_id", current_user["id"])
        .order("submitted_at", desc=True)
        .order("id", desc=True)
        .range(offset, offset + 100)
        .execute()
    )

    submissions = result.data or []
    return {
        "submissions": [
            {
                **submission,
                "status": normalize_submission_status(submission["status"]),
            }
            for submission in submissions[:100]
        ],
        "has_more": len(submissions) > 100,
    }
