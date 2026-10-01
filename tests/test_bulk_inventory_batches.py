"""
Tests for bulk inventory import batch number generation (DDMMYYYY),
strict synchronization between current_stock and batch remaining quantities,
and prevention of desync on re-import.
"""

import io
import re
from datetime import datetime
from decimal import Decimal
import pandas as pd
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.shift_utils import IST
from app.models.enums import RoleEnum
from app.models.inventory_item import InventoryItem
from app.models.stock_intake import StockIntake
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_bulk_inventory_batch_creation_and_sync(client: AsyncClient, db_session: AsyncSession):
    outlet = await create_test_outlet(db_session, slug="batch-sync-test", name="Batch Sync Outlet")
    admin = await create_test_user(db_session, outlet, email="admin@batchsync.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    today_ddmmyyyy = datetime.now(IST).strftime("%d%m%Y")

    # 1. Import a new item with Initial Qty
    data_1 = [
        {
            "Name": "Organic Kashmiri Apple",
            "Barcode": "8901112223334",
            "Unit": "kg",
            "Category": "Fruits",
            "Initial Qty": 25.0,
            "Cost Per Unit": 80.0,
            "Retail Price": 120.0,
            "MRP": 130.0,
            "Tax Category": "GST 0%",
            "Tax Rate": 0.0,
        }
    ]
    df_1 = pd.DataFrame(data_1)
    buf_1 = io.BytesIO()
    df_1.to_excel(buf_1, index=False, engine="openpyxl")
    buf_1.seek(0)

    files_1 = {
        "file": ("inv_batch_test.xlsx", buf_1.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    resp_1 = await client.post("/api/admin/bulk/inventory/import", files=files_1, headers=headers)
    assert resp_1.status_code == 200, f"Import failed: {resp_1.text}"

    # Verify InventoryItem
    res = await db_session.execute(
        select(InventoryItem).where(
            InventoryItem.outlet_id == outlet.id,
            InventoryItem.name == "Organic Kashmiri Apple",
        )
    )
    apple = res.scalars().first()
    assert apple is not None
    assert Decimal(str(apple.current_stock)) == Decimal("25.000")

    # Verify StockIntake batch
    batch_res = await db_session.execute(
        select(StockIntake).where(StockIntake.item_id == apple.id)
    )
    batches = batch_res.scalars().all()
    assert len(batches) == 1
    batch = batches[0]
    assert Decimal(str(batch.remaining_quantity)) == Decimal("25.000")

    # Verify batch number format: BAT-DDMMYYYY-XXXX
    assert batch.batch_number is not None
    pattern = rf"^BAT-{today_ddmmyyyy}-[A-Z0-9]{{4}}$"
    assert re.match(pattern, batch.batch_number), f"Batch number '{batch.batch_number}' did not match pattern '{pattern}'"

    # 2. Re-import updating retail price, with NO Initial Qty but an old Current Stock column
    data_2 = [
        {
            "Name": "Organic Kashmiri Apple",
            "Barcode": "8901112223334",
            "Unit": "kg",
            "Category": "Fruits",
            "Retail Price": 140.0,
            "Current Stock": 9.0,  # Old/stale value from an earlier export
        }
    ]
    df_2 = pd.DataFrame(data_2)
    buf_2 = io.BytesIO()
    df_2.to_excel(buf_2, index=False, engine="openpyxl")
    buf_2.seek(0)

    files_2 = {
        "file": ("inv_batch_test2.xlsx", buf_2.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    resp_2 = await client.post("/api/admin/bulk/inventory/import", files=files_2, headers=headers)
    assert resp_2.status_code == 200

    # Refresh apple
    await db_session.refresh(apple)
    assert float(apple.retail_price) == 140.0
    # Must NOT have been overwritten by 9.0! Must strictly remain 25.000 from batches!
    assert Decimal(str(apple.current_stock)) == Decimal("25.000")

    # 3. Test self-healing reconciliation when viewing batches
    # Intentionally desync current_stock to simulate a legacy corrupted item
    apple.current_stock = Decimal("5.000")
    await db_session.commit()

    # Call get_all_batches with item_id
    drawer_res = await client.get(
        f"/api/admin/inventory/batches?item_id={apple.id}",
        headers=headers,
    )
    assert drawer_res.status_code == 200

    # Verify apple has been self-healed back to 25.000
    await db_session.refresh(apple)
    assert Decimal(str(apple.current_stock)) == Decimal("25.000")


@pytest.mark.asyncio
async def test_bulk_inventory_latest_batch_override_propagation(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that when uploading inventory from Excel that adds a new batch,
    the new batch's prices propagate to all existing batches when latest_batch_price_override is ON.
    """
    outlet = await create_test_outlet(db_session, slug="excel-override-test", name="Excel Override Outlet")
    admin = await create_test_user(db_session, outlet, email="admin@exceloverride.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. First import: creates Batch 1
    data_1 = [
        {
            "Name": "Alphonso Mango",
            "Barcode": "8905556667771",
            "Unit": "kg",
            "Category": "Fruits",
            "Initial Qty": 10.0,
            "Cost Per Unit": 60.0,
            "Retail Price": 100.0,
            "MRP": 110.0,
        }
    ]
    df_1 = pd.DataFrame(data_1)
    buf_1 = io.BytesIO()
    df_1.to_excel(buf_1, index=False, engine="openpyxl")
    buf_1.seek(0)

    files_1 = {
        "file": ("mango_batch1.xlsx", buf_1.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }
    resp_1 = await client.post("/api/admin/bulk/inventory/import", files=files_1, headers=headers)
    assert resp_1.status_code == 200, f"Import 1 failed: {resp_1.text}"

    # Verify Item and Batch 1
    item_res = await db_session.execute(
        select(InventoryItem).where(InventoryItem.outlet_id == outlet.id, InventoryItem.name == "Alphonso Mango")
    )
    mango = item_res.scalars().first()
    assert mango is not None
    assert float(mango.retail_price) == 100.0
    assert float(mango.mrp) == 110.0

    batch_res = await db_session.execute(
        select(StockIntake).where(StockIntake.item_id == mango.id).order_by(StockIntake.created_at.asc())
    )
    batches = batch_res.scalars().all()
    assert len(batches) == 1
    assert float(batches[0].retail_price) == 100.0
    assert float(batches[0].mrp) == 110.0

    # 2. Second import with Initial Qty (creates a new batch) and higher prices
    data_2 = [
        {
            "Name": "Alphonso Mango",
            "Barcode": "8905556667771",
            "Unit": "kg",
            "Category": "Fruits",
            "Initial Qty": 20.0,
            "Cost Per Unit": 80.0,
            "Retail Price": 140.0,
            "MRP": 150.0,
        }
    ]
    df_2 = pd.DataFrame(data_2)
    buf_2 = io.BytesIO()
    df_2.to_excel(buf_2, index=False, engine="openpyxl")
    buf_2.seek(0)

    files_2 = {
        "file": ("mango_batch2.xlsx", buf_2.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }
    resp_2 = await client.post("/api/admin/bulk/inventory/import", files=files_2, headers=headers)
    assert resp_2.status_code == 200, f"Import 2 failed: {resp_2.text}"

    # Verify both batches now have the new prices (140, 150)
    batch_res2 = await db_session.execute(
        select(StockIntake).where(StockIntake.item_id == mango.id).order_by(StockIntake.created_at.asc())
    )
    batches2 = batch_res2.scalars().all()
    assert len(batches2) == 2
    # Batch 1 (older batch) must have been updated!
    assert float(batches2[0].retail_price) == 140.0, f"Older batch retail_price expected 140.0, got {batches2[0].retail_price}"
    assert float(batches2[0].mrp) == 150.0
    # Batch 2 (new batch)
    assert float(batches2[1].retail_price) == 140.0
    assert float(batches2[1].mrp) == 150.0

    # Parent inventory item must also be 140.0, 150.0
    await db_session.refresh(mango)
    assert float(mango.retail_price) == 140.0
    assert float(mango.mrp) == 150.0

