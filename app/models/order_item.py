"""
OrderItem model — line items within an order, with snapshot pricing.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.menu_item import MenuItem
    from app.models.menu_item_variant import MenuItemVariant
    from app.models.order import Order
    from app.models.stock_intake import StockIntake
    from app.models.user import User


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    menu_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_item_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    selected_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stock_intakes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    added_by_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Numeric(10,3) to support weight-based quantities (e.g. 1.250 kg)
    # For fixed-unit products this will be a whole number stored as Decimal
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    selected_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Snapshot price at order time — NEVER recompute from live MenuItem
    # NEVER use Float for money — Numeric(10,2) mapped to Python Decimal
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    mrp: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    item_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_complimentary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    returned_quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal("0.00"), server_default="0.00", nullable=False)
    line_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True, default=Decimal("0.00"))
    tax_category: Mapped[str | None] = mapped_column(String(50), nullable=True, default="GST 0%")
    hsn_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Relationships
    order: Mapped[Order] = relationship("Order", back_populates="items")
    menu_item: Mapped[MenuItem] = relationship("MenuItem")
    variant: Mapped[MenuItemVariant | None] = relationship("MenuItemVariant")
    selected_batch: Mapped[StockIntake | None] = relationship("StockIntake")
    added_by_staff: Mapped[User | None] = relationship("User")
