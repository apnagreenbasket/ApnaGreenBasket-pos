"""
Tests for Financial Reconciliation, True Pagination in Item Sales,
and Enterprise Multi-Tender Payment Mix.
"""

from datetime import datetime
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
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
async def test_item_sales_true_totals_unbounded_by_pagination(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that when more items exist than the pagination limit (e.g. 55 items, limit=50),
    ItemSalesResponse returns:
    - len(items) == 50 (paginated table rows)
    - total_items == 55
    - total_revenue == sum of all 55 items (NOT just the 50 items)
    - revenue_share_pct is calculated against the true total revenue.
    """
    outlet = await create_test_outlet(db_session, slug="pagination-outlet", name="Pagination Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_pagination@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)

    # Create 55 distinct menu items, each priced at Rs 10.00
    items = []
    for i in range(55):
        item = await create_test_menu_item(
            db_session, outlet, cat, name=f"Bulk Product {i:02d}", price=Decimal("10.00")
        )
        items.append(item)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # Create and settle a bill purchasing 1 of each of the 55 items (Total = Rs 550.00)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "PAGINATE-01",
            "customer_name": "Bulk Customer",
            "items": [
                {
                    "menu_item_id": str(item.id),
                    "quantity": 1,
                    "unit_price": 10.0,
                }
                for item in items
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]

    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 550.0,
            "cash_denominations": {"500": 1, "50": 1},
        },
    )
    assert pay_res.status_code == 200

    # Query item sales with limit=50
    res = await client.get("/api/analytics/item-sales?limit=50", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()

    # Verify true totals vs paginated table slice
    assert len(data["items"]) == 50
    assert data["total_items"] == 55
    assert float(data["total_revenue"]) == 550.0
    assert float(data["total_units_sold"]) == 55.0

    # Each item was Rs 10.00 out of Rs 550.00 -> approx 1.82%
    first_item = data["items"][0]
    assert float(first_item["revenue"]) == 10.0
    assert abs(float(first_item["revenue_share_pct"]) - (10.0 / 550.0 * 100.0)) < 0.05


@pytest.mark.asyncio
async def test_financial_reconciliation_bridge_matches_dashboard(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify the Financial Reconciliation Bridge:
    Gross Item Sales - Bill Discounts - Loyalty Discounts + Taxes/Charges - Returns == Net Billed Revenue
    and that Net Billed Revenue matches Dashboard KPI summary's total_revenue exactly.
    """
    outlet = await create_test_outlet(db_session, slug="bridge-outlet", name="Bridge Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_bridge@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item1 = await create_test_menu_item(db_session, outlet, cat, name="Item Alpha", price=Decimal("100.00"))
    item2 = await create_test_menu_item(db_session, outlet, cat, name="Item Beta", price=Decimal("200.00"))

    cust = Customer(
        outlet_id=outlet.id,
        phone="9876543299",
        name="Loyal Customer",
        credit_balance=Decimal("50.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # Create bill: Item Alpha (100) + Item Beta (200) = 300
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "BRIDGE-01",
            "customer_name": "Loyal Customer",
            "customer_phone": "9876543299",
            "items": [
                {"menu_item_id": str(item1.id), "quantity": 1, "unit_price": 100.0},
                {"menu_item_id": str(item2.id), "quantity": 1, "unit_price": 200.0},
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]

    # Mark paid: Rs 300 total, pay with Rs 50 Store Credit + Rs 250 Cash
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "apply_credit": 50.0,
            "cash_amount": 250.0,
            "cash_denominations": {"200": 1, "50": 1},
        },
    )
    assert pay_res.status_code == 200

    # Query Dashboard KPI Summary
    kpi_res = await client.get("/api/analytics/kpi-summary", headers=auth_headers)
    assert kpi_res.status_code == 200
    kpi_net_rev = float(kpi_res.json()["total_revenue"])
    assert kpi_net_rev == 300.0

    # Query Item Sales with Reconciliation Bridge
    item_res = await client.get("/api/analytics/item-sales", headers=auth_headers)
    assert item_res.status_code == 200
    bridge = item_res.json()["reconciliation_bridge"]
    assert bridge is not None
    assert float(bridge["gross_item_sales"]) == 300.0
    assert float(bridge["net_item_sales"]) == 300.0
    assert float(bridge["net_billed_revenue"]) == kpi_net_rev


@pytest.mark.asyncio
async def test_payment_mix_multi_tender_support(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify /api/analytics/payment-mix itemizes both Direct tenders (CASH, UPI, SPLIT)
    and Non-Cash tenders (STORE_CREDIT, LOYALTY_POINTS, UDHAAR).
    """
    outlet = await create_test_outlet(db_session, slug="tenders-outlet", name="Tenders Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_tenders@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, name="Multi-Tender Product", price=Decimal("100.00"))

    cust = Customer(
        outlet_id=outlet.id,
        phone="9876543211",
        name="Multi-Tender Customer",
        credit_balance=Decimal("20.00"),
    )
    db_session.add(cust)
    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # Create bill: Rs 100.00
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "TENDER-01",
            "customer_name": "Multi-Tender Customer",
            "customer_phone": "9876543211",
            "items": [{"menu_item_id": str(item.id), "quantity": 1, "unit_price": 100.0}],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]

    # Settle: Rs 20 Store Credit + Rs 10 Udhaar + Rs 40 Cash + Rs 30 UPI
    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "SPLIT",
            "apply_credit": 20.0,
            "record_debit": 10.0,
            "cash_amount": 40.0,
            "upi_amount": 30.0,
            "cash_denominations": {"20": 2},
        },
    )
    assert pay_res.status_code == 200

    # Query /api/analytics/payment-mix
    mix_res = await client.get("/api/analytics/payment-mix", headers=auth_headers)
    assert mix_res.status_code == 200
    methods = mix_res.json()["methods"]

    split_row = next((m for m in methods if m["payment_method"] == "SPLIT"), None)
    credit_row = next((m for m in methods if m["payment_method"] == "STORE_CREDIT"), None)
    udhaar_row = next((m for m in methods if m["payment_method"] == "UDHAAR"), None)

    assert split_row is not None
    assert float(split_row["total_revenue"]) == 70.0  # 40 Cash + 30 UPI
    assert split_row["tender_type"] == "DIRECT"

    assert credit_row is not None
    assert float(credit_row["total_revenue"]) == 20.0
    assert credit_row["tender_type"] == "NON_CASH"

    assert udhaar_row is not None
    assert float(udhaar_row["total_revenue"]) == 10.0
    assert udhaar_row["tender_type"] == "NON_CASH"

    # Total reconciled in payment mix: 70 + 20 + 10 = 100.00
    assert float(mix_res.json()["total_revenue"]) == 100.0
