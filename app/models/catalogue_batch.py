"""
CatalogueBatch model — persisted catalogue print batches scoped per outlet.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.outlet import Outlet


class CatalogueBatch(Base, TimestampMixin):
    __tablename__ = "catalogue_batches"

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
    template: Mapped[str] = mapped_column(
        String(50), nullable=False, default="mandi-ledger"
    )
    show_evening_price: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    show_evening_special_label: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Relationships
    outlet: Mapped[Outlet] = relationship("Outlet")
