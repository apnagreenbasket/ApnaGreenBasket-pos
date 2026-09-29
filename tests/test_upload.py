"""
Tests for Cloudinary-only image upload endpoint (/api/upload/image).
Verifies that uploads are sent directly to Cloudinary and never stored on the local disk.
"""

from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RoleEnum
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_upload_image_without_cloudinary_keys_fails(client: AsyncClient, db_session: AsyncSession):
    """Uploading without Cloudinary configured returns 503 Service Unavailable."""
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    await db_session.commit()
    headers = get_auth_headers(admin, outlet)

    file_content = b"fake image content"
    files = {"file": ("test_photo.png", io.BytesIO(file_content), "image/png")}

    with patch("app.routers.upload.get_settings") as mock_settings:
        mock_settings.return_value.CLOUDINARY_CLOUD_NAME = ""
        mock_settings.return_value.CLOUDINARY_API_KEY = ""
        mock_settings.return_value.CLOUDINARY_API_SECRET = ""
        mock_settings.return_value.CLOUDINARY_URL = ""

        res = await client.post("/api/upload/image", files=files, headers=headers)
        assert res.status_code == 503
        assert "Cloudinary storage is not configured" in res.json()["detail"]


@pytest.mark.asyncio
async def test_upload_image_with_cloudinary_success(client: AsyncClient, db_session: AsyncSession):
    """Uploading with Cloudinary credentials uploads directly to Cloudinary and returns secure_url."""
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    await db_session.commit()
    headers = get_auth_headers(admin, outlet)

    file_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR..."
    files = {"file": ("fresh_apple.png", io.BytesIO(file_content), "image/png")}

    fake_secure_url = "https://res.cloudinary.com/demo/image/upload/v12345/apnagreenbasket_uploads/apple.png"

    with patch("app.routers.upload.get_settings") as mock_settings, \
         patch("cloudinary.uploader.upload") as mock_upload:
        mock_settings.return_value.CLOUDINARY_CLOUD_NAME = "demo"
        mock_settings.return_value.CLOUDINARY_API_KEY = "123456"
        mock_settings.return_value.CLOUDINARY_API_SECRET = "secret"
        mock_settings.return_value.CLOUDINARY_URL = ""

        mock_upload.return_value = {
            "secure_url": fake_secure_url,
            "public_id": "apnagreenbasket_uploads/apple",
        }

        res = await client.post("/api/upload/image", files=files, headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert data["url"] == fake_secure_url
        assert data["storage"] == "cloudinary"
        assert mock_upload.called


@pytest.mark.asyncio
async def test_upload_image_invalid_extension(client: AsyncClient, db_session: AsyncSession):
    """Reject non-image extensions."""
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    await db_session.commit()
    headers = get_auth_headers(admin, outlet)

    files = {"file": ("malicious.exe", io.BytesIO(b"executable code"), "application/octet-stream")}

    res = await client.post("/api/upload/image", files=files, headers=headers)
    assert res.status_code == 400
    assert "not allowed" in res.json()["detail"]
