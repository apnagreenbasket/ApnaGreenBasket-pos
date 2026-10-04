"""
Customer Pydantic schemas — requests and responses for Admin customer management.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from app.schemas.common import BaseResponse, StrictSchema


class CustomerCreate(StrictSchema):
    name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=3, max_length=20)
    extra_detail: str | None = Field(None, max_length=1000)
    gstin: str | None = Field(None, max_length=15)
    legal_name: str | None = Field(None, max_length=255)
    state_code: str | None = Field(None, max_length=2)
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)

    @field_validator("name", "phone", mode="before")
    @classmethod
    def strip_whitespace(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


class CustomerUpdate(StrictSchema):
    name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, min_length=3, max_length=20)
    extra_detail: str | None = Field(None, max_length=1000)
    gstin: str | None = Field(None, max_length=15)
    legal_name: str | None = Field(None, max_length=255)
    state_code: str | None = Field(None, max_length=2)
    address: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)

    @field_validator("name", "phone", mode="before")
    @classmethod
    def strip_whitespace(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v


class CustomerResponse(BaseResponse):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    phone: str
    total_orders: int = 0
    total_spent: float = 0.0
    loyalty_points: int = 0
    credit_balance: float = 0.0
    extra_detail: str | None = None
    gstin: str | None = None
    legal_name: str | None = None
    state_code: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    created_at: datetime
    updated_at: datetime


class CustomerLedgerEntryResponse(BaseResponse):
    id: str
    customer_id: str
    order_id: str | None = None
    order_basket_number: str | None = None
    entry_type: str
    amount: float
    balance_after: float
    note: str | None = None
    created_by_name: str | None = None
    created_at: datetime

from pydantic import BaseModel

class CustomerPageResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    total_customer_spend: float = 0.0
    total_customer_orders: int = 0
