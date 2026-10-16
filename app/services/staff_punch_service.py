"""
Staff punch-in / punch-out service for shift management, data isolation, and audit tracking.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import ensure_naive_utc, utc_now
from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.customer_return import CustomerReturn
from app.models.enums import OrderStatusEnum, RoleEnum
from app.models.order import Order
from app.models.staff_punch_session import StaffPunchSession
from app.services.staff_service import create_staff_audit_log

IST = timezone(timedelta(hours=5, minutes=30))


def get_today_start_utc() -> datetime:
    """
    Returns the UTC naive datetime corresponding to 00:00:00 (12:00 AM) IST of the current day.
    Any shift started before this timestamp belongs to a previous day and must be auto-closed at midnight.
    """
    now_ist = datetime.now(IST)
    today_start_ist = datetime(now_ist.year, now_ist.month, now_ist.day, 0, 0, 0, tzinfo=IST)
    return today_start_ist.astimezone(timezone.utc).replace(tzinfo=None)


MAX_SHIFT_DURATION_HOURS = 12
MAX_SHIFT_DURATION_SECONDS = MAX_SHIFT_DURATION_HOURS * 3600

# Roles exempt from mandatory shift punch-in
EXEMPT_ROLES = {
    RoleEnum.SUPERADMIN,
    RoleEnum.OUTLET_ADMIN,
    RoleEnum.MANAGER,
    RoleEnum.INVENTORY_MANAGER,
}


def is_role_exempt(role: RoleEnum | str | None) -> bool:
    """Check if a staff role is exempt from mandatory shift punch-in."""
    if not role:
        return False
    if isinstance(role, str):
        role_str = role.strip().upper()
        return role_str in ("SUPERADMIN", "OUTLET_ADMIN", "MANAGER", "INVENTORY_MANAGER")
    return role in EXEMPT_ROLES


def format_duration(seconds: int) -> str:
    """Format duration in seconds into human-readable string like '4h 15m 30s'."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0 or hours > 0:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


async def get_live_drawer_balance(db: AsyncSession, outlet_id: uuid.UUID) -> Decimal:
    """Calculate exact real-time live cash balance present in the outlet cash drawer."""
    stmt = (
        select(CashDrawerLedger)
        .outerjoin(Order, CashDrawerLedger.reference_order_id == Order.id)
        .where(
            CashDrawerLedger.outlet_id == outlet_id,
            or_(Order.id.is_(None), Order.is_void == False),
        )
    )
    res = await db.execute(stmt)
    entries = res.scalars().all()
    denoms: dict[str, int] = {}
    for entry in entries:
        ttype = entry.transaction_type
        for d, count in (entry.denominations or {}).items():
            cnt = int(count)
            if cnt == 0:
                continue
            if ttype in ("MANUAL_DEPOSIT", "CUSTOMER_PAYMENT"):
                denoms[str(d)] = denoms.get(str(d), 0) + abs(cnt)
            elif ttype in ("MANUAL_WITHDRAWAL", "CUSTOMER_CHANGE"):
                denoms[str(d)] = denoms.get(str(d), 0) - abs(cnt)
            elif ttype == "CUSTOMER_RETURN":
                # Net signed: positive means inward cash received, negative means refund cash paid out
                denoms[str(d)] = denoms.get(str(d), 0) + cnt
            else:
                denoms[str(d)] = denoms.get(str(d), 0) + cnt
    total = sum(Decimal(str(d)) * count for d, count in denoms.items())
    return max(Decimal("0.00"), total)


