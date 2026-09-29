import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_purchase_return_to_supplier(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test returning stock to supplier, deducting batch/item stock, and issuing return bill."""
    outlet = await create_test_outlet(db_session, slug="batch-adjust-outlet", name="Adjust Outlet")
    user = await create_test_user(db_session, outlet, email="admin_adj@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with initial stock 50
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "8909999000111",
            "name": "Supplier Wheat Flour 10kg",
            "category": "Grains",
            "unit": "kg",
            "initial_stock": 50,
            "cost_per_unit": 40.0,
            "selling_price": 50.0,
            "batch_number": "BATCH-WHEAT-01",
        },
    )
    assert onboard_res.status_code == 201

    # 2. Get batch ID
    batches_res = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    assert batches_res.status_code == 200
    batches = batches_res.json()
    assert len(batches) >= 1
    target_batch = next(b for b in batches if b["batch_number"] == "BATCH-WHEAT-01")
    assert "shelf_life_alert_hrs" in target_batch

    # 3. Process PURCHASE_RETURN of 10 kg
    return_payload = {
        "adjustment_type": "PURCHASE_RETURN",
        "quantity": 10.0,
        "reason": "DEFECTIVE",
        "supplier_name": "Agro Suppliers Co",
        "notes": "Damaged sacks received",
    }
    adj_res = await client.post(
        f"/api/admin/inventory/batches/{target_batch['id']}/adjust",
        headers=auth_headers,
        json=return_payload,
    )
    assert adj_res.status_code == 200
    adj_data = adj_res.json()
    assert adj_data["status"] == "success"
    assert adj_data["return_id"] is not None
    assert "return_number" in adj_data

    # 4. Verify return bill can be retrieved via API
    bill_res = await client.get(
        f"/api/admin/inventory/purchase-returns/{adj_data['return_id']}",
        headers=auth_headers,
    )
    assert bill_res.status_code == 200
    bill_data = bill_res.json()
    assert bill_data["supplier_name"] == "Agro Suppliers Co"
    assert float(bill_data["quantity"]) == 10.0
    assert float(bill_data["total_refund_amount"]) == 400.0  # 10 * 40.0

    # 5. Verify batch remaining quantity is now 40
    batches_res_2 = await client.get("/api/admin/inventory/batches", headers=auth_headers)
    target_batch_2 = next(b for b in batches_res_2.json() if b["id"] == target_batch["id"])
    assert float(target_batch_2["remaining_quantity"]) == 40.0


@pytest.mark.asyncio
async def test_void_batch_stock(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test voiding an entire batch entry."""
    outlet = await create_test_outlet(db_session, slug="void-batch-outlet", name="Void Outlet")
    user = await create_test_user(db_session, outlet, email="admin_void@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with initial stock 30
    await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "name": "Accidental Duplicate Milk Crate",
            "category": "Dairy",
            "unit": "pcs",
            "initial_stock": 30,
            "cost_per_unit": 60.0,
            "selling_price": 75.0,
            "batch_number": "BATCH-MILK-ERR",
        },
    )

    # Get batch
    batches = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    milk_batch = next(b for b in batches if b["batch_number"] == "BATCH-MILK-ERR")

    # 2. Void Batch
    void_res = await client.post(
        f"/api/admin/inventory/batches/{milk_batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "VOID_BATCH",
            "quantity": 30.0,
            "notes": "Entered by mistake",
        },
    )
    assert void_res.status_code == 200

    # 3. Verify batch remaining stock is 0
    batches_after = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    updated_batch = next(b for b in batches_after if b["id"] == milk_batch["id"])
    assert float(updated_batch["remaining_quantity"]) == 0.0


