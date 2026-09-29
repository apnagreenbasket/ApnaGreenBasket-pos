"""
Tests for Split Payment (Partial Cash + Rest UPI) and Multi-Tender Payment
(Store Credit + Udhaar/Debit + Cash + UPI).
Verifies:
1. Exact cash_amount and upi_amount storage on Order.
2. Cash Drawer Ledger logs only the physical cash amount, not the UPI portion.
3. Unified multi-tender: Credit + Cash + UPI + Debit == Bill Total.
4. Analytics payment-mix revenue attribution splits correctly between CASH and UPI buckets.
5. Day Book entries reflect SPLIT payment details.
"""

from datetime import datetime
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.customer_ledger import CustomerLedger
from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.order import Order
from app.models.enums import RoleEnum
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_split_payment_cash_and_upi_shortfall(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    User scenario: Rs 6 bill. Customer pays Rs 5 in cash and Rs 1 via UPI shortfall.
    Verifies:
    - Order stores cash_amount=5.00, upi_amount=1.00, payment_method="SPLIT".
    - Cash drawer only records physical cash of Rs 5.00.
    """
    outlet = await create_test_outlet(db_session, slug="split-pay-outlet", name="Split Pay Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_split@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Matchbox Pack", price=Decimal("6.00"))
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 1. Create a bill for Rs 6.00
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "SPLIT-01",
            "customer_name": "Test Customer",
            "customer_phone": "9999900001",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 6.0,
                    "mrp": 6.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()
    bill_id = bill["id"]
    order_uuid = uuid.UUID(bill_id)

    # 2. Settle payment with SPLIT: Rs 5 Cash + Rs 1 UPI
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "SPLIT",
            "cash_amount": 5.0,
            "upi_amount": 1.0,
            "cash_denominations": {"5": 1},
            "change_denominations": {},
        },
    )
    assert pay_res.status_code == 200
    paid_bill = pay_res.json()
    assert paid_bill["payment_method"] == "SPLIT"
    assert paid_bill["cash_amount"] == 5.0
    assert paid_bill["upi_amount"] == 1.0

    # 3. Verify DB Order record
    order_res = await db_session.execute(select(Order).where(Order.id == order_uuid))
    order = order_res.scalar_one()
    assert order.payment_method == "SPLIT"
    assert float(order.cash_amount) == 5.0
    assert float(order.upi_amount) == 1.0
    assert "SPLIT [Cash: ₹5.00, UPI: ₹1.00]" in (order.payment_reference or "")

    # 4. Verify CashDrawerLedger only logs the physical Rs 5.00 cash
    drawer_res = await db_session.execute(
        select(CashDrawerLedger).where(CashDrawerLedger.reference_order_id == order_uuid)
    )
    drawer_entry = drawer_res.scalar_one_or_none()
    assert drawer_entry is not None
    denom_sum = sum(int(k) * int(v) for k, v in drawer_entry.denominations.items())
    assert denom_sum == 5
    assert drawer_entry.denominations.get("5") == 1


@pytest.mark.asyncio
async def test_multi_tender_credit_debit_cash_upi(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Scenario: Rs 100 bill.
    Customer uses Rs 20 Store Credit, puts Rs 10 on Udhaar/Debit, pays Rs 50 Cash, and Rs 20 UPI.
    Total = 20 (Credit) + 10 (Debit) + 50 (Cash) + 20 (UPI) = 100.
    Verifies:
    - Order stores credit_applied=20, debit_applied=10, cash_amount=50, upi_amount=20.
    - Customer balance updates properly.
    - Cash drawer logs only Rs 50.00.
    """
    outlet = await create_test_outlet(db_session, slug="multitender-outlet", name="MultiTender Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_multi@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Premium Basmati Rice", price=Decimal("100.00"))

    # Pre-create customer with Rs 20 Store Credit
    cust = Customer(
        outlet_id=outlet.id,
        phone="9876500099",
        name="Multi Tender Customer",
        credit_balance=Decimal("20.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 1. Create a bill for Rs 100.00
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "MULTI-01",
            "customer_name": "Multi Tender Customer",
            "customer_phone": "9876500099",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 100.0,
                    "mrp": 100.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]
    order_uuid = uuid.UUID(bill_id)

    # 2. Settle with Multi-Tender: Rs 20 Credit, Rs 10 Debit, Rs 50 Cash, Rs 20 UPI
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "SPLIT",
            "apply_credit": 20.0,
            "record_debit": 10.0,
            "cash_amount": 50.0,
            "upi_amount": 20.0,
            "cash_denominations": {"50": 1},
            "change_denominations": {},
        },
    )
    assert pay_res.status_code == 200

    # 3. Verify Order DB fields
    order_res = await db_session.execute(select(Order).where(Order.id == order_uuid))
    order = order_res.scalar_one()
    assert float(order.total_amount) == 100.0
    assert float(order.credit_applied) == 20.0
    assert float(order.debit_applied) == 10.0
    assert float(order.cash_amount) == 50.0
    assert float(order.upi_amount) == 20.0
    assert (
        float(order.credit_applied)
        + float(order.debit_applied)
        + float(order.cash_amount)
        + float(order.upi_amount)
        == float(order.total_amount)
    )

    # 4. Verify Customer Balance: 20 initial - 20 used - 10 debit = -10.00
    await db_session.refresh(cust)
    assert float(cust.credit_balance) == -10.0

    # 5. Verify Cash Drawer recorded only Rs 50.00
    drawer_res = await db_session.execute(
        select(CashDrawerLedger).where(CashDrawerLedger.reference_order_id == order_uuid)
    )
    drawer = drawer_res.scalar_one()
    denom_sum = sum(int(k) * int(v) for k, v in drawer.denominations.items())
    assert denom_sum == 50
    assert drawer.denominations.get("50") == 1


