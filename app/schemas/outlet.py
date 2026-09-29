"""
Outlet schemas — CRUD request/response for Mart & Grocery Outlets.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field, field_validator

from app.models.enums import PaymentModeEnum
from app.schemas.common import BaseResponse, StrictSchema


class LoyaltyTier(StrictSchema):
    min_points: int = Field(ge=0)
    max_points: int | None = None
    discount_percentage: float = Field(ge=0.0, le=100.0)


class OutletCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    payment_mode: PaymentModeEnum
    razorpay_account_id: str | None = None
    direct_upi_id: str | None = None
    raw_upi_payload: str | None = None
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    session_duration_minutes: int = Field(default=30, ge=5, le=120)
    public_basket_number: str | None = None
    verification_amount_cutoff: Decimal | None = Field(default=None, ge=Decimal("0"))
    flagged_item_ids: list[str] = Field(default_factory=list)
    evening_price_active: bool = False
    evening_pricing_mode: str = "OFF"  # "OFF", "MANUAL", "AUTO"
    evening_auto_enabled: bool = False
    evening_auto_start_time: str | None = None  # HH:MM IST
    evening_auto_end_time: str | None = None    # HH:MM IST
    near_expiry_threshold_days: int = Field(default=7, ge=1, le=180)
    notification_emails: list[str] = Field(default_factory=list)
    weighing_scale_barcode_format: str = "21_5I_5W_GRAMS"
    notification_phones: list[str] = Field(default_factory=list)
    dashboard_reset_time: str = Field(default="00:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    email: str | None = None
    bill_qr_url: str | None = None
    place_of_supply: str | None = None
    loyalty_points_per_100_inr: int = 0
    loyalty_redemption_tiers: list[LoyaltyTier] = Field(default_factory=list)
    loyalty_max_bill_percentage: Decimal = Field(default=Decimal("100.00"), ge=Decimal("0"), le=Decimal("100"))
    invoice_terms_conditions: str | None = None
    interstate_mode: str = "OFF"
    b2b_enabled: bool = False


class OutletUpdate(StrictSchema):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    payment_mode: PaymentModeEnum | None = None
    razorpay_account_id: str | None = None
    direct_upi_id: str | None = None
    raw_upi_payload: str | None = None
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    session_duration_minutes: int | None = Field(default=None, ge=5, le=120)
    public_basket_number: str | None = None
    verification_amount_cutoff: Decimal | None = Field(default=None, ge=Decimal("0"))
    flagged_item_ids: list[str] | None = None
    evening_price_active: bool | None = None
    evening_pricing_mode: str | None = None
    evening_auto_enabled: bool | None = None
    evening_auto_start_time: str | None = None
    evening_auto_end_time: str | None = None
    near_expiry_threshold_days: int | None = Field(default=None, ge=1, le=180)
    notification_emails: list[str] | None = None
    weighing_scale_barcode_format: str | None = None
    notification_phones: list[str] | None = None
    dashboard_reset_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    email: str | None = None
    bill_qr_url: str | None = None
    place_of_supply: str | None = None
    loyalty_points_per_100_inr: int | None = None
    loyalty_redemption_tiers: list[LoyaltyTier] | None = None
    loyalty_max_bill_percentage: Decimal | None = Field(default=None, ge=Decimal("0"), le=Decimal("100"))
    invoice_terms_conditions: str | None = None
    interstate_mode: str | None = None
    b2b_enabled: bool | None = None


class OutletResponse(BaseResponse):
    id: uuid.UUID
    name: str
    slug: str
    payment_mode: PaymentModeEnum
    razorpay_account_id: str | None
    direct_upi_id: str | None
    raw_upi_payload: str | None
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    session_duration_minutes: int = 30
    public_basket_number: str | None = None
    verification_amount_cutoff: Decimal | None = None
    flagged_item_ids: list[str] = Field(default_factory=list)
    evening_price_active: bool = False
    evening_pricing_mode: str = "OFF"
    evening_auto_enabled: bool = False
    evening_auto_start_time: str | None = None
    evening_auto_end_time: str | None = None
    near_expiry_threshold_days: int = 7
    notification_emails: list[str] = Field(default_factory=list)
    weighing_scale_barcode_format: str = "21_5I_5W_GRAMS"
    notification_phones: list[str] = Field(default_factory=list)
    dashboard_reset_time: str = "00:00"
    email: str | None = None
    bill_qr_url: str | None = None
    place_of_supply: str | None = None
    loyalty_points_per_100_inr: int = 0
    loyalty_redemption_tiers: list[LoyaltyTier] = Field(default_factory=list)
    loyalty_max_bill_percentage: Decimal = Field(default=Decimal("100.00"))
    invoice_terms_conditions: str | None = None
    interstate_mode: str = "OFF"
    b2b_enabled: bool = False
    created_at: datetime
    updated_at: datetime

    @field_validator("loyalty_redemption_tiers", mode="before")
    @classmethod
    def default_tiers(cls, v: Any) -> list:
        return v if v is not None else []


class UserSummaryResponse(BaseResponse):
    id: uuid.UUID
    name: str | None = None
    email: str
    phone: str | None = None
    role: str
    is_active: bool
    status: str = "active"
    has_pin: bool = False
    created_at: datetime


class OutletWithUsersResponse(OutletResponse):
    users: list[UserSummaryResponse] = []


OutletCreate.model_rebuild()
OutletUpdate.model_rebuild()
OutletResponse.model_rebuild()
OutletWithUsersResponse.model_rebuild()
