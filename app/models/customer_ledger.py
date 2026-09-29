"""
Customer Ledger model — transaction log for customer credit and debit entries.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.order import Order
    from app.models.outlet import Outlet
    from app.models.user import User


class CustomerLedger(Base, TimestampMixin):
    __tablename__ = "customer_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    entry_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # CREDIT_APPLIED, DEBIT_APPLIED, CREDIT_ADDED, DEBIT_ADDED
    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    balance_after: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    note: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    created_by_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    customer: Mapped[Customer] = relationship(
        "Customer", back_populates="ledger_entries"
    )
    outlet: Mapped[Outlet] = relationship("Outlet")
    order: Mapped[Order | None] = relationship("Order")
    created_by: Mapped[User | None] = relationship("User")
