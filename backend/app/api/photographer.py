import logging
from pathlib import PurePath
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

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
    "file_size_bytes,width,height,title,description,created_at,updated_at"
)


class CollectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=3000)


class CollectionPhotoAttach(BaseModel):
    photo_id: UUID


class SubmissionCreate(BaseModel):
    submission_type: Literal["individual", "collection"]
    title: str = Field(min_length=1, max_length=180)
    cover_note: str | None = Field(default=None, max_length=5000)
    photo_ids: list[UUID] = Field(default_factory=list, max_length=100)
    collection_id: UUID | None = None


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
    under_review = count_rows(client, "submissions", owner_id, "under_review")
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
            "under_review_submissions": under_review,
            "accepted_submissions": accepted,
            "rejected_submissions": rejected,
        },
        "earnings": {
            "currency": "USD",
            "available": None,
            "pending": None,
            "message": "Earnings become available when the financial ledger is implemented.",
        },
    }


@router.get("/photos")
def list_photos(
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)

    result = (
        client.table("photographer_photos")
        .select(PHOTO_COLUMNS)
        .eq("photographer_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )

    return {"photos": result.data or []}


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
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)
    owner_id = current_user["id"]

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

    try:
        client.storage.from_(BUCKET).upload(
            storage_path,
            content,
            {
                "content-type": mime_type,
                "upsert": "false",
            },
        )

        result = (
            client.table("photographer_photos")
            .insert({
                "id": photo_id,
                "photographer_id": owner_id,
                "storage_path": storage_path,
                "original_filename": original_filename[:255],
                "mime_type": mime_type,
                "file_size_bytes": len(content),
                "title": title.strip() if title else None,
                "description": description.strip() if description else None,
            })
            .execute()
        )

        if not result.data:
            raise RuntimeError("Photo metadata was not saved.")

        return {"photo": result.data[0]}

    except Exception:
        logging.exception("Photographer photo upload failed")
        try:
            client.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail="The photo could not be uploaded. Please try again.",
        )


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
            "description": payload.description.strip() if payload.description else None,
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

    result = (
        client.table("collection_photos")
        .insert({
            "collection_id": str(collection_id),
            "photo_id": str(payload.photo_id),
            "photographer_id": owner_id,
        })
        .execute()
    )

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

    submission_result = (
        client.table("submissions")
        .insert({
            "photographer_id": owner_id,
            "submission_type": payload.submission_type,
            "collection_id": (
                str(payload.collection_id)
                if payload.collection_id else None
            ),
            "title": payload.title.strip(),
            "cover_note": payload.cover_note.strip() if payload.cover_note else None,
        })
        .execute()
    )

    if not submission_result.data:
        raise HTTPException(status_code=400, detail="Submission could not be created.")

    submission = submission_result.data[0]

    try:
        client.table("submission_items").insert([
            {
                "submission_id": submission["id"],
                "photo_id": photo_id,
                "photographer_id": owner_id,
            }
            for photo_id in photo_ids
        ]).execute()

    except Exception:
        try:
            (
                client.table("submissions")
                .delete()
                .eq("id", submission["id"])
                .eq("photographer_id", owner_id)
                .eq("status", "pending")
                .execute()
            )
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail="Submission items could not be saved. Please try again.",
        )

    return {
        "submission": submission,
        "photo_count": len(photo_ids),
    }


@router.get("/submissions")
def list_submissions(
    request: Request,
    current_user: dict = Depends(require_photographer),
):
    client = get_user_client(request)

    result = (
        client.table("submissions")
        .select(
            "id,submission_type,collection_id,title,cover_note,status,"
            "submitted_at,reviewed_at,reviewer_notes"
        )
        .eq("photographer_id", current_user["id"])
        .order("submitted_at", desc=True)
        .limit(100)
        .execute()
    )

    return {"submissions": result.data or []}
