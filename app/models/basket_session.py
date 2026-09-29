"""
BasketSession model — ties a customer name to a specific smart basket for a visit.
Sessions are active for a configurable duration (default 30 minutes) or until
all orders reach a terminal state.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import SessionStatusEnum

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.order import Order
    from app.models.outlet import Outlet
    from app.models.user import User


class BasketSession(Base, TimestampMixin):
    __tablename__ = "basket_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    basket_number: Mapped[str] = mapped_column(String(50), nullable=False)
    # Format: "{outlet_id}:{basket_number}:{normalized_name}"
    # normalized_name = name.strip().lower().replace(" ", "-")
    session_key: Mapped[str] = mapped_column(
        String(512), nullable=False, unique=True, index=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[SessionStatusEnum] = mapped_column(
        Enum(SessionStatusEnum, name="sessionstatusenum"),
        nullable=False,
        default=SessionStatusEnum.ACTIVE,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False
    )
    # Staff termination metadata
    terminated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    termination_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    terminated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="basket_sessions"
    )
    customer: Mapped[Customer | None] = relationship(
        "Customer", back_populates="sessions"
    )
    orders: Mapped[list[Order]] = relationship(
        "Order", back_populates="session"
    )
    terminated_by: Mapped[User | None] = relationship("User")

    @property
    def is_active(self) -> bool:
        return self.status == SessionStatusEnum.ACTIVE
