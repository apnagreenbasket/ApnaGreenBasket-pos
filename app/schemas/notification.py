"""
Notification schemas — API request/response contracts for in-app and multi-channel notifications.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.models.enums import NotificationTypeEnum
from app.schemas.common import BaseResponse, StrictSchema


class NotificationResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    type: NotificationTypeEnum
    title: str
    message: str
    details: dict[str, Any] | None = None
    is_read: bool = False
    channels_sent: list[str] | None = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class NotificationListResponse(BaseResponse):
    notifications: list[NotificationResponse]
    unread_count: int
    threshold_days: int


class NotificationDispatchResponse(BaseResponse):
    notification_id: uuid.UUID
    dispatched_channels: list[str]
    recipient_emails: list[str] = Field(default_factory=list)
    recipient_phones: list[str] = Field(default_factory=list)
    status: str = "SUCCESS"
