"""
Tests for Exchange Logic, Return Ledger, Daybook Exchange Sales, and Outlet Earnings Returns Deduction.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.enums import OrderStatusEnum, RoleEnum
from app.models.order import Order
from app.models.customer_return import CustomerReturn
from app.models.menu_item import MenuItem
from tests.conftest import (
    create_test_outlet,
    create_test_user,
    create_test_category,
    create_test_menu_item,
    get_auth_headers,
)


@pytest.mark.asyncio
async def test_exchange_flow_order_creation_and_analytics(client: AsyncClient, db_session):
    # 1. Setup outlet, admin, and a menu item for exchange
    outlet = await create_test_outlet(db_session)
    admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
    category = await create_test_category(db_session, outlet, name="Fruits")

    exchange_item = await create_test_menu_item(
        db_session,
        outlet,
        category,
        name="Fresh Apple",
        price=Decimal("120.00"),
        is_available=True,
    )
    await db_session.commit()

    admin_auth_headers = get_auth_headers(admin, outlet)

    # 2. Process return with exchange item
    # Returned item: 1x Old Item @ 150
    # Exchange item: 1x Fresh Apple @ 120
    # Net refund = 150 - 120 = 30
    return_payload = {
        "order_id": None,
        "customer_name": "Ravi Kumar",
        "customer_phone": "9876543210",
        "return_items": [
            {
                "menu_item_id": None,
                "item_name": "Old Damaged Mango",
                "quantity": 1.0,
                "unit_price": 150.0,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "exchange_items": [
            {
                "menu_item_id": str(exchange_item.id),
                "item_name": "Fresh Apple",
                "quantity": 1.0,
                "unit_price": 120.0,
                "selected_unit": "kg",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Exchange damaged mango for apple",
    }

    res = await client.post(
        "/api/billing/returns",
        json=return_payload,
        headers=admin_auth_headers,
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()

    assert data["status"] == "PROCESSED"
    assert data["gross_return_amount"] == 150.0  # Return Absolute: 150.0
    assert data["total_refund_amount"] == 30.0  # Net refund: 150 - 120 = 30
    assert data["total_exchange_amount"] == 120.0
    assert data["exchange_order_id"] is not None
    assert len(data["exchange_items"]) == 1
    assert data["exchange_items"][0]["item_name"] == "Fresh Apple"

    # 3. Verify real Order created for exchange items
    exc_order_id = uuid.UUID(data["exchange_order_id"])
    ord_res = await db_session.execute(
        select(Order).where(Order.id == exc_order_id)
    )
    exc_order = ord_res.scalar_one_or_none()
    assert exc_order is not None
    assert exc_order.source == "EXCHANGE"
    assert exc_order.status == OrderStatusEnum.COMPLETED
    assert float(exc_order.total_amount) == 120.0
    assert exc_order.payment_method == "EXCHANGE_CREDIT"
    assert exc_order.paid_at is not None

    # Verify CustomerReturn record in DB
    ret_res = await db_session.execute(
        select(CustomerReturn).where(CustomerReturn.id == uuid.UUID(data["id"]))
    )
    ret_rec = ret_res.scalar_one_or_none()
    assert ret_rec is not None
    assert ret_rec.exchange_order_id == exc_order_id
    assert float(ret_rec.gross_return_amount) == 150.0
    assert float(ret_rec.total_refund_amount) == 30.0
    assert float(ret_rec.total_exchange_amount) == 120.0
    assert len(ret_rec.exchange_items) == 1

    # 4. Test Daybook contains EXCHANGE_SALE and CUSTOMER_RETURN under Option B
    from app.core.shift_utils import IST
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    res_db = await client.get(
        f"/api/analytics/day-book?date={today_str}",
        headers=admin_auth_headers,
    )
    assert res_db.status_code == 200, f"Daybook failed: {res_db.text}"
    daybook = res_db.json()
    entry_types = [e["entry_type"] for e in daybook["entries"]]
    assert "EXCHANGE_SALE" in entry_types
    assert "CUSTOMER_RETURN" in entry_types

    exc_entry = next(e for e in daybook["entries"] if e["entry_type"] == "EXCHANGE_SALE")
    # Under Option B: 100% covered by return credit, so credit (Cash In) is 0.0
    assert exc_entry["credit"] == 0.0
    assert "Return Credit" in exc_entry["description"]

    ret_entry = next(e for e in daybook["entries"] if e["entry_type"] == "CUSTOMER_RETURN")
    # Net physical cash handed to customer: 30.0
    assert ret_entry["debit"] == 30.0

    now_utc = datetime.now(timezone.utc)
    from_date = (now_utc - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")
    to_date = (now_utc + timedelta(days=1)).strftime("%Y-%m-%dT23:59:59")
    res_earn = await client.get(
        f"/api/analytics/outlet-earnings?from_date={from_date}&to_date={to_date}",
        headers=admin_auth_headers,
    )
    assert res_earn.status_code == 200, f"Outlet earnings failed: {res_earn.text}"
    earnings = res_earn.json()
    assert "total_customer_returns" in earnings
    assert earnings["total_customer_returns"] == 150.0  # Return Absolute (gross return amount)
    # Gross revenue includes the 120 exchange sale
    assert earnings["gross_revenue"] >= 120.0
    # Net drawer earnings formula: gross (120) - customer_returns (150) = -30
    assert earnings["net_drawer_earnings"] == earnings["gross_revenue"] - earnings["total_customer_returns"]

    # 6. Test Customer Returns Analytics contains return_ledger and all returned items
    res_ret_analytics = await client.get(
        f"/api/analytics/customer-returns?from_date={from_date}&to_date={to_date}",
        headers=admin_auth_headers,
    )
    assert res_ret_analytics.status_code == 200, f"Customer return analytics failed: {res_ret_analytics.text}"
    ret_analytics = res_ret_analytics.json()
    assert "return_ledger" in ret_analytics
    assert len(ret_analytics["return_ledger"]) >= 1
    ledger_item = ret_analytics["return_ledger"][0]
    assert ledger_item["item_name"] == "Old Damaged Mango"
    assert ledger_item["quantity"] == 1.0
    assert ledger_item["unit_price"] == 150.0
    assert ledger_item["line_refund"] == 150.0
    assert ledger_item["customer_name"] == "Ravi Kumar"
    assert ledger_item["return_number"].startswith("RET-")

    # Verify top_returned_items includes the returned item
    item_names = [it["item_name"] for it in ret_analytics["top_returned_items"]]
    assert "Old Damaged Mango" in item_names


@pytest.mark.asyncio
async def test_exchange_inventory_deduction_fifo(client: AsyncClient, db_session):
    """
    Verify that selling items during an exchange:
    1. Deducts inventory at the batch level in strict FIFO order.
    2. Reduces remaining_quantity in StockIntake.
    3. Decrements current_stock in InventoryItem.
    4. Creates StockLedger AUTO_DEDUCTION entries referencing the exchange order.
    """
    from app.models.inventory_item import InventoryItem
    from app.models.stock_intake import StockIntake
    from app.models.stock_ledger import StockLedger

    outlet = await create_test_outlet(db_session, slug="exc-inv-outlet", name="Exchange Inventory Outlet")
    admin = await create_test_user(db_session, outlet, email="admin_excinv@test.com", role=RoleEnum.OUTLET_ADMIN)
    await db_session.commit()
    admin_auth_headers = get_auth_headers(admin, outlet)

    # 1. Onboard inventory product with Batch 1 (Stock = 5, Price = 50.0)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=admin_auth_headers,
        json={
            "barcode": "890999888111",
            "name": "Organic Honey",
            "category": "Grocery",
            "unit": "piece",
            "initial_stock": 5,
            "cost_per_unit": 30.0,
            "selling_price": 50.0,
            "mrp": 60.0,
            "batch_number": "HONEY-LOT-01",
        },
    )
    assert onboard_res.status_code == 201, f"Onboard failed: {onboard_res.text}"

    # Get created menu item and batches
    menu_res = await client.get("/api/admin/menu-items", headers=admin_auth_headers)
    assert menu_res.status_code == 200
    honey_menu = next(m for m in menu_res.json() if m["name"] == "Organic Honey")
    inv_item_id = honey_menu["inventory_item_id"]
    batch_1_id = honey_menu["active_batches"][0]["id"]

    # 2. Inward Batch 2 (Stock = 10, Price = 55.0, batch_number = "HONEY-LOT-02")
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=admin_auth_headers,
        json={
            "item_id": inv_item_id,
            "quantity": 10,
            "unit_cost": 35.0,
            "retail_price": 55.0,
            "mrp": 65.0,
            "batch_number": "HONEY-LOT-02",
        },
    )
    assert intake_res.status_code in (200, 201), f"Intake failed: {intake_res.text}"

    # Re-fetch menu items to get both batches
    menu_res2 = await client.get("/api/admin/menu-items", headers=admin_auth_headers)
    honey_menu2 = next(m for m in menu_res2.json() if m["name"] == "Organic Honey")
    assert len(honey_menu2["active_batches"]) == 2
    batch_1 = honey_menu2["active_batches"][0]
    batch_2 = honey_menu2["active_batches"][1]
    assert batch_1["batch_number"] == "HONEY-LOT-01"
    assert batch_2["batch_number"] == "HONEY-LOT-02"

    # 3. Process return with exchange of 7 items (5 from Batch 1, 2 from Batch 2)
    # Return 1x defective item @ 500
    # Exchange items: 5x Batch 1 @ 50.0 (250) + 2x Batch 2 @ 55.0 (110) = 360
    # Net refund = 500 - 360 = 140
    return_payload = {
        "order_id": None,
        "customer_name": "Suresh Patel",
        "customer_phone": "9123456780",
        "return_items": [
            {
                "menu_item_id": None,
                "item_name": "Broken Glass Vase",
                "quantity": 1.0,
                "unit_price": 500.0,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "exchange_items": [
            {
                "menu_item_id": str(honey_menu2["id"]),
                "selected_batch_id": batch_1["id"],
                "item_name": "Organic Honey",
                "quantity": 5.0,
                "unit_price": 50.0,
                "selected_unit": "piece",
            },
            {
                "menu_item_id": str(honey_menu2["id"]),
                "selected_batch_id": batch_2["id"],
                "item_name": "Organic Honey",
                "quantity": 2.0,
                "unit_price": 55.0,
                "selected_unit": "piece",
            },
        ],
        "refund_payment_method": "CASH",
        "notes": "Exchange vase for honey lots",
    }

    ret_res = await client.post(
        "/api/billing/returns",
        json=return_payload,
        headers=admin_auth_headers,
    )
    assert ret_res.status_code == 200, f"Return failed: {ret_res.text}"
    ret_data = ret_res.json()
    assert ret_data["status"] == "PROCESSED"
    assert ret_data["total_exchange_amount"] == 360.0
    assert ret_data["total_refund_amount"] == 140.0
    exc_order_id = uuid.UUID(ret_data["exchange_order_id"])

    # 4. Verify inventory was deducted accurately!
    # Check Batch 1 remaining quantity: was 5, deducted 5 -> should be 0
    b1_res = await db_session.execute(
        select(StockIntake).where(StockIntake.id == uuid.UUID(batch_1["id"]))
    )
    b1_db = b1_res.scalar_one_or_none()
    assert b1_db is not None
    assert float(b1_db.remaining_quantity) == 0.0

    # Check Batch 2 remaining quantity: was 10, deducted 2 -> should be 8
    b2_res = await db_session.execute(
        select(StockIntake).where(StockIntake.id == uuid.UUID(batch_2["id"]))
    )
    b2_db = b2_res.scalar_one_or_none()
    assert b2_db is not None
    assert float(b2_db.remaining_quantity) == 8.0

    # Check InventoryItem total current_stock: was 15, deducted 7 -> should be 8
    inv_res = await db_session.execute(
        select(InventoryItem).where(InventoryItem.id == uuid.UUID(inv_item_id))
    )
    inv_db = inv_res.scalar_one_or_none()
    assert inv_db is not None
    assert float(inv_db.current_stock) == 8.0

    # Check StockLedger entries for exchange order
    ledger_res = await db_session.execute(
        select(StockLedger).where(StockLedger.reference_order_id == exc_order_id)
    )
    ledgers = ledger_res.scalars().all()
    assert len(ledgers) == 2
    b1_ledger = next(l for l in ledgers if l.intake_id == b1_db.id)
    assert float(b1_ledger.quantity_change) == -5.0
    assert float(b1_ledger.batch_balance) == 0.0

    b2_ledger = next(l for l in ledgers if l.intake_id == b2_db.id)
    assert float(b2_ledger.quantity_change) == -2.0
    assert float(b2_ledger.batch_balance) == 8.0


@pytest.mark.asyncio
async def test_exchange_inventory_deduction_single_line_rollover(client: AsyncClient, db_session):
    """
    Verify that if a single exchange item exceeds the selected oldest lot's capacity,
    backend inventory service automatically rolls over the excess to newer batches in FIFO order.
    """
    from app.models.inventory_item import InventoryItem
    from app.models.stock_intake import StockIntake
    from app.models.stock_ledger import StockLedger

    outlet = await create_test_outlet(db_session, slug="exc-roll-outlet", name="Exchange Rollover Outlet")
    admin = await create_test_user(db_session, outlet, email="admin_roll@test.com", role=RoleEnum.OUTLET_ADMIN)
    await db_session.commit()
    admin_auth_headers = get_auth_headers(admin, outlet)

    # 1. Onboard with Batch 1 (Stock = 3)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=admin_auth_headers,
        json={
            "barcode": "890777666555",
            "name": "Almonds",
            "category": "Dry Fruits",
            "unit": "piece",
            "initial_stock": 3,
            "cost_per_unit": 80.0,
            "selling_price": 100.0,
            "batch_number": "ALM-LOT-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=admin_auth_headers)
    alm_menu = next(m for m in menu_res.json() if m["name"] == "Almonds")
    inv_item_id = alm_menu["inventory_item_id"]
    batch_1_id = alm_menu["active_batches"][0]["id"]

    # 2. Inward Batch 2 (Stock = 7)
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=admin_auth_headers,
        json={
            "item_id": inv_item_id,
            "quantity": 7,
            "unit_cost": 85.0,
            "retail_price": 110.0,
            "batch_number": "ALM-LOT-02",
        },
    )
    assert intake_res.status_code in (200, 201)

    menu_res2 = await client.get("/api/admin/menu-items", headers=admin_auth_headers)
    alm_menu2 = next(m for m in menu_res2.json() if m["name"] == "Almonds")
    batch_2 = alm_menu2["active_batches"][1]

    # 3. Exchange 5 items in a single line with Batch 1 (which only has 3)
    # Backend should draw 3 from Batch 1 and 2 from Batch 2!
    return_payload = {
        "order_id": None,
        "customer_name": "Kavita",
        "customer_phone": "9998887776",
        "return_items": [
            {
                "menu_item_id": None,
                "item_name": "Old Damaged Box",
                "quantity": 1.0,
                "unit_price": 600.0,
                "reason": "DEFECTIVE_PRODUCT",
            }
        ],
        "exchange_items": [
            {
                "menu_item_id": str(alm_menu2["id"]),
                "selected_batch_id": batch_1_id,
                "item_name": "Almonds",
                "quantity": 5.0,
                "unit_price": 100.0,
                "selected_unit": "piece",
            }
        ],
        "refund_payment_method": "CASH",
        "notes": "Exchange with single line overflow",
    }

    ret_res = await client.post(
        "/api/billing/returns",
        json=return_payload,
        headers=admin_auth_headers,
    )
    assert ret_res.status_code == 200, f"Return failed: {ret_res.text}"
    ret_data = ret_res.json()
    exc_order_id = uuid.UUID(ret_data["exchange_order_id"])

    # Verify Batch 1 was depleted to 0
    b1_res = await db_session.execute(
        select(StockIntake).where(StockIntake.id == uuid.UUID(batch_1_id))
    )
    b1_db = b1_res.scalar_one_or_none()
    assert float(b1_db.remaining_quantity) == 0.0

    # Verify Batch 2 was depleted from 7 to 5 (excess 2 drawn)
    b2_res = await db_session.execute(
        select(StockIntake).where(StockIntake.id == uuid.UUID(batch_2["id"]))
    )
    b2_db = b2_res.scalar_one_or_none()
    assert float(b2_db.remaining_quantity) == 5.0

    # Verify InventoryItem current stock is 10 - 5 = 5
    inv_res = await db_session.execute(
        select(InventoryItem).where(InventoryItem.id == uuid.UUID(inv_item_id))
    )
    inv_db = inv_res.scalar_one_or_none()
    assert float(inv_db.current_stock) == 5.0

    # Verify StockLedger has 2 deduction entries
    ledger_res = await db_session.execute(
        select(StockLedger).where(StockLedger.reference_order_id == exc_order_id)
    )
    ledgers = ledger_res.scalars().all()
    assert len(ledgers) == 2
    b1_led = next(l for l in ledgers if l.intake_id == b1_db.id)
    assert float(b1_led.quantity_change) == -3.0
    b2_led = next(l for l in ledgers if l.intake_id == b2_db.id)
    assert float(b2_led.quantity_change) == -2.0


