"""
InventoryItem model — raw materials / ingredient master list for an outlet.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String, UniqueConstraint, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import MarginTypeEnum

if TYPE_CHECKING:
    from app.models.outlet import Outlet


class InventoryItem(Base, TimestampMixin):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint(
            "outlet_id", "name", name="uq_inventory_items_outlet_id_name"
        ),
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
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    unit: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="piece",
        server_default="piece"
    )
    alternate_units: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, server_default="[]", default=list
    )
    category: Mapped[str] = mapped_column(
        String(100), nullable=False, default="General"
    )
    current_stock: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("0.000")
    )
    reorder_threshold: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False, default=Decimal("5.000")
    )
    shelf_life_alert_hrs: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    cost_per_unit: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    mrp: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    wholesale_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    retail_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    margin_type: Mapped[MarginTypeEnum] = mapped_column(
        Enum(MarginTypeEnum, name="margintypeenum"),
        nullable=False,
        default=MarginTypeEnum.MARKUP,
        server_default="MARKUP",
    )
    retail_margin_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    mrp_margin_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    wholesale_margin_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    tax_category: Mapped[str | None] = mapped_column(
        String(100), nullable=True, default="GST 0%"
    )
    tax_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True, default=Decimal("0.00")
    )
    hsn_code: Mapped[str | None] = mapped_column(
        String(20), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    allow_oversell: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship("Outlet")
