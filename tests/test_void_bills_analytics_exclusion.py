"""
Tests verifying that voided/replaced bills are properly excluded from:
1. Bill-wise Profit (total_bills count, total_revenue, bills table)
2. Cash Denominations (net_cash_in_drawer, transaction notes)
3. Outlet Earnings (gross_revenue, net_drawer_earnings)
"""

from decimal import Decimal
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
