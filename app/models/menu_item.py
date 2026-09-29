"""
MenuItem model — individual products within a category.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from datetime import datetime, timezone
from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import PricingModeEnum

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.inventory_item import InventoryItem
    from app.models.menu_item_variant import MenuItemVariant
    from app.models.outlet import Outlet


class MenuItem(Base, TimestampMixin):
    __tablename__ = "menu_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    barcode: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # NEVER use Float for money — Numeric(10,2) mapped to Python Decimal
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    total_sold: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    is_on_offer: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    is_verification_required: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    offer_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    offer_label: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    offer_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    mrp: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    wholesale_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    evening_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
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
    allow_oversell: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )

    @property
    def is_offer_active(self) -> bool:
        if not self.is_on_offer:
            return False
        if self.offer_expires_at is not None:
            if datetime.now(timezone.utc) >= self.offer_expires_at:
                return False
        return True

    @property
    def effective_price(self) -> Decimal:
        """Legacy property for backward compatibility."""
        if self.is_offer_active and self.offer_price is not None and self.offer_price > Decimal("0.00"):
            return min(self.offer_price, self.price)
        return self.price

    def base_price(self, evening_active: bool = False) -> Decimal:
        """The pre-offer regular price (handles evening surge logic)."""
        if evening_active and self.evening_price is not None and self.evening_price > Decimal("0.00"):
            return self.evening_price
        return self.price

    def resolve_price(self, evening_active: bool = False) -> Decimal:
        """Compute the final checkout price. Returns the lower of base price and offer price."""
        b_price = self.base_price(evening_active)
        if self.is_offer_active and self.offer_price is not None and self.offer_price > Decimal("0.00"):
            return min(self.offer_price, b_price)
        return b_price

    # ── Dual pricing fields ──────────────────────────────────────────
    # WEIGHT_BASED: price is ₹ per kg/g, quantity entered as weight
    # FIXED_UNIT: price is ₹ per piece/pack, quantity entered as count
    pricing_mode: Mapped[PricingModeEnum] = mapped_column(
        Enum(PricingModeEnum, name="pricingmodeenum"),
        nullable=False,
        default=PricingModeEnum.FIXED_UNIT,
        server_default="FIXED_UNIT",
    )
    # Display unit label — e.g. "kg", "g", "piece", "pack", "bottle", "500ml"
    unit_label: Mapped[str] = mapped_column(
        String(50), nullable=False, default="piece", server_default="piece"
    )

    # Alternate units configured as [{"unit_label": "Box", "conversion_factor": 10}, ...]
    alternate_units: Mapped[list[dict[str, any]]] = mapped_column(
        JSON, nullable=False, server_default="[]", default=list
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="menu_items"
    )
    category: Mapped[Category] = relationship(
        "Category", back_populates="menu_items"
    )
    inventory_item: Mapped[InventoryItem | None] = relationship(
        "InventoryItem"
    )
    variants: Mapped[list[MenuItemVariant]] = relationship(
        "MenuItemVariant", back_populates="menu_item", cascade="all, delete-orphan"
    )
