"""
Tests verifying that voided/replaced bills are properly excluded from:
1. Bill-wise Profit (total_bills count, total_revenue, bills table)
2. Cash Denominations (net_cash_in_drawer, transaction notes)
3. Outlet Earnings (gross_revenue, net_drawer_earnings)
"""

from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RoleEnum
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_voided_bills_excluded_from_analytics(
    client: AsyncClient,
    db_session: AsyncSession,
):
    outlet = await create_test_outlet(db_session, slug="void-test-outlet", name="Void Test Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_void@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item_28 = await create_test_menu_item(db_session, outlet, cat, name="Item 28", price=Decimal("28.00"))
    item_17 = await create_test_menu_item(db_session, outlet, cat, name="Item 17", price=Decimal("17.00"))
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 1. Create and pay Bill #1 (Total = Rs 28.00)
    bill1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "WALK-IN",
            "customer_name": "Asad",
            "customer_phone": "9876543210",
            "items": [
                {
                    "menu_item_id": str(item_28.id),
                    "quantity": 1,
                    "unit_price": 28.0,
                }
            ],
        },
    )
    assert bill1_res.status_code == 200
    bill1_id = bill1_res.json()["id"]

    pay1_res = await client.post(
        f"/api/billing/bills/{bill1_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 28.0,
            "cash_denominations": {"20": 1, "5": 1, "2": 1, "1": 1},
        },
    )
    assert pay1_res.status_code == 200

    # 2. Create Bill #2 replacing Bill #1 (Total = Rs 17.00, Rs 3 kept as credit, Net paid = Rs 20.00)
    bill2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "WALK-IN",
            "customer_name": "Asad",
            "customer_phone": "9876543210",
            "replaces_bill_id": bill1_id,
            "items": [
                {
                    "menu_item_id": str(item_17.id),
                    "quantity": 1,
                    "unit_price": 17.0,
                }
            ],
        },
    )
    assert bill2_res.status_code == 200
    bill2_id = bill2_res.json()["id"]

    pay2_res = await client.post(
        f"/api/billing/bills/{bill2_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 20.0,
            "record_credit": 3.0,
            "cash_denominations": {"20": 1},
        },
    )
    assert pay2_res.status_code == 200

    # 3. Verify Bill Profit report excludes voided Bill #1
    bp_res = await client.get("/api/analytics/bill-profit", headers=auth_headers)
    assert bp_res.status_code == 200
    bp_data = bp_res.json()
    assert bp_data["total_bills"] == 1, f"Expected 1 bill, got {bp_data['total_bills']}"
    assert bp_data["total_revenue"] == 17.0, f"Expected 17.0 revenue, got {bp_data['total_revenue']}"
    assert len(bp_data["bills"]) == 1
    assert bp_data["bills"][0]["order_id"] == bill2_id

    # 4. Verify Cash Denominations excludes voided Bill #1 notes (₹28) and only includes Bill #2 notes (₹20)
    cd_res = await client.get("/api/analytics/cash-denominations", headers=auth_headers)
    assert cd_res.status_code == 200
    cd_data = cd_res.json()
    assert cd_data["net_cash_in_drawer"] == 20.0, f"Expected 20.0 in drawer, got {cd_data['net_cash_in_drawer']}"
    assert cd_data["total_transactions"] == 1, f"Expected 1 transaction, got {cd_data['total_transactions']}"

    # 5. Verify Outlet Earnings excludes voided Bill #1
    from datetime import datetime, timezone, timedelta
    now_utc = datetime.now(timezone.utc)
    from_date = (now_utc - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
    to_date = (now_utc + timedelta(days=1)).strftime("%Y-%m-%dT23:59:59")
    oe_res = await client.get(
        f"/api/analytics/outlet-earnings?from_date={from_date}&to_date={to_date}",
        headers=auth_headers,
    )
    assert oe_res.status_code == 200
    oe_data = oe_res.json()
    assert oe_data["gross_revenue"] == 17.0, f"Expected 17.0 gross revenue, got {oe_data['gross_revenue']}"
    assert oe_data["total_credit_awarded"] == 3.0, f"Expected 3.0 credit awarded, got {oe_data['total_credit_awarded']}"
    assert oe_data["net_drawer_earnings"] == 20.0, f"Expected 20.0 net drawer earnings, got {oe_data['net_drawer_earnings']}"


@pytest.mark.asyncio
async def test_replace_bill_with_inherited_discount(
    client: AsyncClient,
    db_session: AsyncSession,
):
    outlet = await create_test_outlet(db_session, slug="discount-replace-outlet", name="Discount Replace Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_discount_rep@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Item 100", price=Decimal("100.00"))
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 1. Create Bill #1
    bill1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "D-01",
            "customer_name": "Test Cust",
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
    assert bill1_res.status_code == 200
    bill1_id = bill1_res.json()["id"]

    # 2. Apply 10% discount to Bill #1 (manager/admin auto-approves)
    disc_res = await client.post(
        f"/api/billing/bills/{bill1_id}/apply-discount",
        headers=auth_headers,
        json={
            "discount_type": "PERCENT",
            "discount_value": 10.0,
            "reason_note": "Privileged Member Discount",
        },
    )
    assert disc_res.status_code == 200
    assert disc_res.json()["discount_status"] == "APPROVED"

    # 3. Mark Bill #1 as Paid
    pay1_res = await client.post(
        f"/api/billing/bills/{bill1_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 90.0,
            "cash_denominations": {"50": 1, "20": 2},
        },
    )
    assert pay1_res.status_code == 200

    # 4. Create Bill #2 replacing Bill #1 (inherits discount)
    bill2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "D-01-EDIT",
            "customer_name": "Test Cust",
            "customer_phone": "9876543210",
            "replaces_bill_id": bill1_id,
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 2,
                    "unit_price": 100.0,
                }
            ],
        },
    )
    assert bill2_res.status_code == 200, f"Creating replacement bill failed: {bill2_res.text}"
    bill2_data = bill2_res.json()
    assert bill2_data["discount_status"] == "APPROVED"
    assert bill2_data["discount_type"] == "PERCENT"
    assert bill2_data["discount_value"] == 10.0
    assert bill2_data["total_amount"] == 180.0


