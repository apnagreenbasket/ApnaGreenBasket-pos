"""
BillDiscountApproval model — tracks manager/admin approval requests for bill discounts.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.user import User


class BillDiscountApproval(Base):
    __tablename__ = "bill_discount_approvals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), default="PENDING", nullable=False
    )
    discount_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    discount_value: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    reason_note: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    complimentary_items: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )

    # Relationships
    order: Mapped[Order] = relationship("Order")
    requested_by: Mapped[User] = relationship("User", foreign_keys=[requested_by_id])
    approved_by: Mapped[User | None] = relationship("User", foreign_keys=[approved_by_id])
