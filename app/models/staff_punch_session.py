"""
StaffPunchSession model — records staff shift punch-in and punch-out events with elapsed duration tracking.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.outlet import Outlet
    from app.models.user import User


class StaffPunchSession(Base):
    __tablename__ = "staff_punch_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    punch_in_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )
    punch_out_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    auto_punched_out: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    notes: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    staff: Mapped[User] = relationship("User")
    outlet: Mapped[Outlet] = relationship("Outlet")
