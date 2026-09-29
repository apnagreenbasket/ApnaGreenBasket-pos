"""
AbandonedCart model — snapshot of a customer's cart when their basket session
expires or is terminated. Items stored as JSON for clean handoff to manual
billing (CreateManualBillRequest).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any, TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.basket_session import BasketSession
    from app.models.order import Order
    from app.models.outlet import Outlet


class AbandonedCart(Base, TimestampMixin):
    __tablename__ = "abandoned_carts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("basket_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    basket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    # JSON snapshot: [{menu_item_id, variant_id, name, quantity, unit_price,
    #                  pricing_mode, unit_label}]
    items: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    total_estimate: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )
    # ABANDONED → CONVERTED (when staff converts to manual bill)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="ABANDONED"
    )
    converted_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship("Outlet")
    session: Mapped[BasketSession] = relationship("BasketSession")
    converted_order: Mapped[Order | None] = relationship("Order")
