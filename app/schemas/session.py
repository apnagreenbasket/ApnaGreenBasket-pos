"""
Session schemas — start/resume sessions, extend, abandon cart, session status,
customer history.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field, computed_field

from app.schemas.common import BaseResponse, StrictSchema
from app.schemas.order import OrderResponse


# ── Session creation / resume ────────────────────────────────────────────


class StartSessionRequest(StrictSchema):
    """Start a new session or resume an existing one at a basket."""
    outlet_slug: str = Field(min_length=1, max_length=100)
    basket_number: str = Field(min_length=1, max_length=50)
    customer_name: str = Field(min_length=1, max_length=255)
    customer_phone: str | None = Field(None, max_length=20)


class StartSessionResponse(BaseResponse):
    session_id: uuid.UUID
    customer_name: str
    basket_number: str
    is_returning: bool = False  # true if phone matched existing customer
    active_orders: list[OrderResponse] = []
    expires_at: datetime
    session_duration_minutes: int = 30


class ResumeSessionRequest(StrictSchema):
    """Lookup and resume an active session by name + basket."""
    outlet_slug: str = Field(min_length=1, max_length=100)
    basket_number: str = Field(min_length=1, max_length=50)
    customer_name: str = Field(min_length=1, max_length=255)


# ── Session status ───────────────────────────────────────────────────────


class SessionStatusResponse(BaseResponse):
    session_id: uuid.UUID
    customer_name: str
    basket_number: str
    is_active: bool
    status: str  # ACTIVE / COMPLETED / EXPIRED / TERMINATED
    expires_at: datetime
    session_duration_minutes: int = 30
    orders: list[OrderResponse] = []


# ── Session extension ────────────────────────────────────────────────────


class ExtendSessionResponse(BaseResponse):
    session_id: uuid.UUID
    expires_at: datetime
    session_duration_minutes: int


# ── Abandoned cart ───────────────────────────────────────────────────────


class AbandonCartItemInput(StrictSchema):
    """Single item in an abandoned cart push."""
    menu_item_id: str
    variant_id: str | None = None
    name: str
    quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    pricing_mode: str | None = None  # WEIGHT_BASED / FIXED_UNIT
    unit_label: str | None = None


class AbandonCartRequest(StrictSchema):
    """Frontend pushes local cart on session expiry."""
    items: list[AbandonCartItemInput] = Field(default_factory=list)
    total_estimate: Decimal = Field(default=Decimal("0"), ge=0)


class AbandonedCartResponse(BaseResponse):
    id: str
    outlet_id: str | None = None
    session_id: str
    basket_number: str
    customer_name: str
    customer_phone: str | None = None
    items: list[dict[str, Any]] = []
    total_estimate: float
    status: str  # ABANDONED / CONVERTED / DISMISSED
    converted_order_id: str | None = None
    created_at: str


# ── Customer history ─────────────────────────────────────────────────────


class CustomerHistoryRequest(StrictSchema):
    phone: str = Field(min_length=1, max_length=20)
    outlet_slug: str = Field(min_length=1, max_length=100)
    days: int = Field(default=30, ge=1, le=365)


class CustomerHistoryResponse(BaseResponse):
    customer_name: str
    customer_phone: str
    past_orders: list[OrderResponse] = []


# ── Staff Assistance ────────────────────────────────────────────────────


class StaffAddItemInput(StrictSchema):
    """Single item input for staff adding items to customer basket."""
    menu_item_id: str
    variant_id: str | None = None
    quantity: Decimal = Field(default=Decimal("1.0"), gt=0)


class StaffAddItemsRequest(StrictSchema):
    """Staff adds items directly to an active customer basket session."""
    items: list[StaffAddItemInput] = Field(min_length=1)
    notes: str | None = Field(None, max_length=500)


class StaffAddItemsResponse(BaseResponse):
    order_id: uuid.UUID
    session_id: uuid.UUID
    basket_number: str
    customer_name: str
    total_amount: Decimal
    status: str
    added_items_count: int
    added_by_staff_id: uuid.UUID | None = None
