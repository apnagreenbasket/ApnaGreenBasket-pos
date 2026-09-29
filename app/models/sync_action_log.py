"""
SyncActionLog model — idempotent record of every offline action received via sync ingestion.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SyncActionLog(Base):
    __tablename__ = "sync_action_logs"
    __table_args__ = (
        UniqueConstraint("outlet_id", "client_action_id", name="uq_sync_action_log_outlet_client_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_action_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    action_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="applied"
    )  # "applied" | "skipped" | "failed"
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
