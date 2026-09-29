"""
Tests for MRP, Tax Category, and Total Billed & Sorted Quantity Unit Cost Calculator.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import RoleEnum
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_onboard_with_total_billed_and_sorted_qty_calculator(client: AsyncClient, db_session: AsyncSession):
    """Test inwarding stock with total billed amount (₹1000) and sorted usable qty (80 kg out of 100 kg initial)."""
    outlet = await create_test_outlet(db_session, slug="test-mrp-mart", name="MRP Mart")
    admin = await create_test_user(db_session, outlet, email="admin@mrpmart.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    payload = {
        "barcode": "8901234567890",
        "name": "Fresh Organic Potatoes",
        "category": "Vegetables",
        "unit": "kg",
        "initial_stock": 100.0,
        "sorted_quantity": 80.0,
        "total_billed_amount": 1000.0,
        "mrp": 25.0,
        "selling_price": 20.0,
        "tax_category": "GST 5%",
        "tax_rate": 5.0,
    }
    resp = await client.post("/api/admin/inventory/scan-onboard", json=payload, headers=headers)
    assert resp.status_code == 201
    item = resp.json()

    # Net stock should be 80.0 (sorted quantity)
    assert float(item["current_stock"]) == 80.0
    # Cost per unit should be ₹1000 / 80 = ₹12.50
    assert float(item["cost_per_unit"]) == 12.50
    assert float(item["mrp"]) == 25.0
    assert item["tax_category"] == "GST 5%"
    assert float(item["tax_rate"]) == 5.0

    # Verify menu item was created with MRP, selling_price, tax_category, tax_rate
    menu_resp = await client.get("/api/admin/menu-items", headers=headers)
    assert menu_resp.status_code == 200
    menu_items = menu_resp.json()
    assert len(menu_items) >= 1
    potatoes_menu = next(m for m in menu_items if m["name"] == "Fresh Organic Potatoes")
    assert float(potatoes_menu["price"]) == 20.0
    assert float(potatoes_menu["mrp"]) == 25.0
    assert potatoes_menu["tax_category"] == "GST 5%"
    assert float(potatoes_menu["tax_rate"]) == 5.0

    # Test activating special offer via PATCH
    offer_patch = {
        "is_on_offer": True,
        "offer_price": 15.0,
        "offer_label": "25% OFF",
    }
    patch_resp = await client.patch(f"/api/admin/menu-items/{potatoes_menu['id']}", json=offer_patch, headers=headers)
    assert patch_resp.status_code == 200
    updated_menu = patch_resp.json()
    assert updated_menu["is_on_offer"] is True
    assert float(updated_menu["offer_price"]) == 15.0
    assert updated_menu["offer_label"] == "25% OFF"

    # Test deactivating special offer via PATCH
    deactivate_patch = {
        "is_on_offer": False,
        "offer_price": None,
        "offer_label": None,
    }
    deact_resp = await client.patch(f"/api/admin/menu-items/{potatoes_menu['id']}", json=deactivate_patch, headers=headers)
    assert deact_resp.status_code == 200
    deact_menu = deact_resp.json()
    assert deact_menu["is_on_offer"] is False
    assert deact_menu["offer_price"] is None
    assert deact_menu["offer_label"] == None


@pytest.mark.asyncio
async def test_onboard_item_with_multiple_existing_linked_menu_items(client: AsyncClient, db_session: AsyncSession):
    """Verify that scan-onboard does not crash with MultipleResultsFound when multiple MenuItems link to the same InventoryItem."""
    import uuid
    from decimal import Decimal
    from app.models.category import Category
    from app.models.inventory_item import InventoryItem
    from app.models.menu_item import MenuItem
    from app.models.enums import InventoryUnitEnum

    outlet = await create_test_outlet(db_session, slug="multi-menu-outlet", name="Multi Menu Outlet")
    admin = await create_test_user(db_session, outlet, email="admin@multimenu.com", role=RoleEnum.OUTLET_ADMIN)
    headers = get_auth_headers(admin, outlet)

    # 1. Create a category
    cat = Category(id=uuid.uuid4(), outlet_id=outlet.id, name="Produce", display_order=0)
    db_session.add(cat)

    # 2. Create an InventoryItem
    inv = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        name="Fresh Tomato",
        barcode="8909999999999",
        unit=InventoryUnitEnum.KG,
        category="Produce",
        current_stock=Decimal("10.0"),
        cost_per_unit=Decimal("20.0"),
        retail_price=Decimal("30.0"),
    )
    db_session.add(inv)

    # 3. Create TWO MenuItems linking to the exact same inventory item
    mi1 = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        category_id=cat.id,
        inventory_item_id=inv.id,
        name="Fresh Tomato (Loose)",
        barcode="8909999999999",
        price=Decimal("30.0"),
        is_available=True,
    )
    mi2 = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet.id,
        category_id=cat.id,
        inventory_item_id=inv.id,
        name="Fresh Tomato (Pack)",
        barcode="8909999999998",
        price=Decimal("32.0"),
        is_available=True,
    )
    db_session.add_all([mi1, mi2])
    await db_session.commit()

    # 4. Inward / Scan-onboard the item again with new stock and selling price
    payload = {
        "barcode": "8909999999999",
        "name": "Fresh Tomato",
        "category": "Produce",
        "unit": "kg",
        "initial_stock": 50.0,
        "cost_per_unit": 22.0,
        "selling_price": 35.0,
        "mrp": 40.0,
    }
    resp = await client.post("/api/admin/inventory/scan-onboard", json=payload, headers=headers)
    # Must succeed with 201, NOT fail with 500 MultipleResultsFound!
    assert resp.status_code == 201
    data = resp.json()
    assert float(data["current_stock"]) == 60.0  # 10 + 50

    # 5. Verify both linked menu items had pricing synchronized without crashing
    await db_session.refresh(mi1)
    await db_session.refresh(mi2)
    assert float(mi1.price) == 35.0
    assert float(mi2.price) == 35.0

