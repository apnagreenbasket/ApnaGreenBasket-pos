"""
Expense model — tracks operational expenses (salary, rent, electricity, etc.)
for real net profit calculation after subtracting from gross profit.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Category: predefined types + OTHER with custom specification
    # SALARY, RENT, ELECTRICITY, WATER, EQUIPMENT, MAINTENANCE, PACKAGING, MARKETING, OTHER
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # When category == "OTHER", user can specify what it is
    custom_category: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Expense amount (always positive)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # Payment method used
    payment_method: Mapped[str] = mapped_column(
        String(30), nullable=False, default="CASH"
        # CASH, UPI, BANK_TRANSFER, CHEQUE, OTHER
    )

    # Optional description / notes
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # The date the expense occurred (can be backdated)
    expense_date: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, index=True
    )

    # Who logged this expense
    logged_by_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    logged_by_staff_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # For SALARY expenses: recipient payroll staff member & payout month period
    recipient_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payroll_staff.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recipient_staff_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_month: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)

    # Audit timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    outlet = relationship("Outlet")
    logged_by = relationship("User", foreign_keys=[logged_by_staff_id])
    recipient_staff = relationship("PayrollStaff", foreign_keys=[recipient_staff_id])