async def calculate_shift_financials(
    db: AsyncSession,
    session: StaffPunchSession,
) -> dict[str, Any]:
    """
    Calculate real-time financial metrics for a punch session:
    - total bills count & gross sales
    - cash collected, upi collected, card collected
    - returns refund cash deducted
    - expected cash in drawer = opening_cash + cash_collected - returns_refund_cash
    """
    start_utc = ensure_naive_utc(session.punch_in_at)
    if session.punch_out_at:
        end_utc = ensure_naive_utc(session.punch_out_at) + timedelta(seconds=2)
        order_time_filter = Order.created_at.between(start_utc, end_utc)
        return_time_filter = CustomerReturn.created_at.between(start_utc, end_utc)
    else:
        order_time_filter = Order.created_at >= start_utc
        return_time_filter = CustomerReturn.created_at >= start_utc

    # Query settled orders created by this staff member in this shift
    stmt = (
        select(Order)
        .where(
            Order.outlet_id == session.outlet_id,
            Order.created_by_staff_id == session.staff_id,
            order_time_filter,
            Order.status.in_([
                OrderStatusEnum.PAID,
                OrderStatusEnum.COMPLETED,
                OrderStatusEnum.PARTIALLY_REFUNDED,
            ]),
            Order.is_void.is_(False),
            func.coalesce(Order.source, "") != "EXCHANGE",
        )
    )
    res = await db.execute(stmt)
    orders = res.scalars().all()

    total_bills_count = len(orders)
    total_sales_amount = Decimal("0.00")
    cash_collected = Decimal("0.00")
    upi_collected = Decimal("0.00")
    card_collected = Decimal("0.00")

    for o in orders:
        bill_tot = Decimal(str(o.total_amount or "0.00"))
        total_sales_amount += bill_tot

        # Calculate net paid on bill
        l_red = Decimal(str(o.loyalty_discount_inr or "0.00"))
        c_app = Decimal(str(o.credit_applied or "0.00"))
        d_app = Decimal(str(o.debit_applied or "0.00"))
        d_set = Decimal(str(o.debt_settled or "0.00"))
        c_awa = Decimal(str(o.credit_awarded or "0.00"))
        c_cas = Decimal(str(o.credit_cashed_out or "0.00"))
        net_paid = max(Decimal("0.00"), bill_tot - l_red - c_app - d_app + d_set + c_awa - c_cas)

        # Explicit split payment check
        c_amt = Decimal(str(o.cash_amount or "0.00"))
        u_amt = Decimal(str(o.upi_amount or "0.00"))

        if c_amt > 0 or u_amt > 0:
            cash_collected += c_amt
            upi_collected += u_amt
        else:
            pm = (o.payment_method or "CASH").upper()
            if pm == "UPI":
                upi_collected += net_paid
            elif pm in ("CARD", "DEBIT", "CREDIT"):
                card_collected += net_paid
            else:
                cash_collected += net_paid

    # Query customer returns with cash refund processed by this staff in this shift
    ret_stmt = (
        select(CustomerReturn)
        .where(
            CustomerReturn.outlet_id == session.outlet_id,
            or_(
                CustomerReturn.created_by_staff_id == session.staff_id,
                CustomerReturn.created_by_staff_id.is_(None),
            ),
            return_time_filter,
            func.upper(CustomerReturn.refund_payment_method) == "CASH",
        )
    )
    ret_res = await db.execute(ret_stmt)
    returns = ret_res.scalars().all()

    returns_refund_cash = Decimal("0.00")
    for r in returns:
        returns_refund_cash += Decimal(str(r.total_refund_amount or "0.00"))

    opening_cash = Decimal(str(session.opening_cash or "0.00"))
    expected_cash = max(Decimal("0.00"), opening_cash + cash_collected - returns_refund_cash)

    return {
        "total_bills_count": total_bills_count,
        "total_sales_amount": total_sales_amount,
        "cash_collected": cash_collected,
        "upi_collected": upi_collected,
        "card_collected": card_collected,
        "returns_refund_cash": returns_refund_cash,
        "expected_cash_in_drawer": expected_cash,
    }


