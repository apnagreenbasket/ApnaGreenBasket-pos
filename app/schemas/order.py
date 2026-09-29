"""
Order schemas — checkout, status updates, responses.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, computed_field

from app.models.enums import OrderStatusEnum, PaymentModeEnum
from app.schemas.common import BaseResponse, StrictSchema


# ── Order creation ───────────────────────────────────────────────────────


class OrderItemRequest(StrictSchema):
    menu_item_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    quantity: Decimal = Field(gt=0, le=1000)
    added_by_staff_id: uuid.UUID | None = None


class CheckoutRequest(StrictSchema):
    """Customer-facing checkout — total is computed server-side, never trusted from client."""
    outlet_slug: str = Field(min_length=1, max_length=100)
    basket_number: str = Field(min_length=1, max_length=50)
    customer_name: str | None = Field(None, max_length=255)
    customer_phone: str | None = Field(None, max_length=20)
    payment_mode: PaymentModeEnum = PaymentModeEnum.PAY_AT_COUNTER
    session_id: uuid.UUID | None = None
    items: list[OrderItemRequest] = Field(min_length=1)


# ── Order responses ──────────────────────────────────────────────────────


class OutletInfoResponse(BaseResponse):
    id: uuid.UUID
    name: str
    slug: str
    address: str | None = None
    phone: str | None = None
    gstin: str | None = None
    fssai_no: str | None = None
    logo_url: str | None = None
    email: str | None = None
    bill_qr_url: str | None = None
    place_of_supply: str | None = None


class OrderItemResponse(BaseResponse):
    id: uuid.UUID
    menu_item_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    added_by_staff_id: uuid.UUID | None = None
    item_name: str | None = None
    quantity: Decimal
    selected_unit: str | None = None
    unit_price: Decimal
    line_total: Decimal | None = None
    is_complimentary: bool = False
    tax_rate: Decimal | None = Decimal("0.00")
    tax_category: str | None = "GST 0%"
    hsn_code: str | None = None
    mrp: Decimal | None = None


class OrderResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    session_id: uuid.UUID | None = None
    basket_number: str
    customer_name: str | None
    customer_phone: str | None
    total_amount: Decimal
    status: OrderStatusEnum
    payment_reference: str | None
    payment_method: str | None = None
    source: str = "qr"
    is_auto_verified: bool = False
    created_at: datetime
    updated_at: datetime
    delivery_charge: Decimal = Decimal("0.00")
    handling_charge: Decimal = Decimal("0.00")
    is_interstate: bool = False
    place_of_supply: str | None = None
    credit_applied: Decimal = Decimal("0.00")
    debit_applied: Decimal = Decimal("0.00")
    credit_awarded: Decimal = Decimal("0.00")
    debt_settled: Decimal = Decimal("0.00")
    credit_cashed_out: Decimal = Decimal("0.00")
    items: list[OrderItemResponse] = []
    outlet: OutletInfoResponse | None = None


# ── Razorpay checkout response ──────────────────────────────────────────


class RazorpayCheckoutResponse(BaseResponse):
    order_id: uuid.UUID
    razorpay_order_id: str
    amount: int  # in paise
    currency: str = "INR"
    key_id: str


# ── Pay After Meal checkout response ───────────────────────────────────


class PayAfterMealCheckoutResponse(BaseResponse):
    order_id: uuid.UUID
    total_amount: Decimal


# ── Status updates ───────────────────────────────────────────────────────


class OrderStatusUpdate(StrictSchema):
    status: OrderStatusEnum


class ClaimPaidRequest(StrictSchema):
    """Customer claims they've paid (Mode B only)."""
    utr_number: str | None = Field(
        None,
        description="Optional 12-digit UTR / transaction reference number entered by diner",
        max_length=50,
    )


class ConfirmPaymentRequest(StrictSchema):
    """Staff confirms payment (Mode B only)."""
    payment_reference: str | None = Field(
        None,
        description="Optional UTR / transaction reference entered by staff",
        max_length=255,
    )

class OrderPageResponse(BaseModel):
    items: list[OrderResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
