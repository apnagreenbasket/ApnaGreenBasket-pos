"""
File upload router — uploads restaurant logos and menu item photos directly to Cloudinary.
Local disk storage is disabled to ensure zero local disk usage on EC2 instances.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.config import get_settings
from app.dependencies import RequireAdmin

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
    current_user: RequireAdmin,
    file: UploadFile = File(...),
):
    """
    Upload an image file (restaurant logo or dish photo) directly to Cloudinary CDN.
    Files are never saved to the local server disk.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is missing",
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' not allowed. Allowed extensions: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum limit of 5MB",
        )

    settings = get_settings()

    has_cloudinary_keys = (
        bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)
        or bool(settings.CLOUDINARY_URL)
    )

    if not has_cloudinary_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary storage is not configured on the server. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.",
        )

    try:
        if settings.CLOUDINARY_URL:
            os.environ["CLOUDINARY_URL"] = settings.CLOUDINARY_URL

        import cloudinary
        import cloudinary.uploader

        if settings.CLOUDINARY_URL:
            cloudinary.reset_config()
        else:
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True,
            )

        res = cloudinary.uploader.upload(
            contents,
            folder="apnagreenbasket_uploads",
            public_id=uuid.uuid4().hex,
            resource_type="auto",
        )
        return {
            "url": res.get("secure_url"),
            "filename": res.get("public_id"),
            "storage": "cloudinary",
        }
    except Exception as cloud_err:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cloudinary upload failed: {str(cloud_err)}",
        )