async def get_active_punch_session(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
) -> StaffPunchSession | None:
    """
    Get the active punch session for a staff member in an outlet.
    If the session is open but exceeds 12 hours, it is automatically marked
    as auto-punched out and closed.
    """
    stmt = (
        select(StaffPunchSession)
        .where(
            StaffPunchSession.outlet_id == outlet_id,
            StaffPunchSession.staff_id == staff_id,
            StaffPunchSession.punch_out_at.is_(None),
        )
        .order_by(StaffPunchSession.punch_in_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        return None

    now = utc_now()
    punch_in_naive = ensure_naive_utc(session.punch_in_at)
    elapsed_seconds = int((now - punch_in_naive).total_seconds())

    today_start_utc = get_today_start_utc()
    is_from_prior_day = punch_in_naive < today_start_utc
    is_exceeded_12h = elapsed_seconds >= MAX_SHIFT_DURATION_SECONDS

    # Auto-close if session exceeds 12 hours OR was started before midnight (day ended)
    if is_exceeded_12h or is_from_prior_day:
        if is_exceeded_12h:
            session.punch_out_at = punch_in_naive + timedelta(hours=MAX_SHIFT_DURATION_HOURS)
            session.duration_seconds = MAX_SHIFT_DURATION_SECONDS
            session.notes = "Auto punched-out after 12 hours shift limit reached"
            log_detail = "Auto punched-out after 12 hours shift limit reached"
        else:
            session.punch_out_at = min(now, today_start_utc)
            session.duration_seconds = min(MAX_SHIFT_DURATION_SECONDS, max(1, int((session.punch_out_at - punch_in_naive).total_seconds())))
            session.notes = "Auto punched-out at midnight 12:00 AM (day ended)"
            log_detail = "Auto punched-out at midnight 12:00 AM day start"

        session.auto_punched_out = True
        session.status = "SETTLED"
        session.updated_at = now

        # Compute final numbers before closing
        stats = await calculate_shift_financials(db, session)
        session.total_bills_count = stats["total_bills_count"]
        session.total_sales_amount = stats["total_sales_amount"]
        session.cash_collected = stats["cash_collected"]
        session.upi_collected = stats["upi_collected"]
        session.card_collected = stats["card_collected"]
        session.returns_refund_cash = stats["returns_refund_cash"]
        session.expected_cash_in_drawer = stats["expected_cash_in_drawer"]
        session.actual_cash_handed_over = stats["expected_cash_in_drawer"]
        session.cash_difference = Decimal("0.00")

        await create_staff_audit_log(
            db,
            outlet_id=outlet_id,
            staff_id=staff_id,
            action_type="punch_out",
            reference_type="StaffPunchSession",
            reference_id=str(session.id),
            details=log_detail,
        )
        await db.commit()
        return None

    return session


async def punch_in_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    staff_name: str,
    opening_cash: Decimal | None = None,
) -> StaffPunchSession:
    """
    Punch in a staff member for a new shift.
    If an active session already exists within 12 hours, return it.
    Otherwise create a new punch session, capture starting cash, and log the audit action.
    """
    active = await get_active_punch_session(db, outlet_id, staff_id)
    if active:
        return active

    if opening_cash is None:
        opening_cash = await get_live_drawer_balance(db, outlet_id)
    else:
        opening_cash = max(Decimal("0.00"), Decimal(str(opening_cash)))

    now = utc_now()
    session = StaffPunchSession(
        id=uuid.uuid4(),
        staff_id=staff_id,
        outlet_id=outlet_id,
        punch_in_at=now,
        auto_punched_out=False,
        opening_cash=opening_cash,
        status="OPEN",
    )
    db.add(session)
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=staff_id,
        action_type="punch_in",
        reference_type="StaffPunchSession",
        reference_id=str(session.id),
        details=f"Staff '{staff_name}' punched in for shift with starting drawer cash ₹{opening_cash:.2f}",
    )
    await db.commit()
    await db.refresh(session)
    return session


async def punch_out_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    staff_name: str,
    notes: str | None = None,
    actual_cash_handed_over: Decimal | None = None,
    closing_notes: str | None = None,
) -> tuple[StaffPunchSession | None, str | None, dict[str, Any]]:
    """
    Punch out an active staff member, calculating duration, shift collection breakdown,
    verifying cash handed over vs expected drawer cash, and recording audit action.
    Returns (session, elapsed_duration_str, stats_dict).
    """
    active = await get_active_punch_session(db, outlet_id, staff_id)
    if not active:
        return None, None, {}

    now = utc_now()
    punch_in_naive = ensure_naive_utc(active.punch_in_at)
    duration_sec = max(0, int((now - punch_in_naive).total_seconds()))
    duration_str = format_duration(duration_sec)

    # Calculate shift financials
    stats = await calculate_shift_financials(db, active)
    expected_cash = stats["expected_cash_in_drawer"]

    active.punch_out_at = now
    active.duration_seconds = duration_sec
    active.auto_punched_out = False

    if actual_cash_handed_over is None:
        actual_cash_handed_over = expected_cash
    else:
        actual_cash_handed_over = max(Decimal("0.00"), Decimal(str(actual_cash_handed_over)))

    diff = actual_cash_handed_over - expected_cash

    active.total_bills_count = stats["total_bills_count"]
    active.total_sales_amount = stats["total_sales_amount"]
    active.cash_collected = stats["cash_collected"]
    active.upi_collected = stats["upi_collected"]
    active.card_collected = stats["card_collected"]
    active.returns_refund_cash = stats["returns_refund_cash"]
    active.expected_cash_in_drawer = expected_cash
    active.actual_cash_handed_over = actual_cash_handed_over
    active.cash_difference = diff
    active.status = "SETTLED"

    combined_notes = " | ".join(filter(None, [notes, closing_notes]))
    if combined_notes:
        active.notes = combined_notes
    active.updated_at = now

    audit_details = (
        f"Staff '{staff_name}' punched out. Elapsed shift time: {duration_str}. "
        f"Sales: ₹{stats['total_sales_amount']:.2f} ({stats['total_bills_count']} bills). "
        f"Handover Cash: ₹{actual_cash_handed_over:.2f}, Expected: ₹{expected_cash:.2f} "
        f"(Diff: ₹{diff:+.2f})"
    )

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=staff_id,
        action_type="punch_out",
        reference_type="StaffPunchSession",
        reference_id=str(active.id),
        details=audit_details,
    )
    await db.commit()
    await db.refresh(active)
    return active, duration_str, stats


