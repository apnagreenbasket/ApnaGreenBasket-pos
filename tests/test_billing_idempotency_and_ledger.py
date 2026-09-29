"""
Tests for billing payment idempotency, zero-cash denomination guard,
and the credit/debit analytics transactions ledger.
"""

import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.customer_ledger import CustomerLedger
from app.models.cash_drawer_ledger import CashDrawerLedger
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_mark_bill_paid_idempotency_guard(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that calling /mark-paid multiple times on the same bill:
    1. Only processes the debt deduction ONCE on the first call.
    2. Strictly rejects subsequent calls with 400 Bad Request ("already COMPLETED").
    3. Prevents balance multiplication / duplicate ledger entries.
    """
    outlet = await create_test_outlet(db_session, slug="idempotency-outlet", name="Idempotency Outlet")
    user = await create_test_user(db_session, outlet, email="admin_idem@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item priced at 155.0
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8909999000155",
            "name": "Organic Ghee 500ml",
            "category": "Groceries",
            "unit": "jar",
            "initial_stock": 20,
            "cost_per_unit": 100.0,
            "selling_price": 155.0,
            "batch_number": "BAT-GHEE-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    ghee_item = next(m for m in menu_res.json() if m["name"] == "Organic Ghee 500ml")

    # 2. Create bill for customer Asad (phone 6203511102) with 1 item (155.0)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "WALK-IN",
            "customer_name": "Asad",
            "customer_phone": "6203511102",
            "items": [
                {
                    "menu_item_id": ghee_item["id"],
                    "quantity": 1.0,
                    "unit_price": 155.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()
    bill_id = bill["id"]

    # 3. First call to mark-paid with record_debit = 155.0 (Customer takes on Udhaar)
    pay_res1 = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "record_debit": 155.0,
            "cash_denominations": {"500": 0, "200": 0},
            "change_denominations": {"500": 0},
        },
    )
    assert pay_res1.status_code == 200

    # Verify customer balance is -155.0
    cust_res = await db_session.execute(select(Customer).where(Customer.phone == "6203511102"))
    cust = cust_res.scalar_one()
    assert float(cust.credit_balance) == -155.0

    # Verify exactly 1 CustomerLedger entry exists
    ledger_res = await db_session.execute(select(CustomerLedger).where(CustomerLedger.customer_id == cust.id))
    entries = ledger_res.scalars().all()
    assert len(entries) == 1
    assert entries[0].entry_type == "DEBIT_ADDED"
    assert float(entries[0].amount) == 155.0
    assert float(entries[0].balance_after) == -155.0

    # 4. DUPLICATE CALL: second call to mark-paid (simulating rapid double click / spam)
    pay_res2 = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "record_debit": 155.0,
        },
    )
    assert pay_res2.status_code == 400
    assert "already" in pay_res2.json()["detail"].lower()

    # 5. TRIPLICATE CALL: third call
    pay_res3 = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "record_debit": 155.0,
        },
    )
    assert pay_res3.status_code == 400

    # Verify balance was NOT multiplied: still -155.0, NOT -465.0!
    await db_session.refresh(cust)
    assert float(cust.credit_balance) == -155.0

    # Verify ledger still only has 1 entry
    ledger_res2 = await db_session.execute(select(CustomerLedger).where(CustomerLedger.customer_id == cust.id))
    assert len(ledger_res2.scalars().all()) == 1


@pytest.mark.asyncio
async def test_zero_cash_denominations_not_logged(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that zero-value cash note dictionaries do not create phantom
    CUSTOMER_PAYMENT / CUSTOMER_CHANGE entries in CashDrawerLedger.
    """
    outlet = await create_test_outlet(db_session, slug="zero-cash-outlet", name="Zero Cash Outlet")
    user = await create_test_user(db_session, outlet, email="admin_zerocash@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard product
    await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8908888000100",
            "name": "Cold Pressed Mustard Oil 1L",
            "category": "Oils",
            "unit": "bottle",
            "initial_stock": 10,
            "cost_per_unit": 120.0,
            "selling_price": 180.0,
            "batch_number": "BAT-OIL-01",
        },
    )
    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    oil_item = next(m for m in menu_res.json() if m["name"] == "Cold Pressed Mustard Oil 1L")

    # 2. Create and settle bill with zero-count notes
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-ZERO-CASH",
            "items": [{"menu_item_id": oil_item["id"], "quantity": 1.0, "unit_price": 180.0}],
        },
    )
    bill = bill_res.json()

    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_denominations": {"500": 0, "200": 0, "100": 0, "50": 0},
            "change_denominations": {"500": 0, "200": 0},
        },
    )
    assert pay_res.status_code == 200

    # 3. Check CashDrawerLedger: NO entries should exist for this order
    bill_uuid = uuid.UUID(bill["id"])
    cd_res = await db_session.execute(
        select(CashDrawerLedger).where(CashDrawerLedger.reference_order_id == bill_uuid)
    )
    assert len(cd_res.scalars().all()) == 0


@pytest.mark.asyncio
async def test_credit_debit_report_includes_transactions(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that /api/analytics/credit-debit-report returns the dedicated
    transactions list with full audit details (customer name, phone, type, amount, balance_after).
    """
    outlet = await create_test_outlet(db_session, slug="analytics-cd-outlet", name="Analytics CD Outlet")
    user = await create_test_user(db_session, outlet, email="admin_cdreport@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item
    await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8907777000200",
            "name": "Organic Basmati Rice 1kg",
            "category": "Grains",
            "unit": "pack",
            "initial_stock": 20,
            "cost_per_unit": 80.0,
            "selling_price": 120.0,
            "batch_number": "BAT-RICE-01",
        },
    )
    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    rice_item = next(m for m in menu_res.json() if m["name"] == "Organic Basmati Rice 1kg")

    # 2. Create bill and settle with shortfall (Udhaar)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-LEDGER-01",
            "customer_name": "Priya Sharma",
            "customer_phone": "9876543210",
            "items": [{"menu_item_id": rice_item["id"], "quantity": 2.0, "unit_price": 120.0}],
        },
    )
    bill = bill_res.json()

    # Settle with 100 paid in cash, 140 recorded as debt (shortfall)
    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_denominations": {"100": 1},
            "record_debit": 140.0,
        },
    )
    assert pay_res.status_code == 200

    # 3. Query Credit/Debit Report
    now = datetime.now(timezone.utc)
    from_date = (now - timedelta(days=1)).isoformat()
    to_date = (now + timedelta(days=1)).isoformat()

    report_res = await client.get(
        f"/api/analytics/credit-debit-report?from_date={from_date}&to_date={to_date}",
        headers=auth_headers,
    )
    assert report_res.status_code == 200
    report = report_res.json()

    # Verify transactions field is present and populated
    assert "transactions" in report
    assert len(report["transactions"]) >= 1

    tx = next(t for t in report["transactions"] if t["customer_phone"] == "9876543210")
    assert tx["customer_name"] == "Priya Sharma"
    assert tx["entry_type"] == "DEBIT_ADDED"
    assert float(tx["amount"]) == 140.0
    assert float(tx["balance_after"]) == -140.0
    assert tx["order_basket_number"] == "POS-LEDGER-01"
