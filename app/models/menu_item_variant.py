"""
MenuItemVariant model — sizes, add-ons, customizations for a menu item.
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


class MenuItemVariant(Base):
    __tablename__ = "menu_item_variants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # NEVER use Float for money — Numeric(10,2) mapped to Python Decimal
    price_delta: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # Relationships
    menu_item: Mapped[MenuItem] = relationship(
        "MenuItem", back_populates="variants"
    )
