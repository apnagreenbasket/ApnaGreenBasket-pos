"""
Tests for negative inventory batch management:
1. Situation 1: Voiding an inward batch that settled pre-sold deficits restores the deficit back onto the oversold batch and returns parent item stock to negative.
2. Situation 2: Once a negative batch is settled to 0, subsequent sales that go negative create a NEW negative batch and never reopen settled batches; while open, subsequent sales accumulate into the current open negative batch.
"""

import pytest
import uuid
from decimal import Decimal
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_negative_stock_batch_accumulation_settlement_and_void_restoration(
    client: AsyncClient,
    db_session: AsyncSession,
):
    outlet = await create_test_outlet(
        db_session, slug="neg-batch-lifecycle-outlet", name="Negative Batch Lifecycle Outlet"
    )
    user = await create_test_user(db_session, outlet, email="neg_batch_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item ABC with initial_stock = 0
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "890999888111",
            "name": "ABC Item",
            "category": "Groceries",
            "unit": "piece",
            "initial_stock": 0,
            "cost_per_unit": 50.0,
            "selling_price": 70.0,
            "mrp": 80.0,
            "batch_number": "BAT-ABC-INIT",
        },
    )
    assert onboard_res.status_code == 201
    item_id = uuid.UUID(onboard_res.json()["id"])

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert menu_res.status_code == 200
    menu_items = menu_res.json()
    abc_menu = next(m for m in menu_items if m["name"] == "ABC Item")

    # 2. Sell 1 unit -> bill & pay -> stock becomes -1, creating an oversold batch
    bill1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Customer 1",
            "items": [
                {
                    "menu_item_id": abc_menu["id"],
                    "item_name": "ABC Item",
                    "quantity": 1.0,
                    "unit_price": 70.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill1_res.status_code == 200
    bill1 = bill1_res.json()

    pay1_res = await client.post(
        f"/api/billing/bills/{bill1['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay1_res.status_code == 200

    # Check stock and batches
    item_res = await db_session.execute(
        select(InventoryItem).where(InventoryItem.id == item_id)
    )
    item = item_res.scalar_one()
    assert item.current_stock == Decimal("-1.000")

    ov_res = await db_session.execute(
        select(StockIntake).where(
            StockIntake.item_id == item_id,
            StockIntake.remaining_quantity < Decimal("0.000"),
        )
    )
    ov_batches = ov_res.scalars().all()
    assert len(ov_batches) == 1
    first_ov_batch = ov_batches[0]
    assert first_ov_batch.remaining_quantity == Decimal("-1.000")

    # 3. Sell 5 more units -> stock becomes -6, accumulating into the SAME negative batch
    bill2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Customer 2",
            "items": [
                {
                    "menu_item_id": abc_menu["id"],
                    "item_name": "ABC Item",
                    "quantity": 5.0,
                    "unit_price": 70.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill2_res.status_code == 200
    bill2 = bill2_res.json()

    pay2_res = await client.post(
        f"/api/billing/bills/{bill2['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay2_res.status_code == 200

    await db_session.refresh(item)
    assert item.current_stock == Decimal("-6.000")

    await db_session.refresh(first_ov_batch)
    assert first_ov_batch.remaining_quantity == Decimal("-6.000")

    # Verify no second negative batch was created
    all_batches_res = await db_session.execute(
        select(StockIntake).where(StockIntake.item_id == item_id)
    )
    all_batches = all_batches_res.scalars().all()
    ov_count = sum(1 for b in all_batches if b.remaining_quantity < Decimal("0.000"))
    assert ov_count == 1

    # 4. Inward a batch of 10 units -> stock becomes +4, first_ov_batch is settled to 0
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": str(item_id),
            "quantity": 10,
            "unit_cost": 50.0,
            "retail_price": 70.0,
            "mrp": 80.0,
            "batch_number": "BAT-ABC-10",
        },
    )
    assert intake_res.status_code in (200, 201)
    intake_batch_id = uuid.UUID(intake_res.json()["id"])

    await db_session.refresh(item)
    assert item.current_stock == Decimal("4.000")

    await db_session.refresh(first_ov_batch)
    assert first_ov_batch.remaining_quantity == Decimal("0.000")
    assert "Settled by Batch #BAT-ABC-10" in (first_ov_batch.notes or "")

    inward_batch = await db_session.get(StockIntake, intake_batch_id)
    assert inward_batch.remaining_quantity == Decimal("4.000")

    # 5. Situation 1: User voids BAT-ABC-10 (added by mistake)
    del_res = await client.delete(
        f"/api/admin/inventory/batches/{intake_batch_id}",
        headers=auth_headers,
    )
    assert del_res.status_code == 204

    # Verify:
    # - parent item current stock returns to -6.000
    # - first_ov_batch is reopened to -6.000
    # - inward batch remaining_quantity is 0.000 and notes marked [VOIDED]
    await db_session.refresh(item)
    assert item.current_stock == Decimal("-6.000")

    await db_session.refresh(first_ov_batch)
    assert first_ov_batch.remaining_quantity == Decimal("-6.000")
    assert "Settled by Batch #BAT-ABC-10" not in (first_ov_batch.notes or "")

    await db_session.refresh(inward_batch)
    assert inward_batch.remaining_quantity == Decimal("0.000")
    assert inward_batch.notes.startswith("[VOIDED]")

    # Verify ledger entries
    ledger_res = await db_session.execute(
        select(StockLedger)
        .where(StockLedger.item_id == item_id)
        .order_by(StockLedger.created_at.desc())
    )
    ledgers = ledger_res.scalars().all()
    void_ledger = next(l for l in ledgers if l.change_type == StockChangeTypeEnum.VOID_BATCH)
    assert void_ledger.quantity_change == Decimal("-10.000")
    assert void_ledger.resulting_stock == Decimal("-6.000")


@pytest.mark.asyncio
async def test_settled_negative_batch_is_never_reused_in_subsequent_cycle(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Scenario:
    1. Item stock starts at 0.
    2. Sold 2 units -> negative batch OV-1 created with remaining_quantity = -2. Stock = -2.
    3. Inward 2 units -> OV-1 is settled to 0. Stock = 0.
    4. Sometime later, stock goes negative again (sell 1 unit).
    5. Verify: A NEW negative batch OV-2 is created. OV-1 remains 0.
    6. Sell another 2 units -> accumulates into OV-2 (-1 -> -3).
    """
    outlet = await create_test_outlet(
        db_session, slug="cycle-batch-outlet", name="Cycle Batch Outlet"
    )
    user = await create_test_user(db_session, outlet, email="cycle_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "barcode": "890123456789",
            "name": "Cycle Item",
            "category": "Groceries",
            "unit": "piece",
            "initial_stock": 0,
            "cost_per_unit": 20.0,
            "selling_price": 30.0,
            "mrp": 35.0,
            "batch_number": "BAT-CYCLE-INIT",
        },
    )
    assert onboard_res.status_code == 201
    item_id = uuid.UUID(onboard_res.json()["id"])

    menu_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert menu_res.status_code == 200
    menu_items = menu_res.json()
    cycle_menu = next(m for m in menu_items if m["name"] == "Cycle Item")

    # 2. Sell 2 units -> creates OV-1
    bill1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Cycle Customer 1",
            "items": [
                {
                    "menu_item_id": cycle_menu["id"],
                    "item_name": "Cycle Item",
                    "quantity": 2.0,
                    "unit_price": 30.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill1_res.status_code == 200
    bill1 = bill1_res.json()

    pay1_res = await client.post(
        f"/api/billing/bills/{bill1['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay1_res.status_code == 200

    item = await db_session.get(InventoryItem, item_id)
    assert item.current_stock == Decimal("-2.000")

    ov1_res = await db_session.execute(
        select(StockIntake).where(
            StockIntake.item_id == item_id,
            StockIntake.remaining_quantity < Decimal("0.000"),
        )
    )
    ov1 = ov1_res.scalars().one()
    assert ov1.remaining_quantity == Decimal("-2.000")
    ov1_id = ov1.id

    # 3. Settle OV-1 with inward batch of 2
    intake_res = await client.post(
        "/api/admin/inventory/intake",
        headers=auth_headers,
        json={
            "item_id": str(item_id),
            "quantity": 2,
            "unit_cost": 20.0,
            "retail_price": 30.0,
            "mrp": 35.0,
            "batch_number": "BAT-CYCLE-SETTLE",
        },
    )
    assert intake_res.status_code in (200, 201)

    await db_session.refresh(item)
    assert item.current_stock == Decimal("0.000")

    await db_session.refresh(ov1)
    assert ov1.remaining_quantity == Decimal("0.000")

    # 4. Sell 1 unit -> goes negative in a new cycle
    bill2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Cycle Customer 2",
            "items": [
                {
                    "menu_item_id": cycle_menu["id"],
                    "item_name": "Cycle Item",
                    "quantity": 1.0,
                    "unit_price": 30.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill2_res.status_code == 200
    bill2 = bill2_res.json()

    pay2_res = await client.post(
        f"/api/billing/bills/{bill2['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay2_res.status_code == 200

    await db_session.refresh(item)
    assert item.current_stock == Decimal("-1.000")

    # Verify OV-1 was NOT reused and remains 0.000!
    await db_session.refresh(ov1)
    assert ov1.remaining_quantity == Decimal("0.000")

    # Verify a brand NEW negative batch OV-2 was created!
    ov2_res = await db_session.execute(
        select(StockIntake).where(
            StockIntake.item_id == item_id,
            StockIntake.remaining_quantity < Decimal("0.000"),
        )
    )
    ov2 = ov2_res.scalars().one()
    assert ov2.id != ov1_id
    assert ov2.remaining_quantity == Decimal("-1.000")

    # 5. Sell 2 more units -> accumulates into OV-2 (-1 - 2 = -3)
    bill3_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Cycle Customer 3",
            "items": [
                {
                    "menu_item_id": cycle_menu["id"],
                    "item_name": "Cycle Item",
                    "quantity": 2.0,
                    "unit_price": 30.0,
                    "allow_oversell": True,
                }
            ],
        },
    )
    assert bill3_res.status_code == 200
    bill3 = bill3_res.json()

    pay3_res = await client.post(
        f"/api/billing/bills/{bill3['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )
    assert pay3_res.status_code == 200

    await db_session.refresh(item)
    assert item.current_stock == Decimal("-3.000")

    await db_session.refresh(ov1)
    assert ov1.remaining_quantity == Decimal("0.000")

    await db_session.refresh(ov2)
    assert ov2.remaining_quantity == Decimal("-3.000")


@pytest.mark.asyncio
async def test_rapid_double_submit_deduplication(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Scenario:
    User enters initial_stock = 10 and presses Enter repeatedly or double clicks fast.
    Backend rapid duplicate guard must detect the identical concurrent request,
    preventing duplicate batch creation and keeping stock at 10 (not 20).
    """
    outlet = await create_test_outlet(
        db_session, slug="dedup-stock-outlet", name="Dedup Stock Outlet"
    )
    user = await create_test_user(db_session, outlet, email="dedup_admin@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    payload = {
        "barcode": "890555444333",
        "name": "Dedup Item",
        "category": "Groceries",
        "unit": "piece",
        "initial_stock": 10,
        "cost_per_unit": 25.0,
        "selling_price": 40.0,
        "mrp": 50.0,
        "batch_number": "BAT-DEDUP-01",
    }

    # First request
    res1 = await client.post("/api/admin/inventory/scan-onboard", headers=auth_headers, json=payload)
    assert res1.status_code == 201
    item_id = uuid.UUID(res1.json()["id"])

    # Immediate second duplicate request (simulating rapid Enter / double click within 2 seconds)
    res2 = await client.post("/api/admin/inventory/scan-onboard", headers=auth_headers, json=payload)
    assert res2.status_code in (200, 201)

    item = await db_session.get(InventoryItem, item_id)
    # Stock must remain 10, NOT 20!
    assert item.current_stock == Decimal("10.000")

    # Batches count must be 1, NOT 2!
    batches_res = await db_session.execute(
        select(StockIntake).where(StockIntake.item_id == item_id)
    )
    batches = batches_res.scalars().all()
    assert len(batches) == 1
    assert batches[0].quantity == Decimal("10.000")
