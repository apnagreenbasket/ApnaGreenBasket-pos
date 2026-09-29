"""
Tests for Tax-Inclusive Reverse-Tax Billing Service Fix,
Reconciliation Bridge Realignment, and GST Taxable Bills (GST > 0) Aggregation.
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
async def test_billing_service_reverse_tax_inclusive_calculation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that billing_service calculates tax using reverse-extraction:
    Selling Price = Rs 118.00 at 18% GST ->
    Taxable Base = 118 / 1.18 = 100.00
    Tax Amount = 118 - 100 = 18.00 (NOT forward tax 118 * 0.18 = 21.24).
    """
    outlet = await create_test_outlet(db_session, slug="rev-tax-outlet", name="Reverse Tax Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_rev_tax@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)

    item_taxable = await create_test_menu_item(
        db_session, outlet, cat, name="Taxable Detergent", price=Decimal("118.00")
    )
    item_taxable.tax_rate = Decimal("18.00")
    item_taxable.hsn_code = "3402"

    item_exempt = await create_test_menu_item(
        db_session, outlet, cat, name="Fresh Potato", price=Decimal("50.00")
    )
    item_exempt.tax_rate = Decimal("0.00")
    item_exempt.hsn_code = "0701"

    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # 1. Create a bill with the 18% taxable item
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "TAX-01",
            "customer_name": "Tax Customer",
            "items": [
                {
                    "menu_item_id": str(item_taxable.id),
                    "quantity": 1,
                    "unit_price": 118.0,
                    "tax_rate": 18.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_data = bill_res.json()
    order_id = bill_data["id"]

    # Verify reverse tax was calculated: 18.00, NOT 21.24
    res_ord = await db_session.execute(select(Order).where(Order.id == uuid.UUID(order_id)))
    order_db = res_ord.scalar_one()
    assert order_db.tax_amount == Decimal("18.00")
    assert order_db.total_amount == Decimal("118.00")

    # 2. Settle the bill
    pay_res = await client.post(
        f"/api/billing/bills/{order_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "UPI",
            "upi_amount": 118.0,
        },
    )
    assert pay_res.status_code == 200


@pytest.mark.asyncio
async def test_reconciliation_bridge_and_taxable_bills_summary(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. /api/analytics/taxable-bills-summary aggregates bills where GST paid > 0 vs Zero-GST bills.
    2. /api/analytics/item-sales reconciliation bridge balances:
       Gross Item Sales - Returns - Bill Discounts - Loyalty + Delivery & Handling = Net Billed Revenue
       and reports extracted_gst_amount.
    """
    outlet = await create_test_outlet(db_session, slug="taxable-agg-outlet", name="Taxable Agg Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_taxable_agg@test.com", role=RoleEnum.OUTLET_ADMIN
    )
    cat = await create_test_category(db_session, outlet)

    # Taxable Item: Rs 100.00 with 12% GST (Base = 100 / 1.12 = 89.2857, GST = 10.714)
    item_fmcg = await create_test_menu_item(
        db_session, outlet, cat, name="Biscuits Pack", price=Decimal("100.00")
    )
    item_fmcg.tax_rate = Decimal("12.00")
    item_fmcg.hsn_code = "1905"

    # Zero-GST Item: Rs 200.00 with 0% GST (Fresh Produce)
    item_veg = await create_test_menu_item(
        db_session, outlet, cat, name="Fresh Apples 1kg", price=Decimal("200.00")
    )
    item_veg.tax_rate = Decimal("0.00")
    item_veg.hsn_code = "0808"

    await db_session.commit()
    auth_headers = get_auth_headers(admin, outlet)

    # Create & settle Bill 1: Taxable item (Rs 100) + Delivery charge Rs 30
    b1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "TAX-BILL-101",
            "customer_name": "Ravi Kumar",
            "customer_phone": "9876543210",
            "items": [
                {
                    "menu_item_id": str(item_fmcg.id),
                    "quantity": 1,
                    "unit_price": 100.0,
                    "tax_rate": 12.0,
                }
            ],
        },
    )
    assert b1_res.status_code == 200
    b1_id = b1_res.json()["id"]

    pay1_res = await client.post(
        f"/api/billing/bills/{b1_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "UPI",
            "delivery_charge": 30.0,
            "upi_amount": 130.0,
        },
    )
    assert pay1_res.status_code == 200

    # Create & settle Bill 2: Zero-GST item (Rs 200)
    b2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "ZERO-BILL-102",
            "customer_name": "Anita Sharma",
            "customer_phone": "9812345678",
            "items": [
                {
                    "menu_item_id": str(item_veg.id),
                    "quantity": 1,
                    "unit_price": 200.0,
                    "tax_rate": 0.0,
                }
            ],
        },
    )
    assert b2_res.status_code == 200
    b2_id = b2_res.json()["id"]

    pay2_res = await client.post(
        f"/api/billing/bills/{b2_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_amount": 200.0,
            "cash_denominations": {"200": 1},
        },
    )
    assert pay2_res.status_code == 200

    # 1. Test /api/analytics/taxable-bills-summary (Default: TAXABLE bills only)
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    tax_res = await client.get(
        f"/api/analytics/taxable-bills-summary?from_date={today_str}&to_date={today_str}&gst_filter=TAXABLE",
        headers=auth_headers,
    )
    assert tax_res.status_code == 200
    tax_data = tax_res.json()

    assert tax_data["taxable_bills_count"] == 1
    assert tax_data["zero_gst_bills_count"] == 1
    assert tax_data["total_bills"] == 2
    assert tax_data["taxable_bills_turnover"] == 130.0  # Rs 100 item + Rs 30 delivery
    assert tax_data["zero_gst_bills_turnover"] == 200.0
    assert tax_data["total_gst_collected"] > 10.0
    assert len(tax_data["bills"]) == 1
    assert tax_data["bills"][0]["basket_number"] == "TAX-BILL-101"
    assert tax_data["bills"][0]["total_gst_amount"] > 10.0

    # 2. Test /api/analytics/taxable-bills-summary with gst_filter=ZERO_GST
    zero_res = await client.get(
        f"/api/analytics/taxable-bills-summary?from_date={today_str}&to_date={today_str}&gst_filter=ZERO_GST",
        headers=auth_headers,
    )
    assert zero_res.status_code == 200
    zero_data = zero_res.json()
    assert len(zero_data["bills"]) == 1
    assert zero_data["bills"][0]["basket_number"] == "ZERO-BILL-102"
    assert zero_data["bills"][0]["total_gst_amount"] == 0.0

    # 3. Test /api/analytics/item-sales Reconciliation Bridge
    sales_res = await client.get(
        f"/api/analytics/item-sales?from_date={today_str}&to_date={today_str}",
        headers=auth_headers,
    )
    assert sales_res.status_code == 200
    sales_data = sales_res.json()
    bridge = sales_data["reconciliation_bridge"]
    assert bridge is not None

    # Gross Item Sales = 100 + 200 = 300
    assert bridge["gross_item_sales"] == 300.0
    # Delivery & Handling = 30.0
    assert bridge["delivery_and_handling_charges"] == 30.0
    # Extracted GST
    assert bridge["extracted_gst_amount"] > 10.0
    assert bridge["taxable_bills_count"] == 1
    # Net Billed Revenue = 300 + 30 = 330
    assert bridge["net_billed_revenue"] == 330.0