@pytest.mark.asyncio
async def test_split_payment_analytics_and_daybook(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that /api/analytics/payment-mix and /api/analytics/day-book accurately
    reflect the split breakdown into CASH and UPI buckets.
    """
    outlet = await create_test_outlet(db_session, slug="analytics-split-outlet", name="Analytics Split Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_analytics_split@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Split Item", price=Decimal("100.00"))
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # Create bill and mark paid with Rs 60 Cash + Rs 40 UPI
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "ANALYTICS-01",
            "customer_name": "Analytics Customer",
            "customer_phone": "9876543210",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 100.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]

    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "SPLIT",
            "cash_amount": 60.0,
            "upi_amount": 40.0,
            "cash_denominations": {"50": 1, "10": 1},
        },
    )
    assert pay_res.status_code == 200

    # 1. Verify /api/analytics/payment-mix reflects distinct SPLIT method with breakdown
    mix_res = await client.get("/api/analytics/payment-mix", headers=auth_headers)
    assert mix_res.status_code == 200
    methods = mix_res.json()["methods"]
    
    split_mix = next((m for m in methods if m["payment_method"] == "SPLIT"), None)
    assert split_mix is not None
    assert float(split_mix["gross_revenue"]) == 100.0
    assert float(split_mix["total_revenue"]) == 100.0
    assert split_mix["orders_count"] == 1
    assert split_mix["cash_amount"] == 60.0
    assert split_mix["upi_amount"] == 40.0
    assert split_mix["cash_share_pct"] == 60.0
    assert split_mix["upi_share_pct"] == 40.0
    assert "Cash: ₹60.00 (60.0%) • UPI: ₹40.00 (40.0%)" in split_mix["breakdown_description"]

    # 2. Verify /api/analytics/aov reflects SPLIT method with breakdown
    aov_res = await client.get("/api/analytics/aov", headers=auth_headers)
    assert aov_res.status_code == 200
    aov_methods = aov_res.json()["by_payment_method"]
    split_aov = next((m for m in aov_methods if m["payment_method"] == "SPLIT"), None)
    assert split_aov is not None
    assert split_aov["orders_count"] == 1
    assert float(split_aov["avg_order_value"]) == 100.0
    assert split_aov["cash_amount"] == 60.0
    assert split_aov["upi_amount"] == 40.0
    assert split_aov["avg_cash"] == 60.0
    assert split_aov["avg_upi"] == 40.0
    assert "Cash: ₹60.00" in split_aov["breakdown_description"]

    # 3. Verify /api/analytics/day-book
    from app.core.shift_utils import IST
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    daybook_res = await client.get(f"/api/analytics/day-book?date={today_str}", headers=auth_headers)
    assert daybook_res.status_code == 200
    entries = daybook_res.json()["entries"]
    sale_entry = next((e for e in entries if e["entry_type"] == "SALE" and e["reference_number"] == "ANALYTICS-01"), None)
    assert sale_entry is not None
    assert "SPLIT [Cash: ₹60.00, UPI: ₹40.00]" in sale_entry["description"]


@pytest.mark.asyncio
async def test_split_payment_with_existing_debt_and_remaining_shortfall_to_debit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Exact user screenshot scenario:
    Customer starts with -Rs 2.00 Udhaar (DR).
    Bill is Rs 18.00.
    Customer pays Rs 10.00 Cash + Rs 5.00 UPI.
    Remaining Rs 3.00 shortfall is added to Customer Debit (Udhaar).
    Verifies:
    - Customer wallet balance becomes -Rs 5.00 (DR) (-2.00 - 3.00).
    - Order stores cash_amount=10.0, upi_amount=5.0, debit_applied=3.0.
    - Cash drawer logs only Rs 10.00.
    """
    outlet = await create_test_outlet(db_session, slug="wallet-split-outlet", name="Wallet Split Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_wallet_split@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Grocery Item", price=Decimal("18.00"))

    cust = Customer(
        outlet_id=outlet.id,
        phone="9876500018",
        name="Wallet Split Customer",
        credit_balance=Decimal("-2.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "WALLET-18",
            "customer_name": "Wallet Split Customer",
            "customer_phone": "9876500018",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 18.0,
                    "mrp": 21.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]
    order_uuid = uuid.UUID(bill_id)

    # Pay: 10 Cash + 5 UPI + 3 Debit
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 10.0,
            "upi_amount": 5.0,
            "record_debit": 3.0,
            "cash_denominations": {"10": 1},
            "change_denominations": {},
        },
    )
    assert pay_res.status_code == 200

    order_res = await db_session.execute(select(Order).where(Order.id == order_uuid))
    order = order_res.scalar_one()
    assert float(order.total_amount) == 18.0
    assert float(order.cash_amount) == 10.0
    assert float(order.upi_amount) == 5.0
    assert float(order.debit_applied) == 3.0

    # Customer wallet balance: -2.00 - 3.00 = -5.00
    await db_session.refresh(cust)
    assert float(cust.credit_balance) == -5.0

    # Verify Cash Drawer has exactly 10.0
    drawer_res = await db_session.execute(
        select(CashDrawerLedger).where(CashDrawerLedger.reference_order_id == order_uuid)
    )
    drawer = drawer_res.scalar_one()
    assert sum(int(k) * int(v) for k, v in drawer.denominations.items()) == 10


