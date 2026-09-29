"""
Customer model — shopper/diner identity (separate from staff User).
A customer is uniquely identified by (outlet_id, phone).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from decimal import Decimal

if TYPE_CHECKING:
    from app.models.basket_session import BasketSession
    from app.models.order import Order
    from app.models.outlet import Outlet
    from app.models.customer_ledger import CustomerLedger


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("outlet_id", "phone", name="uq_customers_outlet_phone"),
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
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    loyalty_points: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    credit_balance: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    extra_detail: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="customers"
    )
    sessions: Mapped[list[BasketSession]] = relationship(
        "BasketSession", back_populates="customer"
    )
    orders: Mapped[list[Order]] = relationship(
        "Order", back_populates="customer"
    )
    ledger_entries: Mapped[list["CustomerLedger"]] = relationship(
        "CustomerLedger", back_populates="customer"
    )
