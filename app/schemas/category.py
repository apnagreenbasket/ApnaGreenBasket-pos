"""
Category schemas — CRUD request/response.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, computed_field

from app.schemas.common import BaseResponse, StrictSchema


class CategoryCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    display_order: int = 0


class CategoryUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    display_order: int | None = None


class CategoryResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    display_order: int
    created_at: datetime
    updated_at: datetime
