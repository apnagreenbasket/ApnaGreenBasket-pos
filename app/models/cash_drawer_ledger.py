"""
CashDrawerLedger model - tracks real-time flow of physical cash notes.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CashDrawerLedger(Base):
    __tablename__ = "cash_drawer_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transaction_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
        # Expected: MANUAL_DEPOSIT, CUSTOMER_PAYMENT, CUSTOMER_CHANGE, MANUAL_WITHDRAWAL
    )
    # The counts of notes involved. e.g., {"500": 2, "100": -1} for withdrawing 100 and adding 1000
    denominations: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # Optional reference to the order if it's a customer payment/change
    reference_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    outlet = relationship("Outlet")
    order = relationship("Order")
    user = relationship("User")
