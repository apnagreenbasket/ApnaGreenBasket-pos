"""
MenuItemRecipe model — mapping menu items to required ingredients per unit sold.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.menu_item import MenuItem


class MenuItemRecipe(Base):
    __tablename__ = "menu_item_recipes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity_required: Mapped[Decimal] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    unit: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="piece",
        server_default="piece"
    )

    # Relationships
    menu_item: Mapped[MenuItem] = relationship("MenuItem")
    inventory_item: Mapped[InventoryItem] = relationship("InventoryItem")
