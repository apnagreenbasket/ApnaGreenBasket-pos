"""
LocalActionQueue model — double-buffer failsafe for offline action sync.
Only used when RUNTIME_MODE=local. Each row mirrors an action also saved
in the frontend's IndexedDB. Marked synced=True when either the frontend
ACKs a successful cloud sync, or the local sweeper pushes it directly.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LocalActionQueue(Base):
    __tablename__ = "local_action_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_action_id: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    action_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    synced: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
