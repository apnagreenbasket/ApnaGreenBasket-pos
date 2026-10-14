"""
Expense Pydantic schemas — request/response models for expense tracking API.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums (as string constants) ──────────────────────────────────────────────

EXPENSE_CATEGORIES = [
    "SALARY",
    "RENT",
    "ELECTRICITY",
    "EQUIPMENT",
    "MAINTENANCE",
    "PACKAGING",
    "MARKETING",
    "OTHER",
]

PAYMENT_METHODS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"]


# ── Request Schemas ───────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    category: str = Field(..., description="Expense category (e.g., SALARY, RENT, OTHER)")
    custom_category: Optional[str] = Field(None, description="Custom description when category=OTHER")
    amount: float = Field(..., gt=0, description="Expense amount (must be positive)")
    payment_method: str = Field("CASH", description="Payment method used")
    description: Optional[str] = Field(None, max_length=500)
    expense_date: Optional[datetime] = Field(None, description="Date of expense (defaults to now)")
    logged_by_staff_name: Optional[str] = Field(None, description="Name of staff who logged this")
    recipient_staff_id: Optional[uuid.UUID] = Field(None, description="Staff member who received payout (for SALARY)")
    recipient_staff_name: Optional[str] = Field(None, description="Staff member name")
    salary_month: Optional[str] = Field(None, description="Payout month in YYYY-MM format")


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    custom_category: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    payment_method: Optional[str] = None
    description: Optional[str] = None
    expense_date: Optional[datetime] = None
    recipient_staff_id: Optional[uuid.UUID] = None
    recipient_staff_name: Optional[str] = None
    salary_month: Optional[str] = None


# ── Response Schemas ──────────────────────────────────────────────────────────

class ExpenseResponse(BaseModel):
    id: uuid.UUID
    outlet_id: uuid.UUID
    category: str
    custom_category: Optional[str]
    amount: float
    payment_method: str
    description: Optional[str]
    expense_date: datetime
    logged_by_staff_id: Optional[uuid.UUID]
    logged_by_staff_name: Optional[str]
    recipient_staff_id: Optional[uuid.UUID] = None
    recipient_staff_name: Optional[str] = None
    salary_month: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PayrollStaffCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field("Store Staff", max_length=100)
    phone: str = Field(..., min_length=10, max_length=50, description="Mobile number (required and unique)")
    base_salary: float = Field(..., ge=0, description="Monthly base salary in INR")
    notes: Optional[str] = Field(None, max_length=500)


class PayrollStaffUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, min_length=10, max_length=50)
    base_salary: Optional[float] = Field(None, ge=0)
    status: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=500)


class PayrollStaffResponse(BaseModel):
    id: uuid.UUID
    outlet_id: uuid.UUID
    name: str
    role: str
    phone: Optional[str] = None
    base_salary: float
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StaffSalaryStatusItem(BaseModel):
    staff_id: uuid.UUID
    staff_name: str
    role: str
    phone: Optional[str] = None
    email: Optional[str] = None
    base_salary: Optional[float] = None
    is_paid: bool = False
    paid_amount: Optional[float] = None
    paid_date: Optional[datetime] = None
    payment_method: Optional[str] = None
    expense_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class StaffSalaryRosterResponse(BaseModel):
    month: str
    total_staff: int
    paid_count: int
    pending_count: int
    total_salary_budget: float
    total_salary_paid: float
    items: list[StaffSalaryStatusItem]


class UpdateStaffSalaryRequest(BaseModel):
    base_salary: float = Field(..., ge=0, description="Monthly base salary in INR")


class ExpensePageResponse(BaseModel):
    items: list[ExpenseResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CategoryBreakdown(BaseModel):
    category: str
    display_name: str
    total: float
    count: int
    pct: float  # percentage of total expenses


class ExpenseSummaryResponse(BaseModel):
    from_date: str
    to_date: str
    # Revenue / Profit (from analytics)
    gross_revenue: float
    total_cogs: float
    gross_profit: float
    gross_margin_pct: float
    # Expenses
    total_expenses: float
    expenses_by_category: list[CategoryBreakdown]
    # Net (after expenses)
    actual_net_profit: float
    actual_margin_pct: float
    # Counts
    expense_count: int