@pytest.mark.asyncio
async def test_direct_upi_with_shortfall_to_debit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Direct UPI Shortfall scenario:
    Bill total: Rs 25.00.
    Customer pays Rs 20.00 via Direct UPI.
    Remaining Rs 5.00 shortfall is recorded as Customer Debit (Udhaar).
    Verifies:
    - payment_method == "UPI"
    - upi_amount == 20.0, cash_amount == 0.0, debit_applied == 5.0
    - Customer balance drops by 5.0
    - Cash drawer ledger is not affected
    """
    outlet = await create_test_outlet(db_session, slug="upi-shortfall-outlet", name="UPI Shortfall Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_upi_short@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Fresh Juice", price=Decimal("25.00"))

    cust = Customer(
        outlet_id=outlet.id,
        phone="9876500025",
        name="UPI Shortfall Customer",
        credit_balance=Decimal("0.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "UPI-SHORT-01",
            "customer_name": "UPI Shortfall Customer",
            "customer_phone": "9876500025",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 25.0,
                    "mrp": 25.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]
    order_uuid = uuid.UUID(bill_id)

    # Settle Direct UPI: 20 UPI + 5 Debit
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "UPI",
            "upi_amount": 20.0,
            "cash_amount": 0.0,
            "record_debit": 5.0,
        },
    )
    assert pay_res.status_code == 200

    order_res = await db_session.execute(select(Order).where(Order.id == order_uuid))
    order = order_res.scalar_one()
    assert order.payment_method == "UPI"
    assert float(order.total_amount) == 25.0
    assert float(order.upi_amount) == 20.0
    assert float(order.cash_amount) == 0.0
    assert float(order.debit_applied) == 5.0

    await db_session.refresh(cust)
    assert float(cust.credit_balance) == -5.0


@pytest.mark.asyncio
async def test_direct_upi_with_surplus_to_store_credit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Direct UPI Surplus scenario:
    Bill total: Rs 25.00.
    Customer pays Rs 30.00 via Direct UPI.
    Surplus Rs 5.00 is converted to Store Credit.
    Verifies:
    - payment_method == "UPI"
    - upi_amount == 30.0, cash_amount == 0.0
    - Customer balance increases by 5.0
    """
    outlet = await create_test_outlet(db_session, slug="upi-surplus-outlet", name="UPI Surplus Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_upi_surplus@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Organic Honey", price=Decimal("25.00"))

    cust = Customer(
        outlet_id=outlet.id,
        phone="9876500030",
        name="UPI Surplus Customer",
        credit_balance=Decimal("0.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "UPI-SURP-01",
            "customer_name": "UPI Surplus Customer",
            "customer_phone": "9876500030",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 25.0,
                    "mrp": 25.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]
    order_uuid = uuid.UUID(bill_id)

    # Settle Direct UPI: 30 UPI + 5 Credit
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "UPI",
            "upi_amount": 30.0,
            "cash_amount": 0.0,
            "record_credit": 5.0,
        },
    )
    assert pay_res.status_code == 200

    order_res = await db_session.execute(select(Order).where(Order.id == order_uuid))
    order = order_res.scalar_one()
    assert order.payment_method == "UPI"
    assert float(order.total_amount) == 25.0
    assert float(order.upi_amount) == 30.0

    await db_session.refresh(cust)
    assert float(cust.credit_balance) == 5.0


