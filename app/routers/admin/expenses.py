"""
Expenses admin router — log, list, update, delete operational expenses
and fetch profit & loss summary with actual net profit.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query, status

from app.core.datetime_utils import ensure_naive_utc
from app.dependencies import DBSession, RequireAdmin
from app.schemas.expense import (
    ExpenseCreate,
    ExpensePageResponse,
    ExpenseResponse,
    ExpenseSummaryResponse,
    ExpenseUpdate,
    PayrollStaffCreate,
    PayrollStaffResponse,
    PayrollStaffUpdate,
    StaffSalaryRosterResponse,
    UpdateStaffSalaryRequest,
)
from app.services.expense_service import (
    create_expense,
    create_payroll_staff,
    delete_expense,
    delete_payroll_staff,
    get_expense_summary,
    get_staff_salary_roster,
    list_expenses,
    list_payroll_staff,
    update_expense,
    update_payroll_staff,
    update_staff_salary,
)

router = APIRouter(prefix="/api/admin/expenses", tags=["admin-expenses"])


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime, datetime]:
    """Parse ISO date strings or default to current month."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Default: start of current month to now
    to_dt = now
    from_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    if from_date and from_date.strip():
        try:
            s = from_date.strip()
            parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
            val = ensure_naive_utc(parsed)
            if val:
                from_dt = val
        except Exception:
            pass

    if to_date and to_date.strip():
        try:
            s = to_date.strip()
            if len(s) == 10 and s.count("-") == 2:
                parsed = datetime.fromisoformat(s + "T23:59:59.999999+00:00")
            else:
                parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
            val = ensure_naive_utc(parsed)
            if val:
                to_dt = val
        except Exception:
            pass

    if from_dt > to_dt:
        from_dt, to_dt = to_dt, from_dt

    return from_dt, to_dt


@router.get("/summary", response_model=ExpenseSummaryResponse)
async def get_expenses_summary(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Get profit & loss summary: gross profit minus operating expenses = actual net profit."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_expense_summary(db, outlet_id, from_dt, to_dt)


@router.get("", response_model=ExpensePageResponse)
async def list_expenses_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    category: str | None = Query(None),
    search: str | None = Query(None),
):
    """List expenses with pagination and optional date/category/search filter."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await list_expenses(
        db,
        outlet_id=outlet_id,
        page=page,
        page_size=page_size,
        from_dt=from_dt,
        to_dt=to_dt,
        category=category,
        search=search,
    )


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    body: ExpenseCreate,
):
    """Log a new operational expense."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    expense = await create_expense(
        db,
        outlet_id=outlet_id,
        data=body,
        logged_by_staff_id=current_user.user_id,
    )
    return ExpenseResponse.model_validate(expense)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update_expense_endpoint(
    expense_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
    body: ExpenseUpdate,
):
    """Update an existing expense."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    expense = await update_expense(db, expense_id=expense_id, outlet_id=outlet_id, data=body)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return ExpenseResponse.model_validate(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_endpoint(
    expense_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete an expense record."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    deleted = await delete_expense(db, expense_id=expense_id, outlet_id=outlet_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Expense not found")


@router.get("/staff-salaries", response_model=StaffSalaryRosterResponse)
async def get_staff_salaries_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    month: str | None = Query(None, description="Month in YYYY-MM format"),
):
    """Fetch staff salary status & payment roster for an outlet for a given month."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    return await get_staff_salary_roster(db, outlet_id, month)


@router.patch("/staff/{staff_id}/salary")
async def update_staff_salary_endpoint(
    staff_id: uuid.UUID,
    body: UpdateStaffSalaryRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update base monthly salary for a staff member."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    staff = await update_staff_salary(db, outlet_id, staff_id, body.base_salary)
    return {
        "status": "success",
        "staff_id": str(staff.id),
        "base_salary": float(staff.base_salary) if staff.base_salary is not None else None,
    }


@router.get("/payroll-staff", response_model=list[PayrollStaffResponse])
async def list_payroll_staff_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
):
    """List all physical/ground store staff onboarded for payroll."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    staff_list = await list_payroll_staff(db, outlet_id)
    return [PayrollStaffResponse.model_validate(s) for s in staff_list]


@router.post("/payroll-staff", response_model=PayrollStaffResponse, status_code=status.HTTP_201_CREATED)
async def create_payroll_staff_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    body: PayrollStaffCreate,
):
    """Onboard a new physical store/ground staff member for payroll tracking."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    staff = await create_payroll_staff(db, outlet_id, body)
    return PayrollStaffResponse.model_validate(staff)


@router.patch("/payroll-staff/{staff_id}", response_model=PayrollStaffResponse)
async def update_payroll_staff_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
    body: PayrollStaffUpdate,
):
    """Update details of a physical store/ground staff member."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    staff = await update_payroll_staff(db, outlet_id, staff_id, body)
    return PayrollStaffResponse.model_validate(staff)


@router.delete("/payroll-staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payroll_staff_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Remove/deactivate a physical store/ground staff member from payroll."""
    outlet_id = current_user.outlet_id
    if not outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    await delete_payroll_staff(db, outlet_id, staff_id)
