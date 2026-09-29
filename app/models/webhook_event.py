"""
WebhookEvent model — idempotency table for Razorpay webhooks.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    # Razorpay's event ID — unique + indexed for fast idempotency lookups
    event_id: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    # Using JSON (not JSONB) for cross-dialect compatibility in tests.
    # PostgreSQL promotes JSON to jsonb automatically when needed.
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        default=None, server_default=func.now(), nullable=False
    )
