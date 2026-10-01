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
from app.models.enums import RoleEnum
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


@pytest.mark.asyncio
async def test_drawer_state_syncs_with_customer_return(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that processing a customer return with cash denominations:
    1. Properly decrements the live drawer state notes and total balance in /api/billing/drawer-state.
    2. Correctly updates get_live_drawer_balance.
    """
    from decimal import Decimal
    from app.services.staff_punch_service import get_live_drawer_balance

    outlet = await create_test_outlet(db_session, slug="drawer-return-outlet", name="Drawer Return Outlet")
    user = await create_test_user(db_session, outlet, email="admin_drawer@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Deposit Opening Float: 2x 500 notes = Rs 1000
    dep_res = await client.post(
        "/api/billing/drawer-transaction",
        headers=auth_headers,
        json={
            "transaction_type": "MANUAL_DEPOSIT",
            "denominations": {"500": 2},
            "notes": "Opening morning float",
        },
    )
    assert dep_res.status_code == 200

    # 2. Verify drawer state before sales
    drawer_res = await client.get("/api/billing/drawer-state", headers=auth_headers)
    assert drawer_res.status_code == 200
    d_data = drawer_res.json()
    assert d_data["denominations"].get("500") == 2
    assert d_data["total_balance"] == 1000.0

    # 3. Onboard item and create a bill of Rs 200
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8901234567890",
            "name": "Basmati Rice 1kg",
            "category": "Grains",
            "unit": "pack",
            "initial_stock": 10,
            "cost_per_unit": 120.0,
            "selling_price": 200.0,
            "batch_number": "BAT-RICE-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    rice_item = next(m for m in menu_res.json() if m["name"] == "Basmati Rice 1kg")

    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "DRAWER-TEST-01",
            "items": [
                {
                    "menu_item_id": rice_item["id"],
                    "item_name": "Basmati Rice 1kg",
                    "quantity": 1.0,
                    "unit_price": 200.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()

    # Pay bill in cash with 1x 200 note
    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={
            "payment_method": "CASH",
            "cash_denominations": {"200": 1},
        },
    )
    assert pay_res.status_code == 200

    # Verify drawer state after bill payment: 2x 500, 1x 200 = Rs 1200
    drawer_res = await client.get("/api/billing/drawer-state", headers=auth_headers)
    assert drawer_res.status_code == 200
    d_data = drawer_res.json()
    assert d_data["denominations"].get("500") == 2
    assert d_data["denominations"].get("200") == 1
    assert d_data["total_balance"] == 1200.0

    # 4. Process customer return: Return the Rs 200 item with cash refund of 1x 200 note
    return_payload = {
        "order_id": bill["id"],
        "customer_name": "Walk-in",
        "return_items": [
            {
                "order_item_id": bill["items"][0]["id"],
                "quantity": 1.0,
                "unit_price": 200.0,
                "reason": "CUSTOMER_REQUEST",
            }
        ],
        "refund_payment_method": "CASH",
        "refund_cash_denominations": {"200": 1},
        "notes": "Refund Rs 200 rice",
    }
    ret_res = await client.post("/api/billing/returns", headers=auth_headers, json=return_payload)
    assert ret_res.status_code == 200

    # 5. Verify drawer state after customer return:
    # 200 note was refunded, so 200 count = 0, 500 count = 2, total_balance = 1000.0
    drawer_res = await client.get("/api/billing/drawer-state", headers=auth_headers)
    assert drawer_res.status_code == 200
    d_data = drawer_res.json()
    assert d_data["denominations"].get("500") == 2
    assert d_data["denominations"].get("200", 0) == 0
    assert d_data["total_balance"] == 1000.0

    # 6. Verify get_live_drawer_balance also matches exactly
    live_bal = await get_live_drawer_balance(db_session, outlet.id)
    assert live_bal == Decimal("1000.00")

    # 7. Verify /api/billing/reconciliation-summary
    rec_res = await client.get("/api/billing/reconciliation-summary", headers=auth_headers)
    assert rec_res.status_code == 200
    r_data = rec_res.json()
    assert r_data["counter_gross_sales"] == 200.0
    assert r_data["counter_cash_tender"] == 200.0
    assert r_data["returns_gross_amount"] == 200.0
    assert r_data["returns_cash_refund"] == 200.0
    assert r_data["cash_tender_total"] == 0.0
    assert r_data["upi_tender_total"] == 0.0
    assert r_data["consolidated_net_sales"] == 0.0
    assert r_data["total_tender"] == 0.0

    # 8. Verify CSV export
    csv_res = await client.get("/api/billing/reconciliation-summary?export=csv", headers=auth_headers)
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers.get("content-type", "")
    assert "Cash Tender (Total)" in csv_res.text
    assert "UPI Tender (Total)" in csv_res.text

    # 9. Verify non-exempt cashier role is forbidden
    cashier = await create_test_user(db_session, outlet, email="cashier_staff@test.com", role=RoleEnum.CASHIER)
    await db_session.commit()
    cashier_headers = get_auth_headers(cashier, outlet)
    cashier_res = await client.get("/api/billing/reconciliation-summary", headers=cashier_headers)
    assert cashier_res.status_code == 403


