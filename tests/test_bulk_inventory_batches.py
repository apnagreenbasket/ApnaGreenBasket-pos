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
