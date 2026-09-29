"""
Tests for Partial Returns, Multi-step Returns, Daybook and Analytics Integrity.
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.shift_utils import IST
from app.models.enums import OrderStatusEnum, RoleEnum
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_partial_returns_multistep_and_analytics(client: AsyncClient, db_session: AsyncSession):
    outlet = await create_test_outlet(db_session, slug="partial-ret-outlet", name="Partial Ret Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_partial_ret@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    admin.name = "Cashier Sam"
    admin.phone = "9876500002"

    cat = await create_test_category(db_session, outlet, name="Groceries")
    item_a = await create_test_menu_item(db_session, outlet, cat, name="Item A (Milk)", price=Decimal("100.00"))
    item_b = await create_test_menu_item(db_session, outlet, cat, name="Item B (Bread)", price=Decimal("50.00"))
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 1. Create bill: 2x Item A (₹200) + 1x Item B (₹50) = ₹250
    bill_payload = {
        "basket_number": "BK-PARTIAL-01",
        "customer_name": "Charlie Customer",
        "customer_phone": "9876543299",
        "items": [
            {
                "menu_item_id": str(item_a.id),
                "quantity": 2,
                "unit_price": 100.0,
                "mrp": 100.0,
                "tax_rate": 0.0,
            },
            {
                "menu_item_id": str(item_b.id),
                "quantity": 1,
                "unit_price": 50.0,
                "mrp": 50.0,
                "tax_rate": 0.0,
            },
        ],
    }
    res_bill = await client.post("/api/billing/bills", json=bill_payload, headers=auth_headers)
    assert res_bill.status_code == 200
    bill = res_bill.json()
    order_id = bill["id"]
    item_a_order_item_id = next(it["id"] for it in bill["items"] if it["menu_item_id"] == str(item_a.id))
    item_b_order_item_id = next(it["id"] for it in bill["items"] if it["menu_item_id"] == str(item_b.id))

    # Mark paid
    res_paid = await client.post(
        f"/api/billing/bills/{order_id}/mark-paid",
        json={"payment_method": "CASH", "cash_denominations": {"500": 1}},
        headers=auth_headers,
    )
    assert res_paid.status_code == 200

    # 2. First Partial Return: Return 1 of Item A
    return_1_payload = {
        "order_id": order_id,
        "customer_name": "Charlie Customer",
        "customer_phone": "9876543299",
        "return_items": [
            {
                "order_item_id": item_a_order_item_id,
                "quantity": 1,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Returned 1 of 2 milks",
    }
    res_ret1 = await client.post("/api/billing/returns", json=return_1_payload, headers=auth_headers)
    assert res_ret1.status_code == 200
    ret1_data = res_ret1.json()
    assert ret1_data["total_refund_amount"] == 100.0

    # Verify bill status transitioned to PARTIALLY_REFUNDED with net amount
    res_get_bill1 = await client.get(f"/api/billing/bills/{order_id}", headers=auth_headers)
    assert res_get_bill1.status_code == 200
    bill1_data = res_get_bill1.json()
    assert bill1_data["status"] == "PARTIALLY_REFUNDED"
    assert bill1_data["total_amount"] == 250.0
    assert bill1_data["total_refunded_amount"] == 100.0
    assert bill1_data["net_amount"] == 150.0

    # 3. Validation: Trying to return 2 of Item A when only 1 is remaining should fail with 400
    invalid_return_payload = {
        "order_id": order_id,
        "customer_name": "Charlie Customer",
        "customer_phone": "9876543299",
        "return_items": [
            {
                "order_item_id": item_a_order_item_id,
                "quantity": 2,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
    }
    res_invalid = await client.post("/api/billing/returns", json=invalid_return_payload, headers=auth_headers)
    assert res_invalid.status_code == 400
    assert "remaining to return" in res_invalid.json()["detail"]

    # 4. Second Partial Return: Return remaining 1 of Item A
    return_2_payload = {
        "order_id": order_id,
        "customer_name": "Charlie Customer",
        "customer_phone": "9876543299",
        "return_items": [
            {
                "order_item_id": item_a_order_item_id,
                "quantity": 1,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
    }
    res_ret2 = await client.post("/api/billing/returns", json=return_2_payload, headers=auth_headers)
    assert res_ret2.status_code == 200

    # Bill is STILL PARTIALLY_REFUNDED because Item B (Bread) has not been returned
    res_get_bill2 = await client.get(f"/api/billing/bills/{order_id}", headers=auth_headers)
    bill2_data = res_get_bill2.json()
    assert bill2_data["status"] == "PARTIALLY_REFUNDED"
    assert bill2_data["total_refunded_amount"] == 200.0
    assert bill2_data["net_amount"] == 50.0

    # 5. Check KPI Summary after partial returns
    now_utc = datetime.utcnow()
    from_dt_str = (now_utc - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    to_dt_str = (now_utc + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")

    res_kpi = await client.get(
        f"/api/analytics/kpi-summary?outlet_id={outlet.id}&from_dt={from_dt_str}&to_dt={to_dt_str}",
        headers=auth_headers,
    )
    assert res_kpi.status_code == 200
    kpi = res_kpi.json()
    assert kpi["gross_revenue"] == 250.0
    assert kpi["total_return_amount"] == 200.0
    assert kpi["net_revenue"] == 50.0
    assert kpi["total_revenue"] == 50.0

    # 6. Check Top Selling Items
    res_top = await client.get(
        f"/api/analytics/top-items?outlet_id={outlet.id}&from_dt={from_dt_str}&to_dt={to_dt_str}&limit=10",
        headers=auth_headers,
    )
    assert res_top.status_code == 200
    top_items = res_top.json()["items"]
    # Item A is 100% returned (2 bought - 2 returned = 0 net qty), so only Item B should remain with net qty 1
    item_names = [it["name"] for it in top_items]
    assert "Item B (Bread)" in item_names
    assert "Item A (Milk)" not in item_names

    # 7. Check Daybook
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    res_daybook = await client.get(
        f"/api/analytics/day-book?date={today_str}",
        headers=auth_headers,
    )
    assert res_daybook.status_code == 200
    daybook_entries = res_daybook.json()["entries"]
    sales_entries = [e for e in daybook_entries if e["entry_type"] == "SALE"]
    return_entries = [e for e in daybook_entries if e["entry_type"] == "CUSTOMER_RETURN"]

    # Original sale of ₹250 is recorded and NOT wiped
    assert any(e["credit"] == 250.0 for e in sales_entries)
    # 2 Customer returns of ₹100 each are recorded
    assert len(return_entries) == 2
    for ret_e in return_entries:
        assert ret_e["debit"] == 100.0
        assert f"Bill #{bill['basket_number']}" in ret_e["description"]

    # 8. Third Return: Return Item B -> Bill automatically transitions to REFUNDED
    return_3_payload = {
        "order_id": order_id,
        "customer_name": "Charlie Customer",
        "customer_phone": "9876543299",
        "return_items": [
            {
                "order_item_id": item_b_order_item_id,
                "quantity": 1,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "refund_payment_method": "CASH",
    }
    res_ret3 = await client.post("/api/billing/returns", json=return_3_payload, headers=auth_headers)
    assert res_ret3.status_code == 200

    # Bill status is now fully REFUNDED
    res_get_bill3 = await client.get(f"/api/billing/bills/{order_id}", headers=auth_headers)
    bill3_data = res_get_bill3.json()
    assert bill3_data["status"] == "REFUNDED"
    assert bill3_data["total_refunded_amount"] == 250.0
    assert bill3_data["net_amount"] == 0.0

    # Daybook STILL retains the original sale of ₹250!
    res_daybook2 = await client.get(
        f"/api/analytics/day-book?date={today_str}",
        headers=auth_headers,
    )
    daybook_entries2 = res_daybook2.json()["entries"]
    assert any(e["entry_type"] == "SALE" and e["credit"] == 250.0 for e in daybook_entries2)
    assert len([e for e in daybook_entries2 if e["entry_type"] == "CUSTOMER_RETURN"]) == 3


@pytest.mark.asyncio
async def test_item_sales_cogs_after_partial_return(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that when 3 units are sold at ₹6 (cost ₹5) and 1 is returned:
    - Net quantity sold is 2
    - Revenue is ₹12
    - COGS is ₹10 (not ₹15)
    - Cost per unit is ₹5 (not ₹7.50)
    - Profit is ₹2 (not -₹3)
    """
    from app.models.inventory_item import InventoryItem
    from app.models.stock_intake import StockIntake
    from app.models.menu_item import MenuItem

    outlet = await create_test_outlet(db_session, slug="cogs-ret-outlet", name="COGS Ret Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_cogs_ret@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet, name="Snacks")

    # Inventory item with cost price 5.00
    inv = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        name="test1",
        cost_per_unit=Decimal("5.00"),
        current_stock=Decimal("100.00"),
    )
    db_session.add(inv)
    await db_session.flush()

    batch = StockIntake(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        item_id=inv.id,
        batch_number="BATCH-001",
        quantity=Decimal("100.00"),
        initial_quantity=Decimal("100.00"),
        remaining_quantity=Decimal("100.00"),
        unit_cost=Decimal("5.00"),
        retail_price=Decimal("6.00"),
    )
    db_session.add(batch)

    menu_item = await create_test_menu_item(
        db_session, outlet, cat, name="test1", price=Decimal("6.00")
    )
    menu_item.inventory_item_id = inv.id
    await db_session.commit()

    auth_headers = get_auth_headers(admin, outlet)

    # 1. Bill 3 units @ ₹6
    res_bill = await client.post(
        "/api/billing/bills",
        json={
            "basket_number": "BK-COGS-01",
            "items": [
                {
                    "menu_item_id": str(menu_item.id),
                    "quantity": 3,
                    "unit_price": 6.0,
                    "mrp": 6.0,
                    "tax_rate": 0.0,
                }
            ],
        },
        headers=auth_headers,
    )
    assert res_bill.status_code == 200
    bill = res_bill.json()
    order_id = bill["id"]
    order_item_id = bill["items"][0]["id"]

    # Mark paid
    res_paid = await client.post(
        f"/api/billing/bills/{order_id}/mark-paid",
        json={"payment_method": "CASH"},
        headers=auth_headers,
    )
    assert res_paid.status_code == 200

    # 2. Return 1 unit
    res_ret = await client.post(
        "/api/billing/returns",
        json={
            "order_id": order_id,
            "return_items": [
                {
                    "order_item_id": order_item_id,
                    "quantity": 1,
                    "reason": "DEFECTIVE_PRODUCT",
                }
            ],
            "refund_payment_method": "CASH",
        },
        headers=auth_headers,
    )
    assert res_ret.status_code == 200

    # 3. Fetch Item Sales Analytics
    now = datetime.now(IST)
    from_dt_str = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    to_dt_str = (now + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")

    res_item_sales = await client.get(
        f"/api/analytics/item-sales?outlet_id={outlet.id}&from_dt={from_dt_str}&to_dt={to_dt_str}",
        headers=auth_headers,
    )
    assert res_item_sales.status_code == 200
    items = res_item_sales.json()["items"]
    test1_row = next(it for it in items if it["item_name"] == "test1")

    assert test1_row["quantity_sold"] == 2.0
    assert test1_row["revenue"] == 12.0
    assert test1_row["cogs"] == 10.0
    assert test1_row["cost_per_unit"] == 5.0
    assert test1_row["estimated_profit"] == 2.0

    # 4. Fetch Bill Profit Analytics — Verify Net Revenue, Net COGS, and Realized Margin
    res_bill_profit = await client.get(
        f"/api/analytics/bill-profit?outlet_id={outlet.id}&from_dt={from_dt_str}&to_dt={to_dt_str}",
        headers=auth_headers,
    )
    assert res_bill_profit.status_code == 200
    bp_data = res_bill_profit.json()
    assert bp_data["total_revenue"] == 12.0
    assert bp_data["total_refunded_amount"] == 6.0
    assert bp_data["total_cogs"] == 10.0
    assert bp_data["total_profit"] == 2.0
    assert bp_data["overall_margin_pct"] == 16.67
    assert len(bp_data["bills"]) == 1
    bp_row = bp_data["bills"][0]
    assert bp_row["total_amount"] == 18.0
    assert bp_row["total_refunded_amount"] == 6.0
    assert bp_row["net_amount"] == 12.0
    assert bp_row["estimated_cogs"] == 10.0
    assert bp_row["estimated_profit"] == 2.0
    assert bp_row["margin_pct"] == 16.67

    # 5. Fetch AOV Analytics — Verify Net AOV reflects retained bill value (₹12.00)
    res_aov = await client.get(
        f"/api/analytics/aov?from_date={from_dt_str}&to_date={to_dt_str}&granularity=daily",
        headers=auth_headers,
    )
    assert res_aov.status_code == 200
    aov_data = res_aov.json()
    assert aov_data["overall_aov"] == 12.0
    assert len(aov_data["by_payment_method"]) >= 1
    pm_aov = next(p for p in aov_data["by_payment_method"] if p["payment_method"] == "CASH")
    assert pm_aov["avg_order_value"] == 12.0

    # 6. Fetch Payment Mix — Verify Net Revenue, Gross Revenue, and Refund Deduction
    res_pm = await client.get(
        f"/api/analytics/payment-mix?from_date={from_dt_str}&to_date={to_dt_str}",
        headers=auth_headers,
    )
    assert res_pm.status_code == 200
    pm_data = res_pm.json()
    assert pm_data["total_revenue"] == 12.0
    assert pm_data["gross_revenue"] == 18.0
    assert pm_data["total_refunded"] == 6.0
    cash_pm = next(m for m in pm_data["methods"] if m["payment_method"] == "CASH")
    assert cash_pm["total_revenue"] == 12.0
    assert cash_pm["gross_revenue"] == 18.0
    assert cash_pm["total_refunded"] == 6.0
    assert cash_pm["avg_order_value"] == 12.0


