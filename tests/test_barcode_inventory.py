"""
Integration tests for Barcode Scanner Inventory, Batch Tracking, and Wastage/Write-Off workflows.
"""

import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PaymentModeEnum, RoleEnum
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_barcode_lookup_not_found(client: AsyncClient, db_session: AsyncSession):
    """Scan lookup for unknown barcode returns found=False without error."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart", name="Scan Mart")
    admin = await create_test_user(db_session, outlet, email="admin@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    resp = await client.get("/api/admin/inventory/barcode/999888777666", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["found"] is False
    assert data["barcode"] == "999888777666"
    assert data["item"] is None


@pytest.mark.asyncio
async def test_first_time_scan_onboard(client: AsyncClient, db_session: AsyncSession):
    """First-time scan: Staff tags new barcode, saves item, initial batch, and selling price."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart-2", name="Scan Mart 2")
    admin = await create_test_user(db_session, outlet, email="admin2@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    payload = {
        "barcode": "8901262010015",
        "name": "Amul Pure Ghee 1L Pouch",
        "category": "Dairy",
        "unit": "pcs",
        "initial_stock": 10.0,
        "cost_per_unit": 520.0,
        "selling_price": 590.0,
        "batch_number": "BAT-2026-GHEE-01",
        "supplier_name": "Gujarat Co-op Milk Federation",
    }
    resp = await client.post("/api/admin/inventory/scan-onboard", json=payload, headers=headers)
    assert resp.status_code == 201
    item = resp.json()
    assert item["barcode"] == "8901262010015"
    assert item["name"] == "Amul Pure Ghee 1L Pouch"
    assert float(item["current_stock"]) == 10.0

    # Verify lookup finds it now
    lookup_resp = await client.get("/api/admin/inventory/barcode/8901262010015", headers=headers)
    assert lookup_resp.status_code == 200
    assert lookup_resp.json()["found"] is True
    assert lookup_resp.json()["item"]["id"] == item["id"]


