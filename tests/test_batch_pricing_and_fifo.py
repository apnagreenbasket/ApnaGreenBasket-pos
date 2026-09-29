"""
Integration tests for inventory batch pricing alignment, FIFO drawdown,
price rollover on batch depletion, POS batch selection, overselling with negative batch generation,
and inward reconciliation.
"""

import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from httpx import AsyncClient
from app.core.shift_utils import IST
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_oldest_batch_pricing_and_automatic_rollover(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. First batch sets menu item price.
    2. Second batch does NOT overwrite menu item price while first batch has stock.
    3. Exhausting the first batch rolls over the menu item price to the second batch.
    """
    outlet = await create_test_outlet(db_session, slug="fifo-pricing-outlet", name="FIFO Pricing Outlet")
    user = await create_test_user(db_session, outlet, email="admin_fifo@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard product with Batch 1 (Stock = 10, Price = 50, MRP = 60)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8901111222001",
            "name": "Fresh Alphonso Mangoes",
            "category": "Fruits",
            "unit": "kg",
            "initial_stock": 10,
            "cost_per_unit": 35.0,
            "selling_price": 50.0,
            "mrp": 60.0,
            "batch_number": "BAT-MANGO-01",
        },
    )
    assert onboard_res.status_code == 201

    # Verify linked menu item has price 50, mrp 60
    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert menu_res.status_code == 200
    menu_items = menu_res.json()
    mango_item = next(m for m in menu_items if m["name"] == "Fresh Alphonso Mangoes")
    assert float(mango_item["price"]) == 50.0
    assert float(mango_item["mrp"]) == 60.0
    assert len(mango_item["active_batches"]) == 1
    assert mango_item["active_batches"][0]["batch_number"] == "BAT-MANGO-01"
    assert mango_item["active_batches"][0]["is_oldest"] is True

    # 2. Inward Batch 2 with higher price (Stock = 10, Price = 75, MRP = 90)
    inv_item_id = mango_item["inventory_item_id"]
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": inv_item_id,
            "quantity": 10.0,
            "unit_cost": 55.0,
            "batch_number": "BAT-MANGO-02",
            "notes": "New crop arrival",
            "retail_price": 75.0,
            "mrp": 90.0,
        },
    )
    assert intake_res.status_code == 201

    # 3. CRUCIAL CHECK: Menu Item price MUST still be 50.0 (from oldest batch BAT-MANGO-01), NOT 75.0!
    menu_res2 = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert menu_res2.status_code == 200
    mango_item2 = next(m for m in menu_res2.json() if m["name"] == "Fresh Alphonso Mangoes")
    assert float(mango_item2["price"]) == 50.0, "Oldest batch price must be preserved while stock > 0"
    assert float(mango_item2["mrp"]) == 60.0
    assert len(mango_item2["active_batches"]) == 2
    assert mango_item2["active_batches"][0]["batch_number"] == "BAT-MANGO-01"
    assert mango_item2["active_batches"][0]["is_oldest"] is True
    assert mango_item2["active_batches"][1]["batch_number"] == "BAT-MANGO-02"
    assert mango_item2["active_batches"][1]["is_oldest"] is False

    # 4. Sell all 10 units of Batch 1 via POS Billing
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "WALK-IN-01",
            "customer_name": "Test Customer",
            "items": [
                {
                    "menu_item_id": mango_item2["id"],
                    "quantity": 10.0,
                    "unit_price": 50.0,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()

    # Pay the bill (triggers inventory auto-deduction)
    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # 5. Verify Batch 1 is now exhausted (0 remaining), and menu item price rolled over to Batch 2 (75.0)
    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    assert batches_res.status_code == 200
    all_batches = batches_res.json()
    b1 = next(b for b in all_batches if b["batch_number"] == "BAT-MANGO-01")
    b2 = next(b for b in all_batches if b["batch_number"] == "BAT-MANGO-02")
    assert float(b1["remaining_quantity"]) == 0.0
    assert float(b2["remaining_quantity"]) == 10.0

    menu_res3 = await client.get("/api/admin/menu-items", headers=auth_headers)
    mango_item3 = next(m for m in menu_res3.json() if m["name"] == "Fresh Alphonso Mangoes")
    assert float(mango_item3["price"]) == 75.0, "Menu item price must automatically roll over to next active batch"
    assert float(mango_item3["mrp"]) == 90.0
    assert len(mango_item3["active_batches"]) == 1
    assert mango_item3["active_batches"][0]["batch_number"] == "BAT-MANGO-02"
    assert mango_item3["active_batches"][0]["is_oldest"] is True


@pytest.mark.asyncio
async def test_explicit_batch_selection_and_intelligent_oversell(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. Cashier explicitly picks a newer batch (bypassing FIFO).
    2. Cashier oversells beyond batch stock -> auto-creates negative batch with date suffix and ledger audit.
    3. Reconciling the oversold batch via Adjust Stock adds positive stock.
    """
    outlet = await create_test_outlet(db_session, slug="oversell-outlet", name="Oversell Outlet")
    user = await create_test_user(db_session, outlet, email="admin_ov@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard product with Batch 1 (Stock = 5)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8903333444002",
            "name": "Organic Almond Milk 1L",
            "category": "Dairy",
            "unit": "piece",
            "initial_stock": 5,
            "cost_per_unit": 120.0,
            "selling_price": 160.0,
            "batch_number": "BAT-ALMOND-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    almond_item = next(m for m in menu_res.json() if m["name"] == "Organic Almond Milk 1L")

    # Inward Batch 2 (Stock = 10, Price = 175)
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": almond_item["inventory_item_id"],
            "quantity": 10.0,
            "unit_cost": 130.0,
            "batch_number": "BAT-ALMOND-02",
            "retail_price": 175.0,
            "mrp": 190.0,
        },
    )
    assert intake_res.status_code == 201
    batch_2_id = intake_res.json()["id"]

    # 2. Bill 3 units explicitly selecting Batch 2 (bypassing Batch 1)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-BATCH-PICK",
            "items": [
                {
                    "menu_item_id": almond_item["id"],
                    "quantity": 3.0,
                    "unit_price": 175.0,
                    "selected_batch_id": batch_2_id,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill1 = bill_res.json()
    assert bill1["items"][0]["selected_batch_id"] == batch_2_id

    # Settle bill
    pay_res = await client.post(
        f"/api/billing/bills/{bill1['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # Verify Batch 1 was untouched (still 5 pcs) and Batch 2 was deducted (10 -> 7 pcs)
    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    all_b = batches_res.json()
    ab1 = next(b for b in all_b if b["batch_number"] == "BAT-ALMOND-01")
    ab2 = next(b for b in all_b if b["batch_number"] == "BAT-ALMOND-02")
    assert float(ab1["remaining_quantity"]) == 5.0, "Batch 1 must remain untouched when Batch 2 is selected"
    assert float(ab2["remaining_quantity"]) == 7.0, "Batch 2 must be deducted by 3 units"

    # 3. OVERSELL TEST:
    # Now sell 12 units targeting Batch 2 (available is 7 pcs -> deficit is 5 pcs) with allow_oversell
    bill_ov_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-OVERSELL-01",
            "items": [
                {
                    "menu_item_id": almond_item["id"],
                    "quantity": 12.0,
                    "unit_price": 175.0,
                    "selected_batch_id": batch_2_id,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill_ov_res.status_code == 200
    bill_ov = bill_ov_res.json()

    # Pay bill -> triggers oversell logic in process_order_auto_deduction
    pay_ov_res = await client.post(
        f"/api/billing/bills/{bill_ov['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_ov_res.status_code == 200

    # 4. Verify Batch 2 was exhausted to 0 and a new negative oversold batch was created
    batches_res2 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    all_b2 = batches_res2.json()
    ab2_after = next(b for b in all_b2 if b["batch_number"] == "BAT-ALMOND-02")
    assert float(ab2_after["remaining_quantity"]) == 0.0

    # Find the oversold batch
    today_str = datetime.now(IST).strftime("%d%m%Y")
    oversold_batch = next((b for b in all_b2 if "-OV-" in b["batch_number"]), None)
    assert oversold_batch is not None, "An oversold deficit batch must be created"
    assert today_str in oversold_batch["batch_number"], "Oversold batch number must contain creation date"
    assert float(oversold_batch["remaining_quantity"]) == -5.0, "Deficit must be exactly -5"
    assert oversold_batch["status"] == "OVERSOLD"

    # 5. Verify Stock Movement Ledger records
    ledger_res = await client.get(
        f"/api/admin/inventory/ledger?item_id={almond_item['inventory_item_id']}",
        headers=auth_headers,
    )
    assert ledger_res.status_code == 200
    ledger_entries = ledger_res.json()["items"]
    # Check that ledger recorded the -7 deduction from Batch 2 and -5 OVERSOLD from the oversold batch
    deductions = [e for e in ledger_entries if float(e["quantity_change"]) < 0]
    assert any(float(e["quantity_change"]) == -7.0 for e in deductions)
    assert any(e["change_type"] == "OVERSOLD" and float(e["quantity_change"]) == -5.0 for e in deductions)

    # 6. INWARD RECONCILIATION TEST:
    # Later, reconcile this negative batch by inwarding +20 units via Adjust Stock (INTAKE_CORRECTION)
    reconcile_res = await client.post(
        f"/api/admin/inventory/batches/{oversold_batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "INTAKE_CORRECTION",
            "quantity_delta": 20.0,
            "new_total_quantity": 20.0,
            "new_unit_cost": 130.0,
            "total_billed": 2600.0,
            "reason": "INWARD_CORRECTION",
            "notes": "Physical shipment arrived, reconciling oversold deficit",
        },
    )
    assert reconcile_res.status_code == 200

    # Verify batch is now positive: -5 + 20 = 15 units remaining, and gross is 20
    batches_res3 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    reconciled_b = next(b for b in batches_res3.json() if b["id"] == oversold_batch["id"])
    assert float(reconciled_b["quantity"]) == 20.0, "Batch gross quantity must retain 20 units inwarded"
    assert float(reconciled_b["remaining_quantity"]) == 15.0
    assert reconciled_b["status"] == "ACTIVE"


@pytest.mark.asyncio
async def test_split_across_batches_billing(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify Suggestion A:
    Cashier splits an order exceeding Batch 1's stock across two separate cart line items,
    one drawing from Batch 1 and the other drawing from Batch 2.
    """
    outlet = await create_test_outlet(db_session, slug="split-batches-outlet", name="Split Batches Outlet")
    user = await create_test_user(db_session, outlet, email="admin_split@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard product with Batch 1 (Stock = 5 @ 100.0)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8905555666003",
            "name": "Organic Honey 500g",
            "category": "Groceries",
            "unit": "jar",
            "initial_stock": 5,
            "cost_per_unit": 70.0,
            "selling_price": 100.0,
            "batch_number": "BAT-HONEY-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    honey_item = next(m for m in menu_res.json() if m["name"] == "Organic Honey 500g")

    # Inward Batch 2 (Stock = 10 @ 120.0)
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": honey_item["inventory_item_id"],
            "quantity": 10.0,
            "unit_cost": 85.0,
            "batch_number": "BAT-HONEY-02",
            "retail_price": 120.0,
            "mrp": 140.0,
        },
    )
    assert intake_res.status_code == 201
    batch_2_id = intake_res.json()["id"]

    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    batch_1_id = next(b["id"] for b in batches_res.json() if b["batch_number"] == "BAT-HONEY-01")

    # 2. Customer wants 8 jars total. Cashier splits:
    # Line 1: 5 jars from Batch 1 @ 100.0
    # Line 2: 3 jars from Batch 2 @ 120.0
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-SPLIT-BATCH",
            "items": [
                {
                    "menu_item_id": honey_item["id"],
                    "quantity": 5.0,
                    "unit_price": 100.0,
                    "selected_batch_id": batch_1_id,
                },
                {
                    "menu_item_id": honey_item["id"],
                    "quantity": 3.0,
                    "unit_price": 120.0,
                    "selected_batch_id": batch_2_id,
                },
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()
    assert len(bill["items"]) == 2
    assert bill["items"][0]["selected_batch_id"] == batch_1_id
    assert bill["items"][1]["selected_batch_id"] == batch_2_id

    # Settle bill
    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # 3. Verify stock deductions
    batches_res2 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    all_b = batches_res2.json()
    hb1 = next(b for b in all_b if b["batch_number"] == "BAT-HONEY-01")
    hb2 = next(b for b in all_b if b["batch_number"] == "BAT-HONEY-02")
    assert float(hb1["remaining_quantity"]) == 0.0, "Batch 1 must be exhausted (5 - 5 = 0)"
    assert float(hb2["remaining_quantity"]) == 7.0, "Batch 2 must have 7 remaining (10 - 3 = 7)"

    # 4. Verify menu price rolled over to Batch 2's price (120.0) since Batch 1 is 0
    menu_res2 = await client.get("/api/admin/menu-items", headers=auth_headers)
    honey_item_updated = next(m for m in menu_res2.json() if m["name"] == "Organic Honey 500g")
    assert float(honey_item_updated["price"]) == 120.0
    assert float(honey_item_updated["mrp"]) == 140.0


@pytest.mark.asyncio
async def test_multi_batch_oversell_consolidation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    When a bill contains multiple lines for an item where batches are exhausted and
    oversold deficit occurs, the backend:
    1. Exhausts in-stock batches to 0 cleanly.
    2. Consolidates the deficit into a single negative oversold batch without duplicates.
    3. Logs AUTO_DEDUCTION for positive batches and OVERSOLD for the deficit batch.
    """
    outlet = await create_test_outlet(db_session, slug="ov-consol-outlet", name="Oversell Consolidation Outlet")
    user = await create_test_user(db_session, outlet, email="admin_ov_consol@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard product with Batch 1 (Stock = 5 @ 15.0)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8908888999001",
            "name": "Margin Product",
            "category": "Snacks",
            "unit": "pcs",
            "initial_stock": 5,
            "cost_per_unit": 10.0,
            "selling_price": 15.0,
            "mrp": 17.0,
            "batch_number": "BAT-MARGIN-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    margin_item = next(m for m in menu_res.json() if m["name"] == "Margin Product")

    # Inward Batch 2 (Stock = 10 @ 15.0)
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": margin_item["inventory_item_id"],
            "quantity": 10.0,
            "unit_cost": 10.0,
            "batch_number": "BAT-MARGIN-02",
            "retail_price": 15.0,
            "mrp": 17.0,
        },
    )
    assert intake_res.status_code == 201
    batch_2_id = intake_res.json()["id"]

    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    batch_1_id = next(b["id"] for b in batches_res.json() if b["batch_number"] == "BAT-MARGIN-01")

    # Customer wants 25 pcs total (Stock is 5 + 10 = 15, deficit is 10 pcs).
    # Line 1: 5 pcs from Batch 1 (exhausted)
    # Line 2: 20 pcs from Batch 2 (10 from stock + 10 oversold)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-OV-CONSOL",
            "items": [
                {
                    "menu_item_id": margin_item["id"],
                    "quantity": 5.0,
                    "unit_price": 15.0,
                    "selected_batch_id": batch_1_id,
                },
                {
                    "menu_item_id": margin_item["id"],
                    "quantity": 20.0,
                    "unit_price": 15.0,
                    "selected_batch_id": batch_2_id,
                },
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()

    # Settle bill
    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # Verify inventory state
    batches_res2 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    all_b = batches_res2.json()

    mb1 = next(b for b in all_b if b["batch_number"] == "BAT-MARGIN-01")
    mb2 = next(b for b in all_b if b["batch_number"] == "BAT-MARGIN-02")
    assert float(mb1["remaining_quantity"]) == 0.0
    assert float(mb2["remaining_quantity"]) == 0.0

    # Exactly one negative oversold batch should be created
    ov_batches = [b for b in all_b if float(b["remaining_quantity"]) < 0]
    assert len(ov_batches) == 1, "Must consolidate deficit into exactly 1 oversold batch"
    assert float(ov_batches[0]["remaining_quantity"]) == -10.0

    # Verify stock ledgers
    ledger_res = await client.get("/api/admin/inventory/ledger", headers=auth_headers)
    assert ledger_res.status_code == 200
    ledgers = ledger_res.json()["items"]

    auto_deductions = [l for l in ledgers if l["change_type"] == "AUTO_DEDUCTION"]
    oversolds = [l for l in ledgers if l["change_type"] == "OVERSOLD"]

    assert len(auto_deductions) == 2  # -5 for Batch 1, -10 for Batch 2
    assert len(oversolds) == 1  # -10 for Oversold Batch
    assert float(oversolds[0]["quantity_change"]) == -10.0


@pytest.mark.asyncio
async def test_older_batch_rollover_and_stock_ledger_balances(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. Cashier attempts to sell 5 units of older Batch 1 (which only has 2 units).
    2. Batch 1 is capped at its available stock (2 units), leaving remaining_quantity = 0.
    3. The remaining 3 units roll forward into Batch 2, leaving remaining_quantity = 7.
    4. No negative oversold batch is created because store had sufficient stock in newer batch.
    5. Stock ledger entries accurately record batch_number, batch_balance, and resulting_stock.
    """
    outlet = await create_test_outlet(db_session, slug="older-batch-rollover", name="Older Batch Outlet")
    user = await create_test_user(db_session, outlet, email="admin_rollover@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard product with Batch 1 (Stock = 2)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8905555666001",
            "name": "Kashmiri Walnuts 500g",
            "category": "Dry Fruits",
            "unit": "packet",
            "initial_stock": 2,
            "cost_per_unit": 200.0,
            "selling_price": 280.0,
            "batch_number": "BAT-WALNUT-01",
        },
    )
    assert onboard_res.status_code == 201

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    walnut_item = next(m for m in menu_res.json() if m["name"] == "Kashmiri Walnuts 500g")

    # Inward Batch 2 (Stock = 10, Price = 300)
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": walnut_item["inventory_item_id"],
            "quantity": 10.0,
            "unit_cost": 220.0,
            "batch_number": "BAT-WALNUT-02",
            "retail_price": 300.0,
            "mrp": 350.0,
        },
    )
    assert intake_res.status_code == 201
    batch_1_id = walnut_item["active_batches"][0]["id"]
    batch_2_id = intake_res.json()["id"]

    # 2. Bill 5 units explicitly selecting older Batch 1 (stock = 2)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "POS-ROLLOVER-01",
            "items": [
                {
                    "menu_item_id": walnut_item["id"],
                    "quantity": 5.0,
                    "unit_price": 280.0,
                    "selected_batch_id": batch_1_id,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill = bill_res.json()

    # Settle bill -> triggers process_order_auto_deduction
    pay_res = await client.post(
        f"/api/billing/bills/{bill['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # 3. Check batch balances
    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    assert batches_res.status_code == 200
    batches = batches_res.json()

    wb1 = next(b for b in batches if b["batch_number"] == "BAT-WALNUT-01")
    wb2 = next(b for b in batches if b["batch_number"] == "BAT-WALNUT-02")
    assert float(wb1["remaining_quantity"]) == 0.0, "Batch 1 must be capped at 2 and reduced to 0"
    assert float(wb2["remaining_quantity"]) == 7.0, "Batch 2 must absorb the 3 rollover units (10 - 3 = 7)"

    # No negative batches should exist
    ov_batches = [b for b in batches if float(b["remaining_quantity"]) < 0]
    assert len(ov_batches) == 0, "No negative oversold batch should be created when store has stock"

    # 4. Check Stock Movement Audit Ledger
    ledger_res = await client.get("/api/admin/inventory/ledger", headers=auth_headers)
    assert ledger_res.status_code == 200
    ledger_items = ledger_res.json()["items"]

    deductions = [l for l in ledger_items if l["change_type"] == "AUTO_DEDUCTION"]
    assert len(deductions) == 2, "Must log 2 AUTO_DEDUCTION entries (Batch 1 cap + Batch 2 rollover)"

    ded_b1 = next(l for l in deductions if l["batch_number"] == "BAT-WALNUT-01")
    ded_b2 = next(l for l in deductions if l["batch_number"] == "BAT-WALNUT-02")

    assert float(ded_b1["quantity_change"]) == -2.0
    assert float(ded_b1["batch_balance"]) == 0.0, "Batch 1 balance in ledger must be 0"

    assert float(ded_b2["quantity_change"]) == -3.0
    assert float(ded_b2["batch_balance"]) == 7.0, "Batch 2 balance in ledger must be 7"

    # Storewide resulting stock in the latest deduction
    assert float(ded_b2["resulting_stock"]) == 7.0, "Storewide resulting stock must be 7"


@pytest.mark.asyncio
async def test_inward_intake_consumes_oversold_deficit_and_settles_negative_batch(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. Overselling consecutive sales accumulates into a single clean negative batch (e.g. BAT-OV-...).
    2. When new inward batch of 25 pcs @ ₹14.00 arrives:
       - Real inward quantity is preserved (initial_quantity = 25.0).
       - It consumes the 10 pcs deficit, leaving remaining_quantity = 15.0.
       - The negative deficit batch is settled to 0.0.
       - Ledger records INTAKE (+25), AUTO_DEDUCTION (-10 backorder fulfillment), and RESTOCK (+10 settlement).
    """
    outlet = await create_test_outlet(db_session, slug="deficit-consume", name="Deficit Consumption Outlet")
    user = await create_test_user(db_session, outlet, email="admin_deficit@test.com")
    auth_headers = get_auth_headers(user, outlet)

    # 1. Create inventory item and linked menu item
    inv_res = await client.post(
        "/api/admin/inventory/items",
        headers=auth_headers,
        json={
            "name": "Fresh Organic Milk",
            "unit": "packet",
            "cost_per_unit": 12.00,
            "retail_price": 20.00,
            "allow_oversell": True,
        },
    )
    assert inv_res.status_code == 201
    inv_item = inv_res.json()

    cat_res = await client.post(
        "/api/admin/categories",
        headers=auth_headers,
        json={"name": "Dairy"},
    )
    cat_id = cat_res.json()["id"]

    menu_res = await client.post(
        "/api/admin/menu-items",
        headers=auth_headers,
        json={
            "name": "Fresh Organic Milk",
            "category_id": cat_id,
            "inventory_item_id": inv_item["id"],
            "price": 20.00,
            "allow_oversell": True,
        },
    )
    menu_item = menu_res.json()

    # 2. Sale 1: Oversell 7 units
    bill1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "SALE-1",
            "items": [
                {
                    "menu_item_id": menu_item["id"],
                    "item_name": "Fresh Organic Milk",
                    "quantity": 7,
                    "unit_price": 20.00,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill1_res.status_code == 200
    await client.post(
        f"/api/billing/bills/{bill1_res.json()['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )

    # Sale 2: Oversell another 3 units
    bill2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "SALE-2",
            "items": [
                {
                    "menu_item_id": menu_item["id"],
                    "item_name": "Fresh Organic Milk",
                    "quantity": 3,
                    "unit_price": 20.00,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill2_res.status_code == 200
    await client.post(
        f"/api/billing/bills/{bill2_res.json()['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )

    # Verify inventory state: exactly ONE negative deficit batch with -10.0
    b_res1 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    batches_pre = b_res1.json()
    ov_batches = [b for b in batches_pre if float(b["remaining_quantity"]) < 0]
    assert len(ov_batches) == 1, "Must consolidate consecutive oversells into exactly 1 negative batch"
    def_batch = ov_batches[0]
    assert float(def_batch["remaining_quantity"]) == -10.0
    assert def_batch["batch_number"].startswith("BAT-OV-")
    assert "-OV-" not in def_batch["batch_number"][7:], "Batch number must not have chained -OV-"

    # 3. New Inward Shipment arrives: 25 units @ ₹14.00
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": inv_item["id"],
            "batch_number": "LOT-AMUL-99",
            "quantity": 25.0,
            "unit_cost": 14.00,
            "retail_price": 20.00,
        },
    )
    assert intake_res.status_code == 201

    # 4. Verify post-intake batch balances
    b_res2 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    batches_post = b_res2.json()

    new_b = next(b for b in batches_post if b["batch_number"] == "LOT-AMUL-99")
    settled_b = next(b for b in batches_post if b["id"] == def_batch["id"])

    # New batch must show real initial quantity (25), with remaining reduced by deficit (25 - 10 = 15)
    assert float(new_b["initial_quantity"]) == 25.0, "Initial inward quantity must remain exact (25.0)"
    assert float(new_b["remaining_quantity"]) == 15.0, "Remaining quantity must be 15.0 (25 - 10 pre-sold)"

    # Deficit batch must be settled to 0.0
    assert float(settled_b["remaining_quantity"]) == 0.0, "Deficit batch must be settled to 0.0"

    # Total store stock must be exactly 15.0
    items_res = await client.get("/api/admin/inventory/items", headers=auth_headers)
    cur_item = next(it for it in items_res.json() if it["id"] == inv_item["id"])
    assert float(cur_item["current_stock"]) == 15.0


@pytest.mark.asyncio
async def test_allow_oversell_disabled_blocks_sales(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that when allow_oversell = False:
    Attempting to oversell when stock is insufficient raises HTTP 400.
    """
    outlet = await create_test_outlet(db_session, slug="block-oversell", name="Block Oversell Outlet")
    user = await create_test_user(db_session, outlet, email="admin_block@test.com")
    auth_headers = get_auth_headers(user, outlet)

    # Create inventory item with allow_oversell = False
    inv_res = await client.post(
        "/api/admin/inventory/items",
        headers=auth_headers,
        json={
            "name": "Strict Caviar",
            "unit": "jar",
            "cost_per_unit": 500.00,
            "retail_price": 800.00,
            "allow_oversell": False,
        },
    )
    assert inv_res.status_code == 201
    inv_item = inv_res.json()
    assert inv_item["allow_oversell"] is False

    cat_res = await client.post(
        "/api/admin/categories",
        headers=auth_headers,
        json={"name": "Delicacies"},
    )
    cat_id = cat_res.json()["id"]

    menu_res = await client.post(
        "/api/admin/menu-items",
        headers=auth_headers,
        json={
            "name": "Strict Caviar",
            "category_id": cat_id,
            "inventory_item_id": inv_item["id"],
            "price": 800.00,
            "allow_oversell": False,
        },
    )
    menu_item = menu_res.json()
    assert menu_item["allow_oversell"] is False

    # Attempt to checkout 1 unit when stock is 0
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "STRICT-1",
            "items": [
                {
                    "menu_item_id": menu_item["id"],
                    "item_name": "Strict Caviar",
                    "quantity": 1,
                    "unit_price": 800.00,
                }
            ],
        },
    )
    assert bill_res.status_code == 400
    assert "does not allow overselling" in bill_res.json()["detail"]


@pytest.mark.asyncio
async def test_oversold_profit_margin_reconciled_against_new_inward_batch_cost(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. Overselling profit margin is accurately reconciled against the future new batch's unit cost
       relative to the retail price at which it got sold.
    2. Batch 1: 5 units @ ₹50 cost, ₹100 retail.
    3. Sale: 8 units @ ₹100 retail = ₹800 revenue (5 from Batch 1, 3 oversold).
    4. New Batch 2: arrives @ ₹60 unit cost.
    5. Reconciled Bill COGS = 5*50 + 3*60 = 250 + 180 = ₹430.
    6. Reconciled Bill Profit = ₹800 - ₹430 = ₹370 (margin: 46.25%).
    """
    outlet = await create_test_outlet(db_session, slug="margin-recon", name="Margin Reconciliation Outlet")
    user = await create_test_user(db_session, outlet, email="admin_margin@test.com")
    auth_headers = get_auth_headers(user, outlet)

    # 1. Create inventory item and menu item
    inv_res = await client.post(
        "/api/admin/inventory/items",
        headers=auth_headers,
        json={
            "name": "Gourmet Coffee Beans",
            "unit": "pack",
            "cost_per_unit": 50.00,
            "retail_price": 100.00,
            "allow_oversell": True,
        },
    )
    assert inv_res.status_code == 201
    inv_item = inv_res.json()

    cat_res = await client.post(
        "/api/admin/categories",
        headers=auth_headers,
        json={"name": "Beverages"},
    )
    cat_id = cat_res.json()["id"]

    menu_res = await client.post(
        "/api/admin/menu-items",
        headers=auth_headers,
        json={
            "name": "Gourmet Coffee Beans",
            "category_id": cat_id,
            "inventory_item_id": inv_item["id"],
            "price": 100.00,
            "allow_oversell": True,
        },
    )
    menu_item = menu_res.json()

    # 2. Intake Batch 1: 5 units @ ₹50.00
    intake1_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": inv_item["id"],
            "batch_number": "COFFEE-LOT-1",
            "quantity": 5.0,
            "unit_cost": 50.00,
            "retail_price": 100.00,
        },
    )
    assert intake1_res.status_code == 201
    b1_id = intake1_res.json()["id"]

    # 3. Sell 8 units (5 from Batch 1, 3 oversold)
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "SALE-COFFEE",
            "items": [
                {
                    "menu_item_id": menu_item["id"],
                    "item_name": "Gourmet Coffee Beans",
                    "quantity": 5.0,
                    "unit_price": 100.00,
                    "selected_batch_id": b1_id,
                },
                {
                    "menu_item_id": menu_item["id"],
                    "item_name": "Gourmet Coffee Beans",
                    "quantity": 3.0,
                    "unit_price": 100.00,
                    "allow_oversell": True,
                },
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]

    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # 4. Future Batch 2 arrives: 10 units @ ₹60.00 unit cost
    intake2_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": inv_item["id"],
            "batch_number": "COFFEE-LOT-2",
            "quantity": 10.0,
            "unit_cost": 60.00,
            "retail_price": 100.00,
        },
    )
    assert intake2_res.status_code == 201

    # 5. Query Bill Profit Analytics
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0).isoformat()
    today_end = (datetime.utcnow() + timedelta(days=1)).isoformat()
    profit_res = await client.get(
        f"/api/analytics/bill-profit?from_date={today_start}&to_date={today_end}",
        headers=auth_headers,
    )
    assert profit_res.status_code == 200
    profit_data = profit_res.json()

    target_bill = next((b for b in profit_data["bills"] if b["order_id"] == bill_id), None)
    assert target_bill is not None, "Bill must be present in Bill Profit report"
    assert target_bill["total_amount"] == 800.0
    # Expected COGS: 5 * 50 + 3 * 60 = 250 + 180 = 430
    assert target_bill["estimated_cogs"] == 430.0, f"Expected COGS 430.0, got {target_bill['estimated_cogs']}"
    # Expected Profit: 800 - 430 = 370
    assert target_bill["estimated_profit"] == 370.0, f"Expected Profit 370.0, got {target_bill['estimated_profit']}"
    # Expected Margin %: (370 / 800) * 100 = 46.25%
    assert target_bill["margin_pct"] == 46.25, f"Expected Margin 46.25%, got {target_bill['margin_pct']}"


@pytest.mark.asyncio
async def test_oversold_deficit_absorption_ledger_notes_and_settled_status(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. Overselling creates an oversold batch (remaining_quantity < 0).
    2. Inwarding stock of matching quantity absorbs deficit without phantom resulting_stock jump.
    3. Ledger entries contain clear explanatory notes.
    4. Settled backorder batch reports status='SETTLED' and preserves historical pre-sold quantity.
    """
    outlet = await create_test_outlet(db_session, slug="backorder-notes-outlet", name="Backorder Notes Outlet")
    user = await create_test_user(db_session, outlet, email="admin_backorder@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with 0 stock
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8909999111222",
            "name": "Backorder Test Mango",
            "category": "Fruits",
            "unit": "kg",
            "initial_stock": 0,
            "cost_per_unit": 50.0,
            "selling_price": 60.0,
            "mrp": 70.0,
        },
    )
    assert onboard_res.status_code == 201
    item_id = onboard_res.json()["id"]

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert menu_res.status_code == 200
    menu_item = next(m for m in menu_res.json() if m["name"] == "Backorder Test Mango")

    # 2. Oversell 1 unit via POS order
    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "SALE-BACKORDER",
            "items": [
                {
                    "menu_item_id": menu_item["id"],
                    "item_name": "Backorder Test Mango",
                    "quantity": 1.0,
                    "unit_price": 60.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_id = bill_res.json()["id"]

    pay_res = await client.post(
        f"/api/billing/bills/{bill_id}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_res.status_code == 200

    # Verify batch status is OVERSOLD
    b_res = await client.get(f"/api/admin/inventory/batches?item_id={item_id}", headers=auth_headers)
    assert b_res.status_code == 200
    batches = b_res.json()
    ov_batch = next(b for b in batches if "-OV-" in b["batch_number"])
    assert ov_batch["status"] == "OVERSOLD"
    assert float(ov_batch["remaining_quantity"]) == -1.0
    assert float(ov_batch["quantity"]) == -1.0

    # 3. Inward 1 unit of stock (intake)
    intake_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8909999111222",
            "name": "Backorder Test Mango",
            "category": "Fruits",
            "unit": "kg",
            "initial_stock": 1.0,
            "cost_per_unit": 50.0,
            "selling_price": 60.0,
            "mrp": 70.0,
        },
    )
    assert intake_res.status_code == 201

    # 4. Check Batch History
    b_res2 = await client.get(f"/api/admin/inventory/batches?item_id={item_id}", headers=auth_headers)
    assert b_res2.status_code == 200
    batches2 = b_res2.json()
    settled_ov_batch = next(b for b in batches2 if "-OV-" in b["batch_number"])
    # Crucial assertions:
    assert settled_ov_batch["status"] == "SETTLED"
    assert float(settled_ov_batch["remaining_quantity"]) == 0.0
    # Preserves historical pre-sold quantity
    assert float(settled_ov_batch["quantity"]) == -1.0

    # 5. Check Movement Ledger
    ledger_res = await client.get(f"/api/admin/inventory/ledger?item_id={item_id}&page_size=50", headers=auth_headers)
    assert ledger_res.status_code == 200
    ledger_entries = ledger_res.json()["items"]

    # INTAKE ledger entry resulting_stock must be 0.000 (not jumping to 1.000)
    intake_entry = next(e for e in ledger_entries if e["change_type"] == "INTAKE")
    assert float(intake_entry["resulting_stock"]) == 0.0, f"Expected resulting_stock 0.0, got {intake_entry['resulting_stock']}"

    # Auto deduction entry has explanatory notes
    auto_ded_entry = next(e for e in ledger_entries if e["change_type"] == "AUTO_DEDUCTION")
    assert auto_ded_entry["notes"] is not None
    assert "Fulfilled pre-sold backorder" in auto_ded_entry["notes"]

    # Restock entry has explanatory notes
    restock_entry = next(e for e in ledger_entries if e["change_type"] == "RESTOCK")
    assert restock_entry["notes"] is not None
    assert "Settled backorder deficit" in restock_entry["notes"]




