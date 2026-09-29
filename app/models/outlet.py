"""
Outlet model — the root tenant entity (mart, store, or grocery outlet).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from decimal import Decimal

from sqlalchemy import Boolean, Enum, Integer, JSON, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin
from .enums import PaymentModeEnum

if TYPE_CHECKING:
    from app.models.abandoned_cart import AbandonedCart
    from app.models.basket_session import BasketSession
    from app.models.category import Category
    from app.models.customer import Customer
    from app.models.menu_item import MenuItem
    from app.models.order import Order
    from app.models.user import User


class Outlet(Base, TimestampMixin):
    __tablename__ = "outlets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    payment_mode: Mapped[PaymentModeEnum] = mapped_column(
        Enum(PaymentModeEnum, name="paymentmodeenum"),
        nullable=False,
        default=PaymentModeEnum.PAY_AT_COUNTER,
    )
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fssai_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direct_upi_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_account_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    raw_upi_payload: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    session_duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30
    )
    session_grace_period_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5
    )
    public_basket_number: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default=None
    )
    loyalty_points_per_100_inr: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    loyalty_redemption_tiers: Mapped[list[dict] | None] = mapped_column(
        JSON, nullable=True, default=list
    )
    loyalty_max_bill_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="100.00", default=Decimal("100.00")
    )
    # Verification Rules (Anti-theft)
    verification_amount_cutoff: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True, default=None
    )
    flagged_item_ids: Mapped[list[str] | None] = mapped_column(
        JSON, nullable=True, default=list
    )
    evening_price_active: Mapped[bool] = mapped_column(
        "evening_price_active", nullable=False, server_default="false", default=False
    )
    evening_pricing_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="OFF", default="OFF"
    )  # "OFF", "MANUAL", "AUTO"
    evening_auto_enabled: Mapped[bool] = mapped_column(
        "evening_auto_enabled", nullable=False, server_default="false", default=False
    )
    evening_auto_start_time: Mapped[str | None] = mapped_column(
        String(5), nullable=True, default=None  # HH:MM in IST e.g. "16:00"
    )
    evening_auto_end_time: Mapped[str | None] = mapped_column(
        String(5), nullable=True, default=None  # HH:MM in IST e.g. "22:00"
    )
    near_expiry_threshold_days: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="7", default=7
    )
    notification_emails: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
    weighing_scale_barcode_format: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="21_5I_5W_GRAMS", default="21_5I_5W_GRAMS"
    )
    notification_phones: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
    email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    bill_qr_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    dashboard_reset_time: Mapped[str] = mapped_column(
        String(5), nullable=False, server_default="00:00", default="00:00"
    )
    place_of_supply: Mapped[str | None] = mapped_column(
        String(100), nullable=True, default=None
    )
    interstate_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="OFF", default="OFF"
    )  # "OFF", "PER_BILL", "ALWAYS_ON"
    b2b_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )
    invoice_terms_conditions: Mapped[str | None] = mapped_column(
        String(2000), nullable=True, default="1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction."
    )

    @property
    def is_evening_active(self) -> bool:
        """Dynamic evaluation of whether evening rates are currently active for this outlet."""
        if self.evening_pricing_mode == "MANUAL":
            return True
        if self.evening_pricing_mode == "AUTO" and self.evening_auto_start_time and self.evening_auto_end_time:
            from datetime import datetime
            from app.services.evening_scheduler import IST, _parse_hhmm, _is_in_window
            now_ist = datetime.now(IST).time()
            start_t = _parse_hhmm(self.evening_auto_start_time)
            end_t = _parse_hhmm(self.evening_auto_end_time)
            if start_t and end_t:
                return _is_in_window(now_ist, start_t, end_t)
        return False

    users: Mapped[list[User]] = relationship(
        "User", back_populates="outlet", cascade="all, delete-orphan"
    )
    categories: Mapped[list[Category]] = relationship(
        "Category", back_populates="outlet", cascade="all, delete-orphan"
    )
    menu_items: Mapped[list[MenuItem]] = relationship(
        "MenuItem", back_populates="outlet", cascade="all, delete-orphan"
    )
    orders: Mapped[list[Order]] = relationship(
        "Order", back_populates="outlet", cascade="all, delete-orphan"
    )
    customers: Mapped[list[Customer]] = relationship(
        "Customer", back_populates="outlet", cascade="all, delete-orphan"
    )
    basket_sessions: Mapped[list[BasketSession]] = relationship(
        "BasketSession", back_populates="outlet", cascade="all, delete-orphan"
    )
    abandoned_carts: Mapped[list[AbandonedCart]] = relationship(
        "AbandonedCart", back_populates="outlet", cascade="all, delete-orphan"
    )