@pytest.mark.asyncio
async def test_subsequent_scan_increment(client: AsyncClient, db_session: AsyncSession):
    """Subsequent scan: Instantly increments item count (+1 or batch) with unique lot generation."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart-3", name="Scan Mart 3")
    admin = await create_test_user(db_session, outlet, email="admin3@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # First onboard
    await client.post(
        "/api/admin/inventory/scan-onboard",
        json={"barcode": "8901262010015", "name": "Amul Ghee", "initial_stock": 10.0, "cost_per_unit": 500.0},
        headers=headers,
    )

    # Subsequent scan +5
    resp = await client.post(
        "/api/admin/inventory/scan-increment",
        json={"barcode": "8901262010015", "quantity": 5.0},
        headers=headers,
    )
    assert resp.status_code == 200
    item = resp.json()
    assert float(item["current_stock"]) == 15.0  # 10 + 5


@pytest.mark.asyncio
async def test_batches_listing_and_wastage_log(client: AsyncClient, db_session: AsyncSession):
    """Verify batch lots listing and test logging wastage/loss against an item."""
    outlet = await create_test_outlet(db_session, slug="test-scan-mart-4", name="Scan Mart 4")
    admin = await create_test_user(db_session, outlet, email="admin4@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # Onboard item
    onboard_resp = await client.post(
        "/api/admin/inventory/scan-onboard",
        json={
            "barcode": "8901262010015",
            "name": "Amul Ghee",
            "initial_stock": 15.0,
            "cost_per_unit": 520.0,
            "batch_number": "BAT-GHEE-44",
        },
        headers=headers,
    )
    item_id = onboard_resp.json()["id"]

    # List batches
    batches_resp = await client.get("/api/admin/inventory/batches", headers=headers)
    assert batches_resp.status_code == 200
    batches = batches_resp.json()
    assert len(batches) >= 1

    # Log Wastage (e.g. 2 pcs damaged in transit)
    waste_payload = {
        "item_id": item_id,
        "quantity": 2.0,
        "reason": "DAMAGED_TRANSIT",
        "notes": "Pouch leaked during delivery unloading",
    }
    waste_resp = await client.post("/api/admin/inventory/wastage", json=waste_payload, headers=headers)
    assert waste_resp.status_code == 200
    waste_data = waste_resp.json()
    assert waste_data["success"] is True
    assert float(waste_data["quantity_wasted"]) == 2.0
    assert float(waste_data["new_current_stock"]) == 13.0  # 15 - 2
    assert float(waste_data["estimated_loss_amount"]) == 1040.0  # 2 * 520 cost

    # Verify Stock Ledger has MANUAL_ADJUSTMENT entry
    ledger_resp = await client.get("/api/admin/inventory/ledger", headers=headers)
    assert ledger_resp.status_code == 200
    ledger_items = ledger_resp.json()["items"]
    waste_entry = next((e for e in ledger_items if e["item_id"] == item_id and e["change_type"] in ["MANUAL_ADJUSTMENT", "manual_adjustment"]), None)
    assert waste_entry is not None
    assert float(waste_entry["quantity_change"]) == -2.0

    # Log Wastage against SPECIFIC batch (3 pcs from BAT-GHEE-44)
    batch_waste_payload = {
        "item_id": item_id,
        "quantity": 3.0,
        "reason": "SPOILED_EXPIRED",
        "notes": "Specific batch spoiled",
        "batch_number": "BAT-GHEE-44",
    }
    batch_waste_resp = await client.post("/api/admin/inventory/wastage", json=batch_waste_payload, headers=headers)
    assert batch_waste_resp.status_code == 200
    batch_waste_data = batch_waste_resp.json()
    assert batch_waste_data["success"] is True
    assert float(batch_waste_data["quantity_wasted"]) == 3.0
    assert float(batch_waste_data["new_current_stock"]) == 10.0  # 13 - 3

    # Check batch remaining stock updated
    batches_resp2 = await client.get("/api/admin/inventory/batches", headers=headers)
    batch_ghee = next(b for b in batches_resp2.json() if b["batch_number"] == "BAT-GHEE-44")
    assert float(batch_ghee["remaining_quantity"]) == 10.0

    # Verify ledger entry records intake_id
    ledger_resp2 = await client.get("/api/admin/inventory/ledger", headers=headers)
    ledger_items2 = ledger_resp2.json()["items"]
    specific_waste_entry = next((e for e in ledger_items2 if e["id"] == batch_waste_data["ledger_entry_id"]), None)
    assert specific_waste_entry is not None
    assert specific_waste_entry["intake_id"] == batch_ghee["id"]

    # Verify error when wastage quantity exceeds batch stock
    excess_resp = await client.post(
        "/api/admin/inventory/wastage",
        json={
            "item_id": item_id,
            "quantity": 50.0,
            "reason": "SPOILED_EXPIRED",
            "batch_number": "BAT-GHEE-44",
        },
        headers=headers,
    )
    assert excess_resp.status_code == 400
    assert "exceeds" in excess_resp.json()["detail"].lower()

    # Verify error when batch does not exist
    invalid_batch_resp = await client.post(
        "/api/admin/inventory/wastage",
        json={
            "item_id": item_id,
            "quantity": 1.0,
            "reason": "SPOILED_EXPIRED",
            "batch_number": "NON_EXISTENT_BATCH_999",
        },
        headers=headers,
    )
    assert invalid_batch_resp.status_code == 404


@pytest.mark.asyncio
async def test_direct_1to1_stock_deduction_on_checkout(client: AsyncClient, db_session: AsyncSession):
    """Onboarding a direct item creates a linked MenuItem; checkout automatically deducts 1:1 stock without recipe."""
    outlet = await create_test_outlet(db_session, slug="test-direct-stock-mart", name="Direct Stock Mart", payment_mode=PaymentModeEnum.PAY_AT_COUNTER)
    admin = await create_test_user(db_session, outlet, email="directadmin@stockmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Onboard inventory item with selling_price -> Auto creates MenuItem with inventory_item_id
    onboard_payload = {
        "barcode": "8901234567890",
        "name": "Organic Potato 1kg",
        "category": "Produce",
        "unit": "kg",
        "initial_stock": 50.0,
        "cost_per_unit": 30.0,
        "selling_price": 45.0,
    }
    onboard_resp = await client.post("/api/admin/inventory/scan-onboard", json=onboard_payload, headers=headers)
    assert onboard_resp.status_code == 201
    inv_item = onboard_resp.json()

    # 2. Get created menu item
    menu_resp = await client.get("/api/admin/menu-items", headers=headers)
    assert menu_resp.status_code == 200
    menu_items = menu_resp.json()
    created_menu_item = next(m for m in menu_items if m["barcode"] == "8901234567890")
    assert created_menu_item["inventory_item_id"] == inv_item["id"]

    # 3. Create and pay an order for 2.0 units
    session_resp = await client.post(
        "/api/sessions/start",
        json={"outlet_slug": outlet.slug, "basket_number": "12", "customer_name": "Rohan"},
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json()["session_id"]

    checkout_resp = await client.post(
        "/api/orders/checkout",
        json={
            "session_id": session_id,
            "basket_number": "12",
            "customer_name": "Rohan",
            "outlet_slug": outlet.slug,
            "items": [{"menu_item_id": created_menu_item["id"], "quantity": 2}],
        },
    )
    assert checkout_resp.status_code == 201
    order_id = checkout_resp.json()["order_id"]

    # Settle payment to trigger auto deduction
    pay_resp = await client.post(
        f"/api/billing/bills/{order_id}/mark-paid",
        json={"payment_method": "CASH"},
        headers=headers,
    )
    assert pay_resp.status_code == 200

    # 4. Verify inventory stock was reduced by 2.0 units (50.0 - 2.0 = 48.0)
    inv_check = await client.get(f"/api/admin/inventory/barcode/{inv_item['barcode']}", headers=headers)
    assert inv_check.status_code == 200
    updated_inv = inv_check.json()["item"]
    assert float(updated_inv["current_stock"]) == 48.0


@pytest.mark.asyncio
async def test_alternate_unit_stock_deduction_and_return(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that selling in an alternate unit (e.g. 1 pair = 2 pieces) correctly
    deducts 2 pieces from primary inventory stock and batches, and customer returns
    restore 2 pieces back into primary stock and batches.
    """
    outlet = await create_test_outlet(db_session, slug="test-alt-unit-mart", name="Alt Unit Mart", payment_mode=PaymentModeEnum.PAY_AT_COUNTER)
    admin = await create_test_user(db_session, outlet, email="altadmin@unitmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Onboard item with base unit "piece" and alternate unit "pair" with conversion factor 2
    onboard_payload = {
        "barcode": "8909999000111",
        "name": "Cotton Socks",
        "category": "Apparel",
        "unit": "piece",
        "initial_stock": 50.0,
        "cost_per_unit": 20.0,
        "selling_price": 40.0,
        "alternate_units": [
            {"unit_label": "pair", "conversion_factor": 2.0}
        ],
    }
    onboard_resp = await client.post("/api/admin/inventory/scan-onboard", json=onboard_payload, headers=headers)
    assert onboard_resp.status_code == 201
    inv_item = onboard_resp.json()
    assert float(inv_item["current_stock"]) == 50.0

    # 2. Get created menu item
    menu_resp = await client.get("/api/admin/menu-items", headers=headers)
    assert menu_resp.status_code == 200
    menu_items = menu_resp.json()
    created_menu_item = next(m for m in menu_items if m["barcode"] == "8909999000111")

    # 3. Create a manual bill for 1 PAIR (quantity=1, selected_unit="pair")
    bill_payload = {
        "customer_name": "Suresh",
        "customer_phone": "9876543210",
        "items": [
            {
                "menu_item_id": created_menu_item["id"],
                "quantity": 1.0,
                "selected_unit": "pair",
                "unit_price": 20.0,  # 40 / 2
            }
        ],
    }
    bill_resp = await client.post("/api/billing/bills", json=bill_payload, headers=headers)
    assert bill_resp.status_code == 200
    order_data = bill_resp.json()
    order_id = order_data["id"]
    order_item_id = order_data["items"][0]["id"]
    # Verify MRP and unit_price are properly resolved with factor 2
    assert float(order_data["items"][0]["unit_price"]) == 20.0
    assert float(order_data["items"][0]["mrp"]) == 20.0

    # 4. Mark bill paid -> triggers process_order_auto_deduction
    pay_resp = await client.post(
        f"/api/billing/bills/{order_id}/mark-paid",
        json={"payment_method": "CASH"},
        headers=headers,
    )
    assert pay_resp.status_code == 200

    # 5. Verify stock dropped by 0.5 pieces (50.0 - 0.5 = 49.5), NOT by 1.0!
    inv_check = await client.get(f"/api/admin/inventory/barcode/{inv_item['barcode']}", headers=headers)
    assert inv_check.status_code == 200
    updated_inv = inv_check.json()["item"]
    assert float(updated_inv["current_stock"]) == 49.5

    # Check batch remaining quantity also dropped by 0.5
    batches_resp = await client.get("/api/admin/inventory/batches", headers=headers)
    assert batches_resp.status_code == 200
    batches = batches_resp.json()
    item_batch = next(b for b in batches if b["item_id"] == inv_item["id"])
    assert float(item_batch["remaining_quantity"]) == 49.5

    # Check StockLedger records -0.5
    ledger_resp = await client.get("/api/admin/inventory/ledger", headers=headers)
    assert ledger_resp.status_code == 200
    ledger_items = ledger_resp.json()["items"]
    deduct_entry = next(
        e for e in ledger_items
        if e["reference_order_id"] == order_id and e["change_type"] in ["AUTO_DEDUCTION", "auto_deduction"]
    )
    assert float(deduct_entry["quantity_change"]) == -0.5
    assert float(deduct_entry["resulting_stock"]) == 49.5

    # 6. Customer returns the 1 pair
    return_payload = {
        "order_id": order_id,
        "customer_name": "Suresh",
        "customer_phone": "9876543210",
        "return_items": [
            {
                "order_item_id": order_item_id,
                "menu_item_id": created_menu_item["id"],
                "quantity": 1.0,
                "selected_unit": "pair",
                "unit_price": 20.0,
                "reason": "Size did not fit",
            }
        ],
        "refund_payment_method": "CASH",
    }
    ret_resp = await client.post("/api/billing/returns", json=return_payload, headers=headers)
    assert ret_resp.status_code == 200

    # 7. Verify stock restored by 0.5 pieces back to 50.0
    inv_check2 = await client.get(f"/api/admin/inventory/barcode/{inv_item['barcode']}", headers=headers)
    assert inv_check2.status_code == 200
    restored_inv = inv_check2.json()["item"]
    assert float(restored_inv["current_stock"]) == 50.0

    # Verify batch restored back to 50.0
    batches_resp2 = await client.get("/api/admin/inventory/batches", headers=headers)
    item_batch2 = next(b for b in batches_resp2.json() if b["item_id"] == inv_item["id"])
    assert float(item_batch2["remaining_quantity"]) == 50.0


@pytest.mark.asyncio
async def test_alternate_unit_price_and_mrp_resolution(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that MRP, retail price, special offer price, and wholesale price all
    scale accurately with the alternate unit conversion factor.
    """
    outlet = await create_test_outlet(db_session, slug="test-alt-pricing-mart", name="Alt Pricing Mart")
    admin = await create_test_user(db_session, outlet, email="pricingadmin@unitmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Create a category
    cat_resp = await client.post("/api/admin/categories", json={"name": "Dry Fruits"}, headers=headers)
    assert cat_resp.status_code == 201
    cat_id = cat_resp.json()["id"]

    # 2. Create MenuItem with MRP=50, Price=40, OfferPrice=35 (is_on_offer=True), WholesalePrice=30
    # and alternate unit: 1 pair = 2 pieces
    menu_payload = {
        "category_id": cat_id,
        "name": "Fresh Coconut",
        "price": 40.0,
        "mrp": 50.0,
        "is_on_offer": True,
        "offer_price": 35.0,
        "wholesale_price": 30.0,
        "unit_label": "piece",
        "alternate_units": [
            {"unit_label": "pair", "conversion_factor": 2.0}
        ],
    }
    menu_create_resp = await client.post("/api/admin/menu-items", json=menu_payload, headers=headers)
    assert menu_create_resp.status_code == 201
    item = menu_create_resp.json()

    # 3. Bill 1 pair with Retail / Special Offer pricing (unit_price omitted to test server resolution)
    # Base: offer_price = 35.0, mrp = 50.0
    # For 1 pair (factor=2): Rate should be 35 / 2 = 17.5, MRP should be 50 / 2 = 25.0
    bill_payload = {
        "customer_name": "Ramesh",
        "items": [
            {
                "menu_item_id": item["id"],
                "quantity": 1.0,
                "selected_unit": "pair",
            }
        ],
    }
    b1_resp = await client.post("/api/billing/bills", json=bill_payload, headers=headers)
    assert b1_resp.status_code == 200
    b1_item = b1_resp.json()["items"][0]
    assert float(b1_item["unit_price"]) == 17.5  # 35 / 2
    assert float(b1_item["mrp"]) == 25.0        # 50 / 2

    # 4. Bill 1 pair with WHOLESALE pricing
    # Base: wholesale_price = 30.0, mrp = 50.0
    # For 1 pair (factor=2): Rate should be 30 / 2 = 15.0, MRP should be 50 / 2 = 25.0
    b2_payload = {
        "customer_name": "Wholesale Buyer",
        "items": [
            {
                "menu_item_id": item["id"],
                "quantity": 2.0,
                "selected_unit": "pair",
                "pricing_type": "WHOLESALE",
            }
        ],
    }
    b2_resp = await client.post("/api/billing/bills", json=b2_payload, headers=headers)
    assert b2_resp.status_code == 200
    b2_item = b2_resp.json()["items"][0]
    assert float(b2_item["unit_price"]) == 15.0  # 30 / 2
    assert float(b2_item["mrp"]) == 25.0        # 50 / 2
    assert float(b2_item["line_total"]) == 30.0  # 15 * 2 pairs

    # 5. Bill where client passed base unmultiplied MRP (e.g. mrp=50 while unit_price=17.5 for 1 pair)
    # Server should auto-scale base MRP to 25.0 so MRP is never less than unit_price
    b3_payload = {
        "customer_name": "Test Client",
        "items": [
            {
                "menu_item_id": item["id"],
                "quantity": 1.0,
                "selected_unit": "pair",
                "unit_price": 17.5,
                "mrp": 50.0,  # Unmultiplied base MRP passed by client
            }
        ],
    }
    b3_resp = await client.post("/api/billing/bills", json=b3_payload, headers=headers)
    assert b3_resp.status_code == 200
    b3_item = b3_resp.json()["items"][0]
    assert float(b3_item["unit_price"]) == 17.5
    assert float(b3_item["mrp"]) == 25.0  # Scaled by 2!


@pytest.mark.asyncio
async def test_scan_onboard_with_timezone_aware_datetimes(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that scan-onboard and batch metadata updates cleanly accept
    ISO timestamp strings with timezone offsets (e.g. from browsers or external systems)
    without triggering asyncpg offset-naive vs offset-aware datetime errors.
    """
    outlet = await create_test_outlet(db_session, slug="tz-test-outlet", name="TZ Test Outlet")
    user = await create_test_user(db_session, outlet, email="tz_admin@test.com")
    await db_session.commit()
    headers = get_auth_headers(user, outlet)

    # Timezone-aware ISO string (ending with +00:00 or Z)
    aware_exp = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()

    onboard_payload = {
        "barcode": "8909998887771",
        "name": "Timezone Safe Item",
        "category": "Packaged Goods",
        "unit": "pcs",
        "initial_stock": 50.0,
        "cost_per_unit": 25.0,
        "selling_price": 35.0,
        "batch_number": "TZ-BATCH-001",
        "expiry_date": aware_exp,
    }

    res = await client.post("/api/admin/inventory/scan-onboard", json=onboard_payload, headers=headers)
    assert res.status_code == 201, f"Failed: {res.text}"
    data = res.json()
    assert data["name"] == "Timezone Safe Item"

    # Verify batch was created and intake_date is properly recorded
    batches_res = await client.get("/api/admin/inventory/batches", headers=headers)
    assert batches_res.status_code == 200
    batches = batches_res.json()
    batch = next(b for b in batches if b["batch_number"] == "TZ-BATCH-001")
    assert batch["expiry_date"] is not None
    assert float(batch["remaining_quantity"]) == 50.0

    # Also test updating batch with timezone-aware intake_date and expiry_date
    new_aware_intake = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    new_aware_exp = (datetime.now(timezone.utc) + timedelta(days=40)).isoformat()
    patch_res = await client.patch(
        f"/api/admin/inventory/batches/{batch['id']}",
        json={
            "intake_date": new_aware_intake,
            "expiry_date": new_aware_exp,
            "notes": "Updated with aware datetimes",
        },
        headers=headers,
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert patch_data["status"] == "success"


@pytest.mark.asyncio
async def test_scan_onboard_associate_existing_item_with_new_barcode(client: AsyncClient, db_session: AsyncSession):
    """Verify that scan-onboard updates barcode when associating a new scanned barcode with an existing item."""
    outlet = await create_test_outlet(db_session, slug="test-scan-associate", name="Scan Associate Outlet")
    admin = await create_test_user(db_session, outlet, email="admin_assoc@scanmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Onboard initial item with old barcode
    res1 = await client.post(
        "/api/admin/inventory/scan-onboard",
        json={
            "barcode": "111111111111",
            "name": "Nuggets 700g",
            "category": "Frozen",
            "unit": "pcs",
            "initial_stock": 10.0,
            "cost_per_unit": 100.0,
            "selling_price": 150.0,
        },
        headers=headers,
    )
    assert res1.status_code == 201
    item1 = res1.json()
    assert item1["barcode"] == "111111111111"
    item_id = item1["id"]

    # 2. User scans a new barcode "999999999999" and associates with existing item
    res2 = await client.post(
        "/api/admin/inventory/scan-onboard",
        json={
            "item_id": item_id,
            "barcode": "999999999999",
            "name": "Nuggets 700g",
            "category": "Frozen",
            "unit": "pcs",
            "initial_stock": 5.0,
            "cost_per_unit": 100.0,
            "selling_price": 150.0,
        },
        headers=headers,
    )
    assert res2.status_code == 201
    item2 = res2.json()
    # The barcode should now be updated to the new barcode!
    assert item2["barcode"] == "999999999999"
    assert float(item2["current_stock"]) == 15.0

    # 3. Subsequent scan lookup for the new barcode should find this item
    lookup_res = await client.get("/api/admin/inventory/barcode/999999999999", headers=headers)
    assert lookup_res.status_code == 200
    assert lookup_res.json()["found"] is True
    assert lookup_res.json()["item"]["id"] == item_id


@pytest.mark.asyncio
async def test_list_batches_search_query(client: AsyncClient, db_session: AsyncSession):
    """Verify that /api/admin/inventory/batches?search=... searches all batches by batch number, item name, or barcode."""
    outlet = await create_test_outlet(db_session, slug="test-batch-search", name="Batch Search Outlet")
    admin = await create_test_user(db_session, outlet, email="admin_search@batchmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Onboard Spinach
    res1 = await client.post(
        "/api/admin/inventory/scan-onboard",
        json={
            "barcode": "8901234567801",
            "name": "Fresh Organic Spinach",
            "category": "Vegetables",
            "unit": "kg",
            "initial_stock": 10.0,
            "cost_per_unit": 20.0,
            "selling_price": 30.0,
            "batch_number": "BAT-SPINACH-01",
        },
        headers=headers,
    )
    assert res1.status_code == 201

    # 2. Onboard Apples
    res2 = await client.post(
        "/api/admin/inventory/scan-onboard",
        json={
            "barcode": "8901234567802",
            "name": "Fresh Red Apples",
            "category": "Fruits",
            "unit": "kg",
            "initial_stock": 15.0,
            "cost_per_unit": 80.0,
            "selling_price": 120.0,
            "batch_number": "BAT-APPLE-01",
        },
        headers=headers,
    )
    assert res2.status_code == 201

    # 3. Get all batches (no search)
    all_res = await client.get("/api/admin/inventory/batches", headers=headers)
    assert all_res.status_code == 200
    assert len(all_res.json()) == 2

    # 4. Search by item name "Spinach"
    spinach_res = await client.get("/api/admin/inventory/batches?search=Spinach", headers=headers)
    assert spinach_res.status_code == 200
    spinach_batches = spinach_res.json()
    assert len(spinach_batches) == 1
    assert spinach_batches[0]["batch_number"] == "BAT-SPINACH-01"

    # 5. Search by batch number "BAT-APPLE"
    apple_res = await client.get("/api/admin/inventory/batches?search=BAT-APPLE", headers=headers)
    assert apple_res.status_code == 200
    apple_batches = apple_res.json()
    assert len(apple_batches) == 1
    assert apple_batches[0]["batch_number"] == "BAT-APPLE-01"

    # 6. Search by barcode "8901234567801"
    barcode_res = await client.get("/api/admin/inventory/batches?search=8901234567801", headers=headers)
    assert barcode_res.status_code == 200
    assert len(barcode_res.json()) == 1
    assert barcode_res.json()[0]["item_name"] == "Fresh Organic Spinach"

    # 7. Search nonexistent
    empty_res = await client.get("/api/admin/inventory/batches?search=XYZNOTFOUND", headers=headers)
    assert empty_res.status_code == 200
    assert len(empty_res.json()) == 0
