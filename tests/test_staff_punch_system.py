"""
Tests for Staff Shift Punch-In / Punch-Out system, 12h auto-expiration, audit trail, and shift-scoped POS isolation.
"""

import uuid
from datetime import datetime, timedelta
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import ensure_naive_utc, utc_now
from app.core.security import create_access_token, hash_password
from app.models.enums import PaymentModeEnum, RoleEnum, OrderStatusEnum
from app.models.order import Order
from app.models.outlet import Outlet
from app.models.staff_audit_log import StaffAuditLog
from app.models.staff_punch_session import StaffPunchSession
from app.models.user import User
from app.services.staff_punch_service import (
    get_active_punch_session,
    punch_in_staff,
    punch_out_staff,
    MAX_SHIFT_DURATION_SECONDS,
)


@pytest.mark.asyncio
async def test_staff_punch_lifecycle_and_audit(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Punch Test Outlet",
        slug=f"punch-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Anita Cashier",
        email="anita@counter.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("password123"),
        pin_hash=hash_password("1111"),
        status="active",
    )
    db.add(cashier)
    await db.commit()

    token = create_access_token(user_id=cashier.id, outlet_id=outlet_id, role=cashier.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Initial Punch Status: should be not punched in
    resp = await client.get("/api/staff/punch/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_exempt"] is False
    assert data["is_punched_in"] is False
    assert data["session_id"] is None

    # 2. Punch In
    punch_in_resp = await client.post("/api/staff/punch/in", headers=headers)
    assert punch_in_resp.status_code == 200
    p_data = punch_in_resp.json()
    assert p_data["is_punched_in"] is True
    assert p_data["session_id"] is not None
    session_id = p_data["session_id"]

    # Verify audit log for punch_in
    audit_res = await db.execute(
        select(StaffAuditLog).where(
            StaffAuditLog.staff_id == cashier.id,
            StaffAuditLog.action_type == "punch_in",
        )
    )
    in_audit = audit_res.scalar_one_or_none()
    assert in_audit is not None
    assert "punched in" in in_audit.details

    # 3. Punch Status check
    status_resp = await client.get("/api/staff/punch/status", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["is_punched_in"] is True

    # 4. Punch Out
    punch_out_resp = await client.post(
        "/api/staff/punch/out",
        headers=headers,
        json={"notes": "Shift finished cleanly"},
    )
    assert punch_out_resp.status_code == 200
    assert punch_out_resp.json()["is_punched_in"] is False

    # Verify audit log for punch_out with duration
    out_audit_res = await db.execute(
        select(StaffAuditLog).where(
            StaffAuditLog.staff_id == cashier.id,
            StaffAuditLog.action_type == "punch_out",
        )
    )
    out_audit = out_audit_res.scalar_one_or_none()
    assert out_audit is not None
    assert "Elapsed shift time:" in out_audit.details


@pytest.mark.asyncio
async def test_punch_auto_expiration_after_12_hours(db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    staff_id = uuid.uuid4()

    outlet = Outlet(
        id=outlet_id,
        name="Auto Expire Outlet",
        slug=f"auto-exp-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)
    staff = User(
        id=staff_id,
        outlet_id=outlet_id,
        name="Late Worker",
        email="late@worker.com",
        role=RoleEnum.CASHIER,
        password_hash="pw",
        status="active",
    )
    db.add(staff)

    # Insert a punch session from 13 hours ago
    past_13h = ensure_naive_utc(datetime.utcnow() - timedelta(hours=13))
    old_session = StaffPunchSession(
        id=uuid.uuid4(),
        staff_id=staff_id,
        outlet_id=outlet_id,
        punch_in_at=past_13h,
        punch_out_at=None,
        auto_punched_out=False,
    )
    db.add(old_session)
    await db.commit()

    # Query active punch session: should auto-expire and return None
    active = await get_active_punch_session(db, outlet_id, staff_id)
    assert active is None

    # Check that old_session was updated in DB
    await db.refresh(old_session)
    assert old_session.punch_out_at is not None
    assert old_session.auto_punched_out is True
    assert old_session.duration_seconds == MAX_SHIFT_DURATION_SECONDS


@pytest.mark.asyncio
async def test_shift_scoped_billing_isolation(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Isolation Test Outlet",
        slug=f"iso-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Shift Cashier",
        email="shift@counter.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("pw"),
        status="active",
    )
    db.add(cashier)
    await db.commit()

    token = create_access_token(user_id=cashier.id, outlet_id=outlet_id, role=cashier.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # Old order from 2 hours ago
    old_time = ensure_naive_utc(datetime.utcnow() - timedelta(hours=2))
    old_order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B-OLD",
        customer_name="Yesterday Buyer",
        status=OrderStatusEnum.PAID,
        total_amount=500.0,
        created_at=old_time,
        updated_at=old_time,
    )
    db.add(old_order)
    await db.commit()

    # Before punch in: cashier sees empty list
    resp_unpunched = await client.get("/api/billing/bills", headers=headers)
    assert resp_unpunched.status_code == 200
    assert len(resp_unpunched.json()) == 0

    # Punch in now
    await client.post("/api/staff/punch/in", headers=headers)

    # Order created after punch in
    now_time = ensure_naive_utc(datetime.utcnow() + timedelta(seconds=1))
    new_order = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B-NEW",
        customer_name="Current Shift Buyer",
        status=OrderStatusEnum.PAID,
        total_amount=150.0,
        created_at=now_time,
        updated_at=now_time,
    )
    db.add(new_order)
    await db.commit()

    # Now cashier calls bills list: should see only new_order, NOT old_order
    resp_punched = await client.get("/api/billing/bills", headers=headers)
    assert resp_punched.status_code == 200
    bills = resp_punched.json()
    assert len(bills) == 1
    assert bills[0]["basket_number"] == "B-NEW"

    # But if cashier searches for old_order by customer name, search fallback allows finding it for returns
    resp_search = await client.get("/api/billing/bills?search=Yesterday", headers=headers)
    assert resp_search.status_code == 200
    search_bills = resp_search.json()
    assert len(search_bills) == 1
    assert search_bills[0]["basket_number"] == "B-OLD"


@pytest.mark.asyncio
async def test_shift_handover_reconciliation_and_history(client, db_session: AsyncSession):
    """
    Test starting drawer cash, sales collection (cash & UPI), punch-out handover reconciliation,
    and querying shift sessions history.
    """
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Handover Test Outlet",
        slug=f"handover-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Rahul Cashier",
        email="rahul@handover.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("pw123"),
        status="active",
    )
    db.add(cashier)
    await db.commit()

    token = create_access_token(user_id=cashier.id, outlet_id=outlet_id, role=cashier.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Punch In with ₹100 starting drawer cash
    p_in = await client.post("/api/staff/punch/in", headers=headers, json={"opening_cash": 100.0})
    assert p_in.status_code == 200
    p_in_data = p_in.json()
    assert p_in_data["is_punched_in"] is True
    assert float(p_in_data["opening_cash"]) == 100.0

    # 2. Cashier generates 2 bills:
    #    Bill 1: ₹500 Cash
    #    Bill 2: ₹500 UPI
    now = ensure_naive_utc(datetime.utcnow() + timedelta(seconds=1))
    order_cash = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B-001",
        created_by_staff_id=cashier.id,
        status=OrderStatusEnum.PAID,
        payment_method="CASH",
        cash_amount=500.0,
        total_amount=500.0,
        created_at=now,
        updated_at=now,
    )
    order_upi = Order(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        basket_number="B-002",
        created_by_staff_id=cashier.id,
        status=OrderStatusEnum.PAID,
        payment_method="UPI",
        upi_amount=500.0,
        total_amount=500.0,
        created_at=now,
        updated_at=now,
    )
    db.add_all([order_cash, order_upi])
    await db.commit()

    # 3. Check live summary during active shift
    live_res = await client.get("/api/staff/punch/live-summary", headers=headers)
    assert live_res.status_code == 200
    live_data = live_res.json()
    assert live_data["total_bills_count"] == 2
    assert float(live_data["total_sales_amount"]) == 1000.0
    assert float(live_data["cash_collected"]) == 500.0
    assert float(live_data["upi_collected"]) == 500.0
    assert float(live_data["opening_cash"]) == 100.0
    # Expected in drawer: ₹100 opening + ₹500 cash sales = ₹600!
    assert float(live_data["expected_cash_in_drawer"]) == 600.0

    # 4. Punch Out and hand over ₹600 physical cash to owner
    p_out = await client.post(
        "/api/staff/punch/out",
        headers=headers,
        json={
            "actual_cash_handed_over": 600.0,
            "notes": "Handed over to owner Rahul",
        },
    )
    assert p_out.status_code == 200
    assert p_out.json()["is_punched_in"] is False

    # 5. Check shift history sessions endpoint
    sessions_res = await client.get("/api/staff/punch/sessions", headers=headers)
    assert sessions_res.status_code == 200
    sessions = sessions_res.json()
    assert len(sessions) == 1
    shift = sessions[0]
    assert shift["staff_name"] == "Rahul Cashier"
    assert shift["status"] == "SETTLED"
    assert float(shift["opening_cash"]) == 100.0
    assert float(shift["total_sales_amount"]) == 1000.0
    assert float(shift["cash_collected"]) == 500.0
    assert float(shift["upi_collected"]) == 500.0
    assert float(shift["expected_cash_in_drawer"]) == 600.0
    assert float(shift["actual_cash_handed_over"]) == 600.0
    assert float(shift["cash_difference"]) == 0.0
    assert shift["notes"] == "Handed over to owner Rahul"

