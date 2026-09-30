"""
Staff schemas — CRUD requests/responses, PIN setup, login, PIN quick-switch, permissions, and audit logs.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from typing import Any

from pydantic import EmailStr, Field, computed_field, field_validator

from app.models.enums import RoleEnum
from app.schemas.common import BaseResponse, StrictSchema


class StaffCreate(StrictSchema):
    outlet_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    role: RoleEnum = Field(default=RoleEnum.STAFF)
    password: str = Field(min_length=8, max_length=100)
    pin: str | None = Field(None, min_length=4, max_length=4, pattern="^[0-9]{4}$")

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            digits = "".join(c for c in v if c.isdigit())
            if len(digits) < 10:
                raise ValueError("Phone number must contain at least 10 digits")
            if len(digits) > 15:
                raise ValueError("Phone number cannot exceed 15 digits")
            return v
        return v


class StaffUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    role: RoleEnum | None = None
    status: str | None = Field(None, pattern="^(active|inactive)$")

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            digits = "".join(c for c in v if c.isdigit())
            if len(digits) < 10:
                raise ValueError("Phone number must contain at least 10 digits")
            if len(digits) > 15:
                raise ValueError("Phone number cannot exceed 15 digits")
            return v
        return v


class StaffResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID | None = None
    name: str
    email: str
    phone: str | None
    role: RoleEnum
    status: str
    has_pin: bool
    created_at: datetime
    updated_at: datetime


class SetPinRequest(StrictSchema):
    pin: str = Field(min_length=4, max_length=4, pattern="^[0-9]{4}$")


class StaffLoginRequest(StrictSchema):
    email: EmailStr
    password: str
    outlet_id: uuid.UUID | None = None


class StaffPinSwitchRequest(StrictSchema):
    staff_id: uuid.UUID
    pin: str = Field(min_length=4, max_length=4, pattern="^[0-9]{4}$")


class StaffPinLoginRequest(StrictSchema):
    outlet_id: uuid.UUID
    staff_id: uuid.UUID | None = None
    pin: str = Field(min_length=4, max_length=4, pattern="^[0-9]{4}$")

class StaffPublic(StrictSchema):
    id: uuid.UUID
    name: str


class StaffLoginResponse(BaseResponse):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    staff: StaffResponse


class StaffContextTokenResponse(BaseResponse):
    staff_context_token: str
    token_type: str = "bearer"
    active_staff: StaffResponse


class RolePermissions(StrictSchema):
    can_manage_staff: bool
    can_manage_billing: bool
    can_edit_menu: bool
    can_manage_inventory: bool
    can_cancel_orders: bool
    can_process_payments: bool
    can_manage_orders: bool
    can_view_analytics: bool
    allowed_sidebar_tabs: list[str]


class StaffAuditLogResponse(BaseResponse):
    id: uuid.UUID
    staff_id: uuid.UUID | None
    staff_name: str | None = None
    outlet_id: uuid.UUID
    action_type: str
    reference_type: str | None
    reference_id: str | None
    details: str | None
    created_at: datetime


class StaffAuditLogPageResponse(BaseResponse):
    items: list[StaffAuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class StaffPunchInRequest(StrictSchema):
    opening_cash: Decimal | None = None


class StaffPunchStatusResponse(BaseResponse):
    is_exempt: bool
    is_punched_in: bool
    session_id: uuid.UUID | None = None
    punch_in_at: datetime | None = None
    elapsed_seconds: int = 0
    max_shift_seconds: int = 43200
    opening_cash: Decimal = Decimal("0.00")
    current_drawer_balance: Decimal = Decimal("0.00")
    live_bills_count: int = 0
    live_sales_amount: Decimal = Decimal("0.00")
    live_cash_collected: Decimal = Decimal("0.00")
    live_upi_collected: Decimal = Decimal("0.00")
    live_returns_cash: Decimal = Decimal("0.00")
    live_expected_drawer_cash: Decimal = Decimal("0.00")


class StaffPunchOutRequest(StrictSchema):
    notes: str | None = None
    actual_cash_handed_over: Decimal | None = None
    closing_notes: str | None = None


class ShiftFinancialSummary(BaseResponse):
    session_id: uuid.UUID
    staff_id: uuid.UUID
    staff_name: str
    staff_role: str
    punch_in_at: datetime
    punch_out_at: datetime | None = None
    duration_seconds: int = 0
    duration_formatted: str = "0s"
    opening_cash: Decimal = Decimal("0.00")
    total_bills_count: int = 0
    total_sales_amount: Decimal = Decimal("0.00")
    cash_collected: Decimal = Decimal("0.00")
    upi_collected: Decimal = Decimal("0.00")
    card_collected: Decimal = Decimal("0.00")
    returns_refund_cash: Decimal = Decimal("0.00")
    expected_cash_in_drawer: Decimal = Decimal("0.00")
    actual_cash_handed_over: Decimal = Decimal("0.00")
    cash_difference: Decimal = Decimal("0.00")
    status: str = "OPEN"
    notes: str | None = None


class StaffPunchSessionItem(BaseResponse):
    id: uuid.UUID
    staff_id: uuid.UUID
    staff_name: str
    staff_email: str | None = None
    staff_role: str
    punch_in_at: datetime
    punch_out_at: datetime | None = None
    duration_seconds: int | None = None
    duration_formatted: str | None = None
    opening_cash: Decimal = Decimal("0.00")
    total_bills_count: int = 0
    total_sales_amount: Decimal = Decimal("0.00")
    cash_collected: Decimal = Decimal("0.00")
    upi_collected: Decimal = Decimal("0.00")
    card_collected: Decimal = Decimal("0.00")
    returns_refund_cash: Decimal = Decimal("0.00")
    expected_cash_in_drawer: Decimal = Decimal("0.00")
    actual_cash_handed_over: Decimal = Decimal("0.00")
    cash_difference: Decimal = Decimal("0.00")
    status: str = "OPEN"
    auto_punched_out: bool = False
    notes: str | None = None
    created_at: datetime

