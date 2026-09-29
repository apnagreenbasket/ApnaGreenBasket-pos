"""
Shared / common Pydantic schemas — base classes, pagination, responses.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StrictSchema(BaseModel):
    """
    Base schema for admin write endpoints — rejects unknown extra fields
    to prevent mass-assignment vulnerabilities.
    """

    model_config = ConfigDict(extra="forbid")


class BaseResponse(BaseModel):
    """Base response with from_attributes for ORM compatibility."""

    model_config = ConfigDict(from_attributes=True)


class UUIDResponse(BaseResponse):
    id: uuid.UUID


class TimestampResponse(BaseResponse):
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    message: str


class PaginationParams(BaseModel):
    skip: int = 0
    limit: int = 50


class PaginatedResponse(BaseModel):
    """Generic paginated wrapper."""

    total: int
    skip: int
    limit: int
    items: list
