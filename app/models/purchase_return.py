"""
PurchaseReturn model — records stock returned to suppliers and issued return bills/debit notes.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.outlet import Outlet
    from app.models.stock_intake import StockIntake
    from app.models.user import User


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    return_number: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    intake_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stock_intakes.id", ondelete="SET NULL"),
        nullable=True,
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    batch_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    total_refund_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    reason: Mapped[str] = mapped_column(
        String(100), nullable=False, default="RETURN_TO_SUPPLIER"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship("Outlet")
    item: Mapped[InventoryItem] = relationship("InventoryItem")
    intake: Mapped[StockIntake | None] = relationship("StockIntake")
    user: Mapped[User | None] = relationship("User")