@pytest.mark.asyncio
async def test_replace_bill_with_customer_wallet_reversal(
    client: AsyncClient,
    db_session: AsyncSession,
):
    from app.models.customer import Customer
    from app.models.order import Order

    outlet = await create_test_outlet(db_session, slug="wallet-replace-outlet", name="Wallet Replace Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_wallet_rep@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item_40 = await create_test_menu_item(db_session, outlet, cat, name="Item 40", price=Decimal("40.00"))
    item_10 = await create_test_menu_item(db_session, outlet, cat, name="Item 10", price=Decimal("10.00"))

    # 1. Pre-create customer with Rs 1 Debit (Udhaar: credit_balance = -1.00)
    cust = Customer(
        outlet_id=outlet.id,
        phone="9876543210",
        name="Test Debtor",
        credit_balance=Decimal("-1.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 2. Create Bill #1: Rs 40 item
    bill1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "B-01",
            "customer_name": "Test Debtor",
            "customer_phone": "9876543210",
            "items": [
                {
                    "menu_item_id": str(item_40.id),
                    "quantity": 1,
                    "unit_price": 40.0,
                }
            ],
        },
    )
    assert bill1_res.status_code == 200
    bill1_id = bill1_res.json()["id"]

    # 3. Pay Bill #1 and settle the Rs 1.00 debt (Total cash = 40.00 + 1.00 = 41.00)
    pay1_res = await client.post(
        f"/api/billing/bills/{bill1_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 41.0,
            "debt_settled": 1.0,
        },
    )
    assert pay1_res.status_code == 200

    # Verify customer debt is now settled (balance = 0.00)
    await db_session.refresh(cust)
    assert cust.credit_balance == Decimal("0.00")

    # 4. User edits Bill #1 -> creates Bill #2 replacing Bill #1 with Rs 50 total (40 + 10)
    bill2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "B-01-EDIT",
            "customer_name": "Test Debtor",
            "customer_phone": "9876543210",
            "replaces_bill_id": bill1_id,
            "items": [
                {
                    "menu_item_id": str(item_40.id),
                    "quantity": 1,
                    "unit_price": 40.0,
                },
                {
                    "menu_item_id": str(item_10.id),
                    "quantity": 1,
                    "unit_price": 10.0,
                },
            ],
        },
    )
    assert bill2_res.status_code == 200
    bill2_data = bill2_res.json()
    bill2_id = bill2_data["id"]
    # Verify draft bill snapshot customer_balance reflects the pre-bill balance (-1.00)
    assert bill2_data["customer_balance"] == -1.0

    # 5. Pay Bill #2 WITHOUT settling debt (just pay the Rs 50.00 items in cash)
    pay2_res = await client.post(
        f"/api/billing/bills/{bill2_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 50.0,
            "debt_settled": 0.0,
        },
    )
    assert pay2_res.status_code == 200

    # 6. Verify:
    # - Old bill #1 is voided
    # - Customer's wallet has the Rs 1.00 debit restored (balance = -1.00)
    old_bill1 = await db_session.get(Order, uuid.UUID(bill1_id))
    assert old_bill1.is_void is True
    assert old_bill1.status.value == "REFUNDED"

    await db_session.refresh(cust)
    assert cust.credit_balance == Decimal("-1.00"), f"Expected credit_balance -1.00, got {cust.credit_balance}"

    # 7. Edit Bill #2 -> Bill #3 replacing Bill #2 (replaces_bill_id = bill2_id)
    # This time, user checks "Settle Debt" (debt_settled = 1.0, cash_amount = 51.0)
    bill3_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "B-01-EDIT-2",
            "customer_name": "Test Debtor",
            "customer_phone": "9876543210",
            "replaces_bill_id": bill2_id,
            "items": [
                {
                    "menu_item_id": str(item_40.id),
                    "quantity": 1,
                    "unit_price": 40.0,
                },
                {
                    "menu_item_id": str(item_10.id),
                    "quantity": 1,
                    "unit_price": 10.0,
                },
            ],
        },
    )
    assert bill3_res.status_code == 200
    bill3_id = bill3_res.json()["id"]

    pay3_res = await client.post(
        f"/api/billing/bills/{bill3_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 51.0,
            "debt_settled": 1.0,
        },
    )
    assert pay3_res.status_code == 200

    # Verify: Bill #2 is voided, and customer debt is settled back to 0.00
    old_bill2 = await db_session.get(Order, uuid.UUID(bill2_id))
    assert old_bill2.is_void is True
    assert old_bill2.status.value == "REFUNDED"

    await db_session.refresh(cust)
    assert cust.credit_balance == Decimal("0.00")


