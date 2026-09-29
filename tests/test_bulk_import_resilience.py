"""
Tests for bulk import resilience: savepoint isolation, PostgreSQL transaction safety,
data sanitization (numeric barcodes, HSN truncation, phone numbers, decimals).
"""

import io
import pytest
import pandas as pd
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.enums import RoleEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.customer import Customer
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_bulk_inventory_import_resilience(client: AsyncClient, db_session: AsyncSession):
    outlet = await create_test_outlet(db_session, slug="bulk-inv-test", name="Bulk Inv Mart")
    admin = await create_test_user(db_session, outlet, email="admin@bulkinv.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # Prepare DataFrame with:
    # Row 1: Valid row with numeric barcode (e.g. 8901234567890) and long HSN code
    # Row 2: Invalid row (missing name) that should be skipped by savepoint
    # Row 3: Valid row with string barcode and retail price
    data = [
        {
            "Name": "Alphonso Mango",
            "Barcode": 8901234567890,  # pandas will parse as int/float
            "Unit": "kg",
            "Category": "Fruits",
            "Current Stock": 50,
            "Cost Per Unit": 120.0,
            "Retail Price": 150.0,
            "MRP": 160.0,
            "HSN Code": "08045020_EXTRA_LONG_CODE_THAT_EXCEEDS_LIMIT",
            "Tax Category": "GST 0%",
            "Tax Rate": 0.0,
        },
        {
            "Name": "",  # Empty name -> should fail savepoint and be skipped
            "Barcode": 999999,
            "Unit": "piece",
            "Category": "General",
        },
        {
            "Name": "Cold Pressed Coconut Oil 1L",
            "Barcode": "8909876543210",
            "Unit": "bottle",
            "Category": "Oils",
            "Current Stock": 20,
            "Cost Per Unit": 250.0,
            "Retail Price": 320.0,
            "MRP": 350.0,
            "HSN Code": "15131900",
            "Tax Category": "GST 5%",
            "Tax Rate": 5.0,
        },
    ]
    df = pd.DataFrame(data)
    excel_buf = io.BytesIO()
    df.to_excel(excel_buf, index=False, engine="openpyxl")
    excel_buf.seek(0)

    files = {
        "file": ("inventory_test.xlsx", excel_buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    resp = await client.post("/api/admin/bulk/inventory/import", files=files, headers=headers)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    result = resp.json()
    assert result["total_rows"] == 3
    assert result["created"] == 2
    assert result["skipped"] == 1
    assert len(result["errors"]) == 1

    # Verify Alphonso Mango was created with sanitized barcode string
    res = await db_session.execute(
        select(InventoryItem).where(
            InventoryItem.outlet_id == outlet.id,
            InventoryItem.name == "Alphonso Mango"
        )
    )
    mango_inv = res.scalars().first()
    assert mango_inv is not None
    assert mango_inv.barcode == "8901234567890"
    assert len(mango_inv.hsn_code) <= 20

    # Verify MenuItem was auto-created
    res_mi = await db_session.execute(
        select(MenuItem).where(
            MenuItem.outlet_id == outlet.id,
            MenuItem.name == "Alphonso Mango"
        )
    )
    mango_mi = res_mi.scalars().first()
    assert mango_mi is not None
    assert float(mango_mi.price) == 150.0
    assert mango_mi.barcode == "8901234567890"


@pytest.mark.asyncio
async def test_bulk_menu_items_import_resilience(client: AsyncClient, db_session: AsyncSession):
    outlet = await create_test_outlet(db_session, slug="bulk-menu-test", name="Bulk Menu Mart")
    admin = await create_test_user(db_session, outlet, email="admin@bulkmenu.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    data = [
        {
            "name": "Dairy Milk Silk 150g",
            "category": "Chocolates",
            "price": 175.0,
            "mrp": 175.0,
            "barcode": 8901233000001,
        },
        {
            "name": "Broken Item",
            "category": "",
            "price": None,
        },
    ]
    df = pd.DataFrame(data)
    excel_buf = io.BytesIO()
    df.to_excel(excel_buf, index=False, engine="openpyxl")
    excel_buf.seek(0)

    files = {
        "file": ("menu_test.xlsx", excel_buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    resp = await client.post("/api/admin/bulk/menu-items/import", files=files, headers=headers)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    result = resp.json()
    assert result["created"] == 1
    assert result["skipped"] == 1


@pytest.mark.asyncio
async def test_bulk_customers_import_resilience(client: AsyncClient, db_session: AsyncSession):
    outlet = await create_test_outlet(db_session, slug="bulk-cust-test", name="Bulk Cust Mart")
    admin = await create_test_user(db_session, outlet, email="admin@bulkcust.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    data = [
        {
            "Name": "Ramesh Patel",
            "Phone": 9876543210,  # Numeric phone number parsed as float/int
            "Historical Spend": 5400.0,
            "Loyalty Points": 120,
        },
        {
            "Name": "Incomplete User",
            "Phone": "",
        },
    ]
    df = pd.DataFrame(data)
    excel_buf = io.BytesIO()
    df.to_excel(excel_buf, index=False, engine="openpyxl")
    excel_buf.seek(0)

    files = {
        "file": ("cust_test.xlsx", excel_buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    resp = await client.post("/api/admin/bulk/customers/import", files=files, headers=headers)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    result = resp.json()
    assert result["created"] == 1
    assert result["skipped"] == 1

    res = await db_session.execute(
        select(Customer).where(
            Customer.outlet_id == outlet.id,
            Customer.phone == "9876543210"
        )
    )
    cust = res.scalars().first()
    assert cust is not None
    assert cust.name == "Ramesh Patel"
    assert cust.loyalty_points == 120