async def list_shift_sessions(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    status: str | None = None,
    role: str | None = None,
    limit: int = 100,
) -> list[StaffPunchSession]:
    """List historical staff shift punch sessions with joined user info and financial tallies."""
    from app.models.user import User

    # Auto-close any stale shifts from prior days first
    await auto_close_midnight_shifts(db, outlet_id)

    stmt = (
        select(StaffPunchSession)
        .options(selectinload(StaffPunchSession.staff))
        .where(StaffPunchSession.outlet_id == outlet_id)
    )
    if role:
        stmt = stmt.join(User, StaffPunchSession.staff_id == User.id).where(User.role == role)
    if staff_id:
        stmt = stmt.where(StaffPunchSession.staff_id == staff_id)
    if status and status.upper() != "ALL":
        stmt = stmt.where(StaffPunchSession.status == status.upper())

    if start_date and end_date:
        try:
            d_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            d_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(d_start, time.min) - timedelta(hours=5, minutes=30))
            end_utc = ensure_naive_utc(datetime.combine(d_end, time.max) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(StaffPunchSession.punch_in_at.between(start_utc, end_utc))
        except ValueError:
            pass
    elif start_date:
        try:
            d_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(d_start, time.min) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(StaffPunchSession.punch_in_at >= start_utc)
        except ValueError:
            pass
    elif end_date:
        try:
            d_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            end_utc = ensure_naive_utc(datetime.combine(d_end, time.max) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(StaffPunchSession.punch_in_at <= end_utc)
        except ValueError:
            pass

    stmt = stmt.order_by(StaffPunchSession.punch_in_at.desc()).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()


async def get_shift_lower_bound_for_user(
    db: AsyncSession,
    current_user: any,
) -> datetime | None:
    """
    Determine the minimum timestamp cutoff for querying records based on staff shift.
    - If user is exempt (Admin, Superadmin, Manager): returns None (no shift cutoff).
    - If user is non-exempt: returns the active punch_in_at datetime.
    - If user is non-exempt but has NO active punch session: returns datetime.max (effectively 0 records).
    """
    if is_role_exempt(getattr(current_user, "role", None)):
        return None

    outlet_id = getattr(current_user, "outlet_id", None)
    user_id = getattr(current_user, "user_id", None)
    if not outlet_id or not user_id:
        return None

    session = await get_active_punch_session(db, outlet_id, user_id)
    if session:
        return ensure_naive_utc(session.punch_in_at)

    # Not punched in: return far future so no records match
    return datetime(9999, 12, 31, 23, 59, 59)


# In-memory cache for floor staff active today: (str(outlet_id), str(staff_id), "YYYY-MM-DD")
_active_floor_staff_cache: set[tuple[str, str, str]] = set()


async def ensure_staff_punched_in_today(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    staff_name: str,
) -> None:
    """
    Lightweight zero-DB-load safety net:
    If staff is already known active today from in-memory cache, executes 0 queries.
    If not cached, verifies if an active session exists; if not, punches staff in.
    Guarantees that ONLY floor staff (FLOOR_STAFF or STAFF) can be punched in.
    """
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    cache_key = (str(outlet_id), str(staff_id), today_str)
    if cache_key in _active_floor_staff_cache:
        return

    from app.models.user import User
    user = await db.get(User, staff_id)
    if not user or user.role != RoleEnum.FLOOR_STAFF:
        return

    active = await get_active_punch_session(db, outlet_id, staff_id)
    if active:
        _active_floor_staff_cache.add(cache_key)
        return

    # Create safety-net punch-in with ₹0 opening cash (floor staff don't hold cash drawer)
    await punch_in_staff(
        db,
        outlet_id=outlet_id,
        staff_id=staff_id,
        staff_name=staff_name,
        opening_cash=Decimal("0.00"),
    )
    _active_floor_staff_cache.add(cache_key)


async def auto_close_midnight_shifts(db: AsyncSession, outlet_id: uuid.UUID) -> int:
    """
    Auto-close any open punch sessions from prior days (started before midnight 12:00 AM IST)
    or exceeding 12 hours.
    Returns the count of sessions closed.
    """
    now = utc_now()
    today_start_utc = get_today_start_utc()
    stmt = (
        select(StaffPunchSession)
        .where(
            StaffPunchSession.outlet_id == outlet_id,
            StaffPunchSession.punch_out_at.is_(None),
            or_(
                StaffPunchSession.punch_in_at < today_start_utc,
                StaffPunchSession.punch_in_at <= now - timedelta(hours=12),
            ),
        )
    )
    res = await db.execute(stmt)
    stale_sessions = res.scalars().all()
    count = 0
    for s in stale_sessions:
        p_in = ensure_naive_utc(s.punch_in_at)
        if p_in <= now - timedelta(hours=12):
            s.punch_out_at = p_in + timedelta(hours=MAX_SHIFT_DURATION_HOURS)
            s.duration_seconds = MAX_SHIFT_DURATION_SECONDS
            s.notes = "Auto punched-out after 12 hours shift limit reached"
            log_detail = "Auto punched-out after 12 hours shift limit reached"
        else:
            s.punch_out_at = min(now, today_start_utc)
            s.duration_seconds = min(MAX_SHIFT_DURATION_SECONDS, max(1, int((s.punch_out_at - p_in).total_seconds())))
            s.notes = "Auto punched-out at midnight 12:00 AM (day ended)"
            log_detail = "Auto punched-out at midnight 12:00 AM day start"

        s.auto_punched_out = True
        s.status = "SETTLED"
        s.updated_at = now

        stats = await calculate_shift_financials(db, s)
        s.total_bills_count = stats["total_bills_count"]
        s.total_sales_amount = stats["total_sales_amount"]
        s.cash_collected = stats["cash_collected"]
        s.upi_collected = stats["upi_collected"]
        s.card_collected = stats["card_collected"]
        s.returns_refund_cash = stats["returns_refund_cash"]
        s.expected_cash_in_drawer = stats["expected_cash_in_drawer"]
        s.actual_cash_handed_over = stats["expected_cash_in_drawer"]
        s.cash_difference = Decimal("0.00")

        await create_staff_audit_log(
            db,
            outlet_id=outlet_id,
            staff_id=s.staff_id,
            action_type="punch_out",
            reference_type="StaffPunchSession",
            reference_id=str(s.id),
            details=log_detail,
        )
        count += 1

    if count > 0:
        await db.commit()
    return count


async def get_floor_staff_incentive_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    staff_id: uuid.UUID | None = None,
) -> list[dict[str, Any]]:
    """
    Calculate floor staff incentive & customer assistance summary:
    - Total customers / bills assisted
    - Total assisted sales amount (₹)
    - Average basket value (₹)
    - Shift hours completed
    - Active shift status
    - Calculated incentive (₹5 per assisted customer + 0.5% of assisted sales volume)
    """
    from app.models.user import User

    # Auto-close any stale shifts first
    await auto_close_midnight_shifts(db, outlet_id)

    # Base query for floor staff only in outlet (FLOOR_STAFF role)
    user_stmt = select(User).where(
        User.outlet_id == outlet_id,
        User.role == RoleEnum.FLOOR_STAFF,
    )
    if staff_id:
        user_stmt = user_stmt.where(User.id == staff_id)
    user_stmt = user_stmt.order_by(User.name.asc())
    user_res = await db.execute(user_stmt)
    staff_members = user_res.scalars().all()

    # Query currently active open sessions (independent of historical date filters)
    open_stmt = select(StaffPunchSession).where(
        StaffPunchSession.outlet_id == outlet_id,
        StaffPunchSession.punch_out_at.is_(None),
    )
    open_res = await db.execute(open_stmt)
    open_sessions_by_staff = {s.staff_id: s for s in open_res.scalars().all()}

    # Time filter for orders
    order_filters = [
        Order.outlet_id == outlet_id,
        Order.status.in_([
            OrderStatusEnum.PAID,
            OrderStatusEnum.COMPLETED,
            OrderStatusEnum.PARTIALLY_REFUNDED,
        ]),
        Order.is_void.is_(False),
        Order.assisted_by_staff_id.is_not(None),
    ]
    if start_date:
        order_filters.append(Order.created_at >= ensure_naive_utc(start_date))
    if end_date:
        order_filters.append(Order.created_at <= ensure_naive_utc(end_date))

    # Query all assisted orders in range
    order_stmt = select(Order).where(*order_filters)
    order_res = await db.execute(order_stmt)
    assisted_orders = order_res.scalars().all()

    # Group assisted orders by staff_id
    staff_orders: dict[uuid.UUID, list[Order]] = {}
    for o in assisted_orders:
        if o.assisted_by_staff_id:
            staff_orders.setdefault(o.assisted_by_staff_id, []).append(o)

    # Shift sessions query in range
    session_filters = [StaffPunchSession.outlet_id == outlet_id]
    if start_date:
        session_filters.append(StaffPunchSession.punch_in_at >= ensure_naive_utc(start_date))
    if end_date:
        session_filters.append(StaffPunchSession.punch_in_at <= ensure_naive_utc(end_date))
    session_stmt = select(StaffPunchSession).where(*session_filters)
    session_res = await db.execute(session_stmt)
    all_sessions = session_res.scalars().all()

    staff_sessions: dict[uuid.UUID, list[StaffPunchSession]] = {}
    for s in all_sessions:
        staff_sessions.setdefault(s.staff_id, []).append(s)

    # Fetch dynamic incentive rates from Outlet configuration (fallback to ₹5.00 / 0.50%)
    from app.models.outlet import Outlet
    outlet = await db.get(Outlet, outlet_id)
    raw_rate = getattr(outlet, "floor_incentive_per_bill", None)
    incentive_per_bill = Decimal(str(raw_rate)) if raw_rate is not None else Decimal("5.00")
    raw_pct = getattr(outlet, "floor_incentive_percent", None)
    incentive_pct_raw = Decimal(str(raw_pct)) if raw_pct is not None else Decimal("0.50")
    incentive_percent = incentive_pct_raw / Decimal("100.00")

    report_rows = []
    for staff in staff_members:
        orders = staff_orders.get(staff.id, [])
        sessions = staff_sessions.get(staff.id, [])

        total_bills = len(orders)
        total_sales = sum((Decimal(str(o.total_amount or "0.00")) for o in orders), Decimal("0.00"))
        avg_basket = (total_sales / total_bills) if total_bills > 0 else Decimal("0.00")

        # Shift duration calculation
        now = utc_now()
        total_duration_sec = 0
        is_active_shift = staff.id in open_sessions_by_staff
        latest_punch_in = None
        latest_punch_out = None

        if is_active_shift:
            open_sess = open_sessions_by_staff[staff.id]
            latest_punch_in = ensure_naive_utc(open_sess.punch_in_at)

        for sess in sessions:
            p_in = ensure_naive_utc(sess.punch_in_at)
            if sess.punch_out_at:
                p_out = ensure_naive_utc(sess.punch_out_at)
                total_duration_sec += int((p_out - p_in).total_seconds())
                latest_punch_out = p_out
            else:
                is_active_shift = True
                total_duration_sec += int((now - p_in).total_seconds())
                latest_punch_in = p_in

        # Dynamic incentive formula: (Bills × per_bill_rate) + (Sales × commission_percent)
        calculated_incentive = (Decimal(total_bills) * incentive_per_bill) + (total_sales * incentive_percent)

        report_rows.append({
            "staff_id": str(staff.id),
            "staff_name": staff.name,
            "staff_role": staff.role.value if hasattr(staff.role, "value") else str(staff.role),
            "staff_barcode": staff.barcode or f"STF-{str(staff.id)[:4].upper()}",
            "staff_phone": staff.phone,
            "total_bills_assisted": total_bills,
            "total_assisted_sales": float(round(total_sales, 2)),
            "average_basket_value": float(round(avg_basket, 2)),
            "total_shift_seconds": total_duration_sec,
            "total_shift_duration_formatted": format_duration(total_duration_sec) if total_duration_sec > 0 else "0m",
            "is_active_shift": is_active_shift,
            "latest_punch_in": latest_punch_in.isoformat() if latest_punch_in else None,
            "latest_punch_out": latest_punch_out.isoformat() if latest_punch_out else None,
            "calculated_incentive": float(round(calculated_incentive, 2)),
        })

    # Sort by total bills assisted descending, then name
    report_rows.sort(key=lambda x: (x["total_bills_assisted"], x["total_assisted_sales"]), reverse=True)
    return report_rows


