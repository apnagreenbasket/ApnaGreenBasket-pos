"""
Tests for bulk import resilience: savepoint isolation, PostgreSQL transaction safety,
data sanitization (numeric barcodes, HSN truncation, phone numbers, decimals).
"""

import io
from decimal import Decimal
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


@pytest.mark.asyncio
async def test_bulk_menu_items_image_url_export_and_import(client: AsyncClient, db_session: AsyncSession):
    """Verify that Product Photo / Image (Optional) is in template, exported correctly, and imported optionally."""
    from app.models.menu_item import MenuItem

    outlet = await create_test_outlet(db_session, slug="menu-img-test", name="Menu Img Mart")
    admin = await create_test_user(db_session, outlet, email="admin@menuimg.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Download template & verify header
    tpl_resp = await client.get("/api/admin/bulk/templates/menu-items", headers=headers)
    assert tpl_resp.status_code == 200
    tpl_text = tpl_resp.text
    assert "Product Photo / Image (Optional)" in tpl_text

    # 2. Import items with and without image URL
    data = [
        {
            "Name": "Crispy Apple",
            "Category": "Fresh Fruits",
            "Price": 120.0,
            "Barcode": "APP123",
            "Product Photo / Image (Optional)": "https://img.cdn.com/apple.png",
        },
        {
            "Name": "Sweet Banana",
            "Category": "Fresh Fruits",
            "Price": 60.0,
            "Barcode": "BAN456",
            "Product Photo / Image (Optional)": "",  # Empty / optional
        },
    ]
    df = pd.DataFrame(data)
    excel_buf = io.BytesIO()
    df.to_excel(excel_buf, index=False, engine="openpyxl")
    excel_buf.seek(0)

    files = {
        "file": ("menu_items.xlsx", excel_buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    }

    import_resp = await client.post("/api/admin/bulk/menu-items/import", files=files, headers=headers)
    assert import_resp.status_code == 200, f"Import failed: {import_resp.text}"
    import_result = import_resp.json()
    assert import_result["created"] == 2
    assert import_result["skipped"] == 0

    # Verify database
    res = await db_session.execute(
        select(MenuItem).where(MenuItem.outlet_id == outlet.id).order_by(MenuItem.name)
    )
    items = res.scalars().all()
    assert len(items) == 2

    apple = next(i for i in items if i.name == "Crispy Apple")
    assert apple.image_url == "https://img.cdn.com/apple.png"

    banana = next(i for i in items if i.name == "Sweet Banana")
    assert banana.image_url is None

    # 3. Export as CSV and check that Product Photo / Image (Optional) is present
    export_resp = await client.get("/api/admin/bulk/menu-items/export?format=csv", headers=headers)
    assert export_resp.status_code == 200
    export_csv = export_resp.text
    assert "Product Photo / Image (Optional)" in export_csv
    assert "https://img.cdn.com/apple.png" in export_csv

    # 4. Update banana with an image URL using synonym header 'Image URL'
    update_data = [
        {
            "Name": "Sweet Banana",
            "Category": "Fresh Fruits",
            "Price": 65.0,
            "Barcode": "BAN456",
            "Image URL": "https://img.cdn.com/banana.png",
        }
    ]
    df_update = pd.DataFrame(update_data)
    csv_buf = io.BytesIO()
    df_update.to_csv(csv_buf, index=False)
    csv_buf.seek(0)

    update_files = {
        "file": ("update_banana.csv", csv_buf.getvalue(), "text/csv")
    }

    up_resp = await client.post("/api/admin/bulk/menu-items/import", files=update_files, headers=headers)
    assert up_resp.status_code == 200
    up_result = up_resp.json()
    assert up_result["updated"] == 1

    await db_session.refresh(banana)
    assert banana.image_url == "https://img.cdn.com/banana.png"
    assert banana.price == Decimal("65.00")

    # 5. Import without the image column at all (should work seamlessly)
    no_img_data = [
        {
            "Name": "Fresh Orange",
            "Category": "Fresh Fruits",
            "Price": 80.0,
        }
    ]
    df_no_img = pd.DataFrame(no_img_data)
    csv_buf2 = io.BytesIO()
    df_no_img.to_csv(csv_buf2, index=False)
    csv_buf2.seek(0)

    no_img_files = {
        "file": ("orange.csv", csv_buf2.getvalue(), "text/csv")
    }
    no_img_resp = await client.post("/api/admin/bulk/menu-items/import", files=no_img_files, headers=headers)
    assert no_img_resp.status_code == 200
    assert no_img_resp.json()["created"] == 1

