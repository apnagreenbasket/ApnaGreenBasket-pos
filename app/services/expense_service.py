"""
Expense Service — CRUD operations and summary analytics for expense tracking.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import ensure_naive_utc
from app.models.expense import Expense
from app.models.order import Order
from app.models.stock_ledger import StockLedger
from app.models.customer_return import CustomerReturn
from app.models.enums import OrderStatusEnum, StockChangeTypeEnum
from decimal import Decimal
from sqlalchemy import case, or_, and_
from app.models.payroll_staff import PayrollStaff
from app.models.user import User
from app.schemas.expense import (
    CategoryBreakdown,
    ExpenseCreate,
    ExpensePageResponse,
    ExpenseResponse,
    ExpenseSummaryResponse,
    ExpenseUpdate,
    PayrollStaffCreate,
    PayrollStaffResponse,
    PayrollStaffUpdate,
    StaffSalaryRosterResponse,
    StaffSalaryStatusItem,
)


# Valid settled order statuses for revenue calculation
SETTLED_STATUSES = [
    OrderStatusEnum.PAID,
    OrderStatusEnum.COMPLETED,
    OrderStatusEnum.PARTIALLY_REFUNDED,
    OrderStatusEnum.REFUNDED,
]

CATEGORY_DISPLAY_NAMES = {
    "SALARY": "Staff Salary",
    "RENT": "Rent",
    "ELECTRICITY": "Electricity",
    "EQUIPMENT": "Equipment / Machinery",
    "MAINTENANCE": "Maintenance",
    "PACKAGING": "Packaging / Plastic",
    "MARKETING": "Marketing",
    "OTHER": "Other",
}


async def create_expense(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: ExpenseCreate,
    logged_by_staff_id: uuid.UUID | None = None,
) -> Expense:
    """Create a new expense record."""
    exp_date = ensure_naive_utc(data.expense_date) if data.expense_date else datetime.utcnow()
    sal_month = data.salary_month.strip() if data.salary_month and data.salary_month.strip() else None

    if data.category.upper() == "SALARY":
        if sal_month:
            # If sal_month is specified (e.g. "2026-10"), ensure exp_date is aligned to this month
            try:
                import calendar
                sy, sm = map(int, sal_month.split("-"))
                if exp_date.year != sy or exp_date.month != sm:
                    max_day = calendar.monthrange(sy, sm)[1]
                    target_day = min(exp_date.day, max_day)
                    exp_date = exp_date.replace(year=sy, month=sm, day=target_day)
            except Exception:
                pass
        else:
            sal_month = exp_date.strftime("%Y-%m")

    recip_name = data.recipient_staff_name
    if data.recipient_staff_id and not recip_name:
        ps_res = await db.execute(
            select(PayrollStaff.name).where(PayrollStaff.id == data.recipient_staff_id)
        )
        recip_name = ps_res.scalar_one_or_none()
        if not recip_name:
            u_res = await db.execute(select(User.name).where(User.id == data.recipient_staff_id))
            recip_name = u_res.scalar_one_or_none()

    expense = Expense(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category=data.category.upper(),
        custom_category=data.custom_category,
        amount=float(data.amount),
        payment_method=data.payment_method.upper(),
        description=data.description,
        expense_date=exp_date,
        logged_by_staff_id=logged_by_staff_id,
        logged_by_staff_name=data.logged_by_staff_name,
        recipient_staff_id=data.recipient_staff_id,
        recipient_staff_name=recip_name,
        salary_month=sal_month,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


async def list_expenses(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
    category: str | None = None,
    search: str | None = None,
) -> ExpensePageResponse:
    """List expenses with pagination and optional filtering."""
    stmt = select(Expense).where(Expense.outlet_id == outlet_id)

    if from_dt:
        stmt = stmt.where(Expense.expense_date >= ensure_naive_utc(from_dt))
    if to_dt:
        stmt = stmt.where(Expense.expense_date <= ensure_naive_utc(to_dt))
    if category and category.upper() != "ALL":
        stmt = stmt.where(Expense.category == category.upper())
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                Expense.description.ilike(like),
                Expense.custom_category.ilike(like),
                Expense.logged_by_staff_name.ilike(like),
            )
        )

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Paginate
    stmt = stmt.order_by(Expense.expense_date.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return ExpensePageResponse(
        items=[ExpenseResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)),
    )


async def update_expense(
    db: AsyncSession,
    expense_id: uuid.UUID,
    outlet_id: uuid.UUID,
    data: ExpenseUpdate,
) -> Expense | None:
    """Update an expense. Returns None if not found."""
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.outlet_id == outlet_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return None

    if data.category is not None:
        expense.category = data.category.upper()
    if data.custom_category is not None:
        expense.custom_category = data.custom_category
    if data.amount is not None:
        expense.amount = float(data.amount)
    if data.payment_method is not None:
        expense.payment_method = data.payment_method.upper()
    if data.description is not None:
        expense.description = data.description
    if data.expense_date is not None:
        expense.expense_date = ensure_naive_utc(data.expense_date)
        if expense.category == "SALARY" and not data.salary_month:
            expense.salary_month = expense.expense_date.strftime("%Y-%m")
    if data.salary_month is not None:
        expense.salary_month = data.salary_month.strip() or None
        if expense.category == "SALARY" and expense.salary_month:
            try:
                import calendar
                sy, sm = map(int, expense.salary_month.split("-"))
                if expense.expense_date.year != sy or expense.expense_date.month != sm:
                    max_day = calendar.monthrange(sy, sm)[1]
                    target_day = min(expense.expense_date.day, max_day)
                    expense.expense_date = expense.expense_date.replace(year=sy, month=sm, day=target_day)
            except Exception:
                pass
    if data.recipient_staff_id is not None:
        expense.recipient_staff_id = data.recipient_staff_id
    if data.recipient_staff_name is not None:
        expense.recipient_staff_name = data.recipient_staff_name
    expense.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(expense)
    return expense


async def delete_expense(
    db: AsyncSession,
    expense_id: uuid.UUID,
    outlet_id: uuid.UUID,
) -> bool:
    """Delete an expense. Returns True if deleted, False if not found."""
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.outlet_id == outlet_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        return False
    await db.delete(expense)
    await db.commit()
    return True


async def get_expense_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> ExpenseSummaryResponse:
    """
    Compute expense summary + gross profit from sales, yielding actual net profit.
    actual_net_profit = gross_profit - total_expenses
    """
    from_dt_naive = ensure_naive_utc(from_dt)
    to_dt_naive = ensure_naive_utc(to_dt)

    # ── 1. Gross Revenue (settled orders, excluding voids) ───────────────────
    rev_stmt = select(func.sum(Order.total_amount)).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt_naive,
        Order.created_at <= to_dt_naive,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    gross_revenue = float((await db.execute(rev_stmt)).scalar_one() or 0)

    # ── 2. Customer Returns (refunds deducted from revenue) ──────────────────
    ret_stmt = (
        select(
            func.sum(
                func.coalesce(
                    func.nullif(CustomerReturn.gross_return_amount, 0),
                    CustomerReturn.total_refund_amount + CustomerReturn.total_exchange_amount,
                    CustomerReturn.total_refund_amount,
                    0,
                )
            )
        )
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt_naive,
            CustomerReturn.created_at <= to_dt_naive,
            or_(Order.id.is_(None), Order.is_void == False),
        )
    )
    total_returns = float((await db.execute(ret_stmt)).scalar_one() or 0)
    net_revenue = gross_revenue - total_returns

    # ── 3. COGS (stock deductions for settled orders) ────────────────────────
    cogs_stmt = (
        select(
            func.sum(
                case(
                    (StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
                     -func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0)),
                    else_=func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0),
                )
            )
        )
        .select_from(StockLedger)
        .join(Order, StockLedger.reference_order_id == Order.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            StockLedger.change_type.in_([
                StockChangeTypeEnum.AUTO_DEDUCTION,
                StockChangeTypeEnum.OVERSOLD,
                StockChangeTypeEnum.RESTOCK,
            ]),
        )
    )
    total_cogs = float((await db.execute(cogs_stmt)).scalar_one() or 0)

    gross_profit = net_revenue - total_cogs
    gross_margin_pct = round((gross_profit / net_revenue) * 100, 2) if net_revenue > 0 else 0.0

    # ── 4. Total Expenses in date range ─────────────────────────────────────
    exp_total_stmt = select(func.sum(Expense.amount)).where(
        Expense.outlet_id == outlet_id,
        Expense.expense_date >= from_dt_naive,
        Expense.expense_date <= to_dt_naive,
    )
    total_expenses = float((await db.execute(exp_total_stmt)).scalar_one() or 0)

    # ── 5. Expenses breakdown by category ───────────────────────────────────
    cat_stmt = (
        select(
            Expense.category,
            func.sum(Expense.amount).label("cat_total"),
            func.count(Expense.id).label("cat_count"),
        )
        .where(
            Expense.outlet_id == outlet_id,
            Expense.expense_date >= from_dt_naive,
            Expense.expense_date <= to_dt_naive,
        )
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
    )
    cat_rows = (await db.execute(cat_stmt)).all()

    category_breakdown: list[CategoryBreakdown] = []
    for row in cat_rows:
        cat_total = float(row.cat_total or 0)
        pct = round((cat_total / total_expenses) * 100, 1) if total_expenses > 0 else 0.0
        category_breakdown.append(
            CategoryBreakdown(
                category=row.category,
                display_name=CATEGORY_DISPLAY_NAMES.get(row.category, row.category.title()),
                total=round(cat_total, 2),
                count=row.cat_count,
                pct=pct,
            )
        )

    # Count total expense records
    count_stmt = select(func.count(Expense.id)).where(
        Expense.outlet_id == outlet_id,
        Expense.expense_date >= from_dt_naive,
        Expense.expense_date <= to_dt_naive,
    )
    expense_count = int((await db.execute(count_stmt)).scalar_one() or 0)

    # ── 6. Actual Net Profit ─────────────────────────────────────────────────
    actual_net_profit = gross_profit - total_expenses
    actual_margin_pct = round((actual_net_profit / net_revenue) * 100, 2) if net_revenue > 0 else 0.0

    return ExpenseSummaryResponse(
        from_date=from_dt_naive.isoformat(),
        to_date=to_dt_naive.isoformat(),
        gross_revenue=round(net_revenue, 2),
        total_cogs=round(total_cogs, 2),
        gross_profit=round(gross_profit, 2),
        gross_margin_pct=gross_margin_pct,
        total_expenses=round(total_expenses, 2),
        expenses_by_category=category_breakdown,
        actual_net_profit=round(actual_net_profit, 2),
        actual_margin_pct=actual_margin_pct,
        expense_count=expense_count,
    )


async def create_payroll_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: PayrollStaffCreate,
) -> PayrollStaff:
    """Onboard a physical/ground staff member for expense & payroll tracking."""
    from fastapi import HTTPException

    clean_phone = data.phone.strip().replace(" ", "").replace("-", "")
    if not clean_phone or len(clean_phone) < 10:
        raise HTTPException(
            status_code=400,
            detail="Mobile number is required and must be at least 10 digits.",
        )

    # Check phone uniqueness across active staff in this outlet
    dup_res = await db.execute(
        select(PayrollStaff).where(
            PayrollStaff.outlet_id == outlet_id,
            PayrollStaff.phone == clean_phone,
            PayrollStaff.status == "active",
        )
    )
    dup = dup_res.scalar_one_or_none()
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"A staff member ('{dup.name}') with mobile number {clean_phone} already exists in this outlet.",
        )

    staff = PayrollStaff(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=data.name.strip(),
        role=data.role.strip() if data.role else "Store Staff",
        phone=clean_phone,
        base_salary=Decimal(str(data.base_salary)),
        status="active",
        notes=data.notes.strip() if data.notes else None,
    )
    db.add(staff)
    await db.commit()
    await db.refresh(staff)
    return staff


async def list_payroll_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
) -> list[PayrollStaff]:
    """List all active payroll staff for an outlet."""
    stmt = (
        select(PayrollStaff)
        .where(PayrollStaff.outlet_id == outlet_id, PayrollStaff.status == "active")
        .order_by(PayrollStaff.name.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def update_payroll_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    data: PayrollStaffUpdate,
) -> PayrollStaff:
    """Update payroll staff details."""
    from fastapi import HTTPException
    stmt = select(PayrollStaff).where(
        PayrollStaff.id == staff_id,
        PayrollStaff.outlet_id == outlet_id,
    )
    staff = (await db.execute(stmt)).scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Payroll staff member not found.")

    if data.name is not None:
        staff.name = data.name.strip()
    if data.role is not None:
        staff.role = data.role.strip()
    if data.phone is not None:
        clean_phone = data.phone.strip().replace(" ", "").replace("-", "")
        if not clean_phone or len(clean_phone) < 10:
            raise HTTPException(
                status_code=400,
                detail="Mobile number is required and must be at least 10 digits.",
            )
        # Check uniqueness against other active staff in this outlet
        dup_res = await db.execute(
            select(PayrollStaff).where(
                PayrollStaff.outlet_id == outlet_id,
                PayrollStaff.phone == clean_phone,
                PayrollStaff.id != staff_id,
                PayrollStaff.status == "active",
            )
        )
        dup = dup_res.scalar_one_or_none()
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Another staff member ('{dup.name}') already has mobile number {clean_phone}.",
            )
        staff.phone = clean_phone
    if data.base_salary is not None:
        staff.base_salary = Decimal(str(data.base_salary))
    if data.status is not None:
        staff.status = data.status
    if data.notes is not None:
        staff.notes = data.notes.strip() if data.notes else None

    await db.commit()
    await db.refresh(staff)
    return staff


async def delete_payroll_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
) -> bool:
    """Soft-deactivate a payroll staff member."""
    from fastapi import HTTPException
    stmt = select(PayrollStaff).where(
        PayrollStaff.id == staff_id,
        PayrollStaff.outlet_id == outlet_id,
    )
    staff = (await db.execute(stmt)).scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Payroll staff member not found.")

    staff.status = "inactive"
    await db.commit()
    return True


async def get_staff_salary_roster(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    month: str | None = None,
) -> StaffSalaryRosterResponse:
    """
    Get all active payroll staff in an outlet with their base salary and payment status for a specific month (YYYY-MM).
    Exclusively queries the dedicated `payroll_staff` table (never app/system users).
    """
    now = datetime.utcnow()
    target_month = month.strip() if month and month.strip() else now.strftime("%Y-%m")

    # 1. Fetch all active payroll staff in this outlet
    staff_stmt = (
        select(PayrollStaff)
        .where(
            PayrollStaff.outlet_id == outlet_id,
            PayrollStaff.status == "active",
        )
        .order_by(PayrollStaff.name.asc())
    )
    staff_rows = (await db.execute(staff_stmt)).scalars().all()

    # 2. Derive month date boundaries
    try:
        y, m = map(int, target_month.split("-"))
        m_start = datetime(y, m, 1)
        if m == 12:
            m_end = datetime(y + 1, 1, 1)
        else:
            m_end = datetime(y, m + 1, 1)
    except Exception:
        m_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        m_end = now

    # 3. Query SALARY expenses in this outlet for target month
    sal_stmt = (
        select(Expense)
        .where(
            Expense.outlet_id == outlet_id,
            Expense.category == "SALARY",
            or_(
                Expense.salary_month == target_month,
                and_(Expense.expense_date >= m_start, Expense.expense_date < m_end),
            ),
        )
        .order_by(Expense.expense_date.desc())
    )
    salary_expenses = (await db.execute(sal_stmt)).scalars().all()

    # Map payments by recipient_staff_id
    paid_by_staff: dict[uuid.UUID, Expense] = {}
    for exp in salary_expenses:
        if exp.recipient_staff_id and exp.recipient_staff_id not in paid_by_staff:
            paid_by_staff[exp.recipient_staff_id] = exp

    items: list[StaffSalaryStatusItem] = []
    total_budget = 0.0
    total_paid = 0.0
    paid_count = 0

    for u in staff_rows:
        sal = float(u.base_salary) if u.base_salary is not None else 0.0
        total_budget += sal

        exp = paid_by_staff.get(u.id)
        if exp:
            is_paid = True
            paid_amount = float(exp.amount)
            paid_date = exp.expense_date
            pm = exp.payment_method
            exp_id = exp.id
            desc = exp.description
            total_paid += paid_amount
            paid_count += 1
        else:
            is_paid = False
            paid_amount = None
            paid_date = None
            pm = None
            exp_id = None
            desc = None

        items.append(
            StaffSalaryStatusItem(
                staff_id=u.id,
                staff_name=u.name,
                role=u.role,
                phone=u.phone,
                email=None,
                base_salary=sal,
                is_paid=is_paid,
                paid_amount=paid_amount,
                paid_date=paid_date,
                payment_method=pm,
                expense_id=exp_id,
                description=desc,
                notes=u.notes,
            )
        )

    return StaffSalaryRosterResponse(
        month=target_month,
        total_staff=len(staff_rows),
        paid_count=paid_count,
        pending_count=len(staff_rows) - paid_count,
        total_salary_budget=round(total_budget, 2),
        total_salary_paid=round(total_paid, 2),
        items=items,
    )


async def update_staff_salary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    base_salary: float,
) -> PayrollStaff:
    """Update base monthly salary for a payroll staff member."""
    from fastapi import HTTPException
    res = await db.execute(
        select(PayrollStaff).where(
            PayrollStaff.id == staff_id,
            PayrollStaff.outlet_id == outlet_id,
        )
    )
    staff = res.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=404, detail="Payroll staff member not found.")

    staff.base_salary = Decimal(str(base_salary))
    await db.commit()
    await db.refresh(staff)
    return staff
