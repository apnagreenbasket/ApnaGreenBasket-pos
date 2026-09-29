"""
StockIntake model — log of daily stock intake/arrivals.
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
    from app.models.user import User
    from app.models.supplier import Supplier


class StockIntake(Base):
    __tablename__ = "stock_intakes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    batch_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    initial_quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 3), nullable=True
    )
    remaining_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0.000")
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    retail_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    mrp: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    wholesale_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
    )
    intake_date: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    expiry_date: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True
    )
    added_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship("Outlet")
    item: Mapped[InventoryItem] = relationship("InventoryItem")
    supplier: Mapped[Supplier | None] = relationship("Supplier")
    added_by_user: Mapped[User | None] = relationship("User")