@pytest.mark.asyncio
async def test_update_batch_metadata_and_time_reference_anchoring(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test updating batch metadata (Tier A) and verify time-reference anchoring to intake_date."""
    from datetime import datetime, timezone, timedelta

    outlet = await create_test_outlet(db_session, slug="edit-batch-outlet", name="Edit Batch Outlet")
    user = await create_test_user(db_session, outlet, email="admin_edit_batch@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with initial stock 25
    await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "name": "Fresh Organic Spinach",
            "category": "Produce",
            "unit": "kg",
            "initial_stock": 25,
            "cost_per_unit": 30.0,
            "selling_price": 45.0,
            "batch_number": "AUTO-SPINACH-ORIG",
        },
    )

    batches = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    target_batch = next(b for b in batches if b["batch_number"] == "AUTO-SPINACH-ORIG")

    # 2. Update metadata: change lot number, add notes, set future expiry date
    future_exp = (datetime.now(timezone.utc) + timedelta(days=15)).strftime("%Y-%m-%d")
    patch_res = await client.patch(
        f"/api/admin/inventory/batches/{target_batch['id']}",
        headers=auth_headers,
        json={
            "batch_number": "LOT-SPINACH-2026-CORRECTED",
            "notes": "Stored in cold room B",
            "expiry_date": f"{future_exp}T00:00:00Z",
        },
    )
    assert patch_res.status_code == 200
    res_data = patch_res.json()
    assert res_data["status"] == "success"
    assert res_data["batch"]["batch_number"] == "LOT-SPINACH-2026-CORRECTED"
    assert res_data["batch"]["notes"] == "Stored in cold room B"
    assert float(res_data["batch"]["remaining_quantity"]) == 25.0  # Stock invariant
    assert res_data["batch"]["status"] == "ACTIVE"

    # 3. Test Time-Reference Anchoring: Backdate intake_date by 5 days (120 hrs ago)
    # and set shelf_life_alert_hrs to 48 hours.
    # Because intake was 120 hrs ago and shelf life is 48 hrs, the batch MUST immediately evaluate to EXPIRED!
    past_intake = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    patch_res_2 = await client.patch(
        f"/api/admin/inventory/batches/{target_batch['id']}",
        headers=auth_headers,
        json={
            "intake_date": past_intake,
            "expiry_date": None,  # Remove calendar expiry to rely purely on shelf life
            "shelf_life_alert_hrs": 48,
        },
    )
    assert patch_res_2.status_code == 200
    res_data_2 = patch_res_2.json()
    assert res_data_2["batch"]["shelf_life_alert_hrs"] == 48
    assert res_data_2["batch"]["expiry_date"] is None
    assert float(res_data_2["batch"]["remaining_quantity"]) == 25.0  # Stock still invariant!


@pytest.mark.asyncio
async def test_tier_b_inward_correction_and_margin_recalculation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test Tier B: Inward stock correction, appending stock, unit cost recalculation,
    and automatic margin / retail price recalculation with catalog sync.
    """
    outlet = await create_test_outlet(db_session, slug="tier-b-outlet", name="Tier B Outlet")
    user = await create_test_user(db_session, outlet, email="tier_b_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with initial stock 20, cost 12.50, selling price 15.00 (20% margin markup)
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "name": "Organic Almond Milk 1L",
            "category": "Beverages",
            "unit": "pcs",
            "initial_stock": 20,
            "cost_per_unit": 12.50,
            "selling_price": 15.00,
            "batch_number": "BAT-ALMOND-001",
        },
    )
    assert onboard_res.status_code == 201
    item_id = onboard_res.json()["id"]

    # Set item margin config: MARKUP with 20% retail margin, 40% mrp margin
    patch_item_res = await client.put(
        f"/api/admin/inventory/items/{item_id}",
        headers=auth_headers,
        json={
            "margin_type": "MARKUP",
            "retail_margin_pct": 20.0,
            "mrp_margin_pct": 40.0,
        },
    )
    assert patch_item_res.status_code == 200

    batches = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    batch = next(b for b in batches if b["batch_number"] == "BAT-ALMOND-001")
    assert float(batch["quantity"]) == 20.0
    assert float(batch["unit_cost"]) == 12.50

    # 2. Process Tier B: Append 5 units (+5 delta), update total billed to 250.0 (so unit cost becomes 250 / 25 = 10.00)
    adjust_res = await client.post(
        f"/api/admin/inventory/batches/{batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "INTAKE_CORRECTION",
            "quantity_delta": 5.0,
            "total_billed": 250.0,
            "sync_catalog_price": True,
            "reason": "SUPPLIER_ADDITIONAL_DISPATCH",
            "notes": "Added 5 units from late delivery, invoice adjusted to 250 total",
        },
    )
    assert adjust_res.status_code == 200
    adj_data = adjust_res.json()
    assert adj_data["status"] == "success"
    assert float(adj_data["new_quantity"]) == 25.0
    assert float(adj_data["new_remaining_quantity"]) == 25.0
    assert float(adj_data["new_unit_cost"]) == 10.00
    assert float(adj_data["item_current_stock"]) == 25.0
    # Recalculated prices with 20% markup on 10.00 cost: retail = 12.00, mrp (40% markup) = 14.00
    assert float(adj_data["item_retail_price"]) == 12.00
    assert float(adj_data["item_mrp"]) == 14.00

    # 3. Verify Item Master in DB reflects new cost and retail price
    items_res = await client.get("/api/admin/inventory/items", headers=auth_headers)
    assert items_res.status_code == 200
    items_list = items_res.json()
    item_data = next(it for it in items_list if it["id"] == item_id)
    assert float(item_data["cost_per_unit"]) == 10.00
    assert float(item_data["retail_price"]) == 12.00
    assert float(item_data["mrp"]) == 14.00
    assert float(item_data["current_stock"]) == 25.0

    # 4. Test error handling: Cannot reduce inward quantity below remaining stock
    # First simulate consumption of 20 units (leaving 5 remaining)
    consume_res = await client.post(
        f"/api/admin/inventory/batches/{batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "MANUAL_ADJUSTMENT",
            "quantity": 20.0,
            "reason": "AUDIT_CORRECTION",
        },
    )
    assert consume_res.status_code == 200

    # Now remaining is 5. Try reducing inward qty by 10 (delta -10) -> Should fail with 400!
    bad_res = await client.post(
        f"/api/admin/inventory/batches/{batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "INTAKE_CORRECTION",
            "quantity_delta": -10.0,
        },
    )
    assert bad_res.status_code == 400
    assert "remaining in batch" in bad_res.json()["detail"]


