"""
StockLedger model — append-only audit trail of stock movements.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import StockChangeTypeEnum

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.order import Order
    from app.models.outlet import Outlet
    from app.models.user import User


class StockLedger(Base):
    __tablename__ = "stock_ledger"

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
    change_type: Mapped[StockChangeTypeEnum] = mapped_column(
        Enum(StockChangeTypeEnum, name="stockchangetypeenum", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    quantity_change: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    resulting_stock: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    batch_balance: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 3), nullable=True
    )
    reference_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    intake_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stock_intakes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    unit_cost_snapshot: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(
        String(100), nullable=True
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
    outlet: Mapped[Outlet] = relationship("Outlet")
    item: Mapped[InventoryItem] = relationship("InventoryItem")
    reference_order: Mapped[Order | None] = relationship("Order")
    intake: Mapped[Any | None] = relationship("StockIntake")
    user: Mapped[User | None] = relationship("User")
