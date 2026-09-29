"""
User model — superadmin, admin, and store staff accounts, scoped to an outlet.
Unified single-table authentication and POS staff profile model.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from app.models.enums import RoleEnum

if TYPE_CHECKING:
    from app.models.outlet import Outlet


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    outlet_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outlets.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Team Member")
    __table_args__ = (
        UniqueConstraint("email", "outlet_id", name="uix_user_email_outlet"),
        Index("uix_user_email_superadmin", "email", unique=True, postgresql_where=text("outlet_id IS NULL"), sqlite_where=text("outlet_id IS NULL")),
    )

    email: Mapped[str] = mapped_column(
        String(320), nullable=False, index=True
    )
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum, name="roleenum"), nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    # Refresh tokens — stored hashed, one active per user
    refresh_token_hash: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    outlet: Mapped[Outlet] = relationship(
        "Outlet", back_populates="users"
    )

    @property
    def has_pin(self) -> bool:
        return self.pin_hash is not None