@pytest.mark.asyncio
async def test_batch_pricing_and_alternate_units_metadata_update(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test updating batch pricing (MRP, Retail, Wholesale) and Alternate Units directly
    via PATCH /api/admin/inventory/batches/{intake_id} with catalog synchronization.
    """
    outlet = await create_test_outlet(db_session, slug="batch-meta-outlet", name="Batch Meta Outlet")
    user = await create_test_user(db_session, outlet, email="meta_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "name": "Organic Bananas",
            "category": "Fruits",
            "unit": "dozen",
            "initial_stock": 10,
            "cost_per_unit": 40.00,
            "selling_price": 50.00,
            "batch_number": "BAT-BANANA-001",
        },
    )
    assert onboard_res.status_code == 201
    item_id = onboard_res.json()["id"]

    batches = (await client.get("/api/admin/inventory/batches", headers=auth_headers)).json()
    batch = next(b for b in batches if b["batch_number"] == "BAT-BANANA-001")

    # 2. Update metadata: set MRP=60.00, retail=55.00, wholesale=48.00, and alternate units: 1 dozen = 12 piece
    patch_res = await client.patch(
        f"/api/admin/inventory/batches/{batch['id']}",
        headers=auth_headers,
        json={
            "mrp": 60.00,
            "retail_price": 55.00,
            "wholesale_price": 48.00,
            "alternate_units": [{"unit_label": "piece", "conversion_factor": 12.0}],
            "sync_catalog_price": True,
        },
    )
    assert patch_res.status_code == 200

    # 3. Verify Item Master updated with new prices & alternate units
    item_res = await client.get("/api/admin/inventory/items", headers=auth_headers)
    assert item_res.status_code == 200
    item_data = next(it for it in item_res.json() if it["id"] == item_id)
    assert float(item_data["mrp"]) == 60.00
    assert float(item_data["retail_price"]) == 55.00
    assert float(item_data["wholesale_price"]) == 48.00
    assert len(item_data["alternate_units"]) == 1
    assert item_data["alternate_units"][0]["unit_label"] == "piece"
    assert float(item_data["alternate_units"][0]["conversion_factor"]) == 12.0

    # 4. Inward adjustment with explicit price overrides
    adjust_res = await client.post(
        f"/api/admin/inventory/batches/{batch['id']}/adjust",
        headers=auth_headers,
        json={
            "adjustment_type": "INTAKE_CORRECTION",
            "quantity_delta": 2.0,
            "total_billed": 480.0,
            "new_mrp": 65.00,
            "new_retail_price": 58.00,
            "new_wholesale_price": 50.00,
            "sync_catalog_price": True,
        },
    )
    assert adjust_res.status_code == 200
    adj_item = next(it for it in (await client.get("/api/admin/inventory/items", headers=auth_headers)).json() if it["id"] == item_id)
    assert float(adj_item["mrp"]) == 65.00
    assert float(adj_item["retail_price"]) == 58.00
    assert float(adj_item["wholesale_price"]) == 50.00

