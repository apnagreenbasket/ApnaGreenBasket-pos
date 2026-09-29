"""
BasketQrToken model — maps cryptographically random QR tokens to outlet + basket number.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.outlet import Outlet


class BasketQrToken(Base, TimestampMixin):
    __tablename__ = "basket_qr_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    basket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    token: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship("Outlet")
