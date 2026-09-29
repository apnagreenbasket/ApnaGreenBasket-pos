"""
Notification model — Persistent in-app notifications and multi-channel dispatch logs.
"""

from __future__ import annotations

import uuid
from typing import Any
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, String, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from .enums import NotificationTypeEnum


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[NotificationTypeEnum] = mapped_column(
        Enum(NotificationTypeEnum, name="notificationtypeenum"),
        nullable=False,
        default=NotificationTypeEnum.NEAR_EXPIRY,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    channels_sent: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)

    # Relationships
    outlet: Mapped["Outlet"] = relationship("Outlet", backref="notifications")
