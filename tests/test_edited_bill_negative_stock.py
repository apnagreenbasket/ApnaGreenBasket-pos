"""
Tests for bill editing and replacement inventory management, especially for negative stock / oversold items.
Ensures no double-deductions occur when a bill with negative or positive stock is edited and replaced.
"""

import pytest
from decimal import Decimal
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.stock_ledger import StockLedger
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_edit_bill_with_negative_stock_reverses_and_avoids_double_deduction(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Scenario:
    1. Product 'Mushroom' has 0 stock (allow_oversell=True).
    2. Product 'Banana' has 10 units in stock.
    3. Bill 1 sells:
       - 2 units Mushroom (oversold -> stock becomes -2.0, change_type=OVERSOLD)
       - 1 unit Banana (batch deduction -> stock becomes 9.0, change_type=AUTO_DEDUCTION)
    4. Bill 1 is paid.
    5. User edits Bill 1:
       - Creates Bill 2 replacing Bill 1 (replaces_bill_id = Bill 1).
       - In Bill 2: Mushroom is kept at 2 units, Banana is tweaked to 2 units.
    6. Bill 2 is paid:
       - Bill 1 must be reversed (BOTH Banana AND Mushroom must be restocked!).
       - Bill 2 deducts Mushroom (2 units) and Banana (2 units).
       - Mushroom stock must be EXACTLY -2.0 (NOT -4.0 double deduction!).
       - Banana stock must be EXACTLY 8.0 (10 - 2 = 8, NOT 7.0 double deduction!).
    """
    outlet = await create_test_outlet(
        db_session, slug="edit-bill-stock-outlet", name="Edit Bill Stock Outlet"
    )
    user = await create_test_user(db_session, outlet, email="edit_bill_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard Banana with 10 units in stock
    banana_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8901111222111",
            "name": "Fresh Banana",
            "category": "Fruits",
            "unit": "kg",
            "initial_stock": 10,
            "cost_per_unit": 20.0,
            "selling_price": 40.0,
            "mrp": 50.0,
            "batch_number": "BAT-BANANA-01",
        },
    )
    assert banana_res.status_code == 201
    banana_data = banana_res.json()
    banana_inv_id = banana_data["id"]

    # 2. Onboard Mushroom with 0 stock (allowing oversell)
    mushroom_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8901111222222",
            "name": "Button Mushroom",
            "category": "Vegetables",
            "unit": "kg",
            "initial_stock": 0,
            "cost_per_unit": 60.0,
            "selling_price": 100.0,
            "mrp": 120.0,
            "batch_number": "BAT-MUSH-01",
        },
    )
    assert mushroom_res.status_code == 201
    mushroom_data = mushroom_res.json()
    mushroom_inv_id = mushroom_data["id"]

    # Fetch menu items to get menu_item_id
    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert menu_res.status_code == 200
    menu_items = menu_res.json()
    banana_menu = next(m for m in menu_items if m["name"] == "Fresh Banana")
    mushroom_menu = next(m for m in menu_items if m["name"] == "Button Mushroom")

    # 3. Create Bill 1 with 2 Mushroom and 1 Banana
    bill_1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Test Customer",
            "items": [
                {
                    "menu_item_id": mushroom_menu["id"],
                    "item_name": "Button Mushroom",
                    "quantity": 2.0,
                    "unit_price": 100.0,
                    "allow_oversell": True,
                },
                {
                    "menu_item_id": banana_menu["id"],
                    "item_name": "Fresh Banana",
                    "quantity": 1.0,
                    "unit_price": 40.0,
                    "allow_oversell": True,
                },
            ],
        },
    )
    assert bill_1_res.status_code == 200
    bill_1 = bill_1_res.json()

    # Pay Bill 1
    pay_1_res = await client.post(
        f"/api/billing/bills/{bill_1['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_1_res.status_code == 200

    # Verify inventory after Bill 1: Mushroom should be -2.0, Banana should be 9.0
    inv_items_1 = (await client.get("/api/admin/inventory/items", headers=auth_headers)).json()
    mush_1 = next(i for i in inv_items_1 if i["id"] == mushroom_inv_id)
    ban_1 = next(i for i in inv_items_1 if i["id"] == banana_inv_id)
    assert float(mush_1["current_stock"]) == -2.0
    assert float(ban_1["current_stock"]) == 9.0

    # 4. Now simulate EDITING Bill 1: Create replacement Bill 2 with replaces_bill_id = Bill 1
    # User keeps Mushroom at 2.0, edits Banana to 2.0
    bill_2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Test Customer",
            "replaces_bill_id": bill_1["id"],
            "items": [
                {
                    "menu_item_id": mushroom_menu["id"],
                    "item_name": "Button Mushroom",
                    "quantity": 2.0,
                    "unit_price": 100.0,
                    "allow_oversell": True,
                },
                {
                    "menu_item_id": banana_menu["id"],
                    "item_name": "Fresh Banana",
                    "quantity": 2.0,
                    "unit_price": 40.0,
                    "allow_oversell": True,
                },
            ],
        },
    )
    assert bill_2_res.status_code == 200
    bill_2 = bill_2_res.json()

    # Pay Bill 2 -> triggers reversal of Bill 1, then deduction of Bill 2
    pay_2_res = await client.post(
        f"/api/billing/bills/{bill_2['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay_2_res.status_code == 200

    # 5. Verify inventory after Bill 2 replacement:
    # Mushroom MUST be -2.0 (NOT -4.0!)
    inv_items_2 = (await client.get("/api/admin/inventory/items", headers=auth_headers)).json()
    mush_2 = next(i for i in inv_items_2 if i["id"] == mushroom_inv_id)
    ban_2 = next(i for i in inv_items_2 if i["id"] == banana_inv_id)
    assert float(mush_2["current_stock"]) == -2.0, (
        f"Mushroom stock should be -2.0, but got {mush_2['current_stock']} (double deduction detected!)"
    )

    # Banana had 10 initial, Bill 1 used 1, Bill 2 uses 2 -> Banana stock should be 8.0 (10 - 2 = 8)
    assert float(ban_2["current_stock"]) == 8.0, (
        f"Banana stock should be 8.0, but got {ban_2['current_stock']}"
    )

    # 6. Verify Bill 1 has RESTOCK ledger entries for BOTH Mushroom and Banana
    ledger_mush = (await client.get(f"/api/admin/inventory/ledger?item_id={mushroom_inv_id}", headers=auth_headers)).json()
    mush_entries = ledger_mush["items"]
    restock_mush = [e for e in mush_entries if e["change_type"] == "RESTOCK" and e.get("reference_order_id") == bill_1["id"]]
    assert len(restock_mush) >= 1, "Mushroom must have a RESTOCK entry for reversed Bill 1"
    assert float(restock_mush[0]["quantity_change"]) == 2.0


@pytest.mark.asyncio
async def test_edit_bill_reducing_negative_stock_quantity(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Scenario:
    1. Item with 0 stock sells 3 units (stock drops to -3.0).
    2. Bill is edited to reduce quantity from 3 units to 1 unit.
    3. Replaced bill is paid.
    4. Resulting stock must be -1.0 (reverses 3, deducts 1 -> -1.0), NOT -4.0.
    """
    outlet = await create_test_outlet(
        db_session, slug="edit-reduce-stock-outlet", name="Edit Reduce Stock Outlet"
    )
    user = await create_test_user(db_session, outlet, email="reduce_stock_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8901111222333",
            "name": "Exotic Broccoli",
            "category": "Vegetables",
            "unit": "pcs",
            "initial_stock": 0,
            "cost_per_unit": 50.0,
            "selling_price": 80.0,
            "mrp": 90.0,
            "batch_number": "BAT-BROC-01",
        },
    )
    assert onboard_res.status_code == 201
    broc_data = onboard_res.json()
    broc_inv_id = broc_data["id"]

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    broc_menu = next(m for m in menu_res.json() if m["name"] == "Exotic Broccoli")

    # Bill 1: 3 pcs Broccoli
    bill_1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "items": [
                {
                    "menu_item_id": broc_menu["id"],
                    "item_name": "Exotic Broccoli",
                    "quantity": 3.0,
                    "unit_price": 80.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    bill_1 = bill_1_res.json()
    await client.post(f"/api/billing/bills/{bill_1['id']}/mark-paid", headers=auth_headers, json={"payment_method": "CASH"})

    inv_before = (await client.get("/api/admin/inventory/items", headers=auth_headers)).json()
    broc_1 = next(i for i in inv_before if i["id"] == broc_inv_id)
    assert float(broc_1["current_stock"]) == -3.0

    # Bill 2: Reduces to 1 pcs Broccoli
    bill_2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "replaces_bill_id": bill_1["id"],
            "items": [
                {
                    "menu_item_id": broc_menu["id"],
                    "item_name": "Exotic Broccoli",
                    "quantity": 1.0,
                    "unit_price": 80.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    bill_2 = bill_2_res.json()
    await client.post(f"/api/billing/bills/{bill_2['id']}/mark-paid", headers=auth_headers, json={"payment_method": "CASH"})

    inv_after = (await client.get("/api/admin/inventory/items", headers=auth_headers)).json()
    broc_2 = next(i for i in inv_after if i["id"] == broc_inv_id)
    assert float(broc_2["current_stock"]) == -1.0, (
        f"Broccoli stock should be -1.0 after reducing from 3 to 1, but got {broc_2['current_stock']}"
    )
