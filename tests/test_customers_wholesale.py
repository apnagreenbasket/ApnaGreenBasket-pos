import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import create_test_outlet, create_test_user, get_auth_headers


@pytest.mark.asyncio
async def test_wholesale_price_onboarding_and_public_menu(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Verify that wholesale_price is saved on InventoryItem and MenuItem, but NOT exposed on public /menu."""
    outlet = await create_test_outlet(db_session, slug="ws-outlet", name="Wholesale Outlet")
    user = await create_test_user(db_session, outlet, email="admin_ws@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard item with wholesale_price
    payload = {
        "barcode": "8901234567890",
        "name": "Wholesale Sugar Pack 5kg",
        "category": "Groceries",
        "unit": "pcs",
        "initial_stock": 20,
        "cost_per_unit": 200.0,
        "selling_price": 250.0,
        "wholesale_price": 220.0,
        "mrp": 270.0,
    }
    response = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json=payload,
    )
    assert response.status_code == 201
    data = response.json()
    assert float(data["wholesale_price"]) == 220.0

    # 2. Query public /menu/{outlet_slug}
    public_res = await client.get(f"/api/public/menu/{outlet.slug}")
    assert public_res.status_code == 200
    menu_data = public_res.json()

    # Verify public menu item does NOT contain wholesale_price key
    all_items = []
    for cat in menu_data.get("categories", []):
        all_items.extend(cat.get("items", []))

    found_sugar = next((i for i in all_items if i["name"] == "Wholesale Sugar Pack 5kg"), None)
    assert found_sugar is not None
    assert "wholesale_price" not in found_sugar
    assert float(found_sugar["price"]) == 250.0


@pytest.mark.asyncio
async def test_pos_customer_auto_creation_and_wholesale_billing(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Verify POS manual bill creation auto-creates Customer and handles wholesale pricing mode."""
    outlet = await create_test_outlet(db_session, slug="ws-pos-outlet", name="POS Outlet")
    user = await create_test_user(db_session, outlet, email="admin_pos@test.com")
    await db_session.commit()
    auth_headers = get_auth_headers(user, outlet)

    # 1. Onboard a test item
    onboard_res = await client.post(
        "/api/admin/inventory/scan-onboard",
        headers=auth_headers,
        json={
            "name": "Wholesale Rice Bag 10kg",
            "category": "Grains",
            "unit": "pcs",
            "initial_stock": 10,
            "selling_price": 600.0,
            "wholesale_price": 520.0,
        },
    )
    assert onboard_res.status_code == 201

    # Get created menu_item_id
    items_res = await client.get("/api/admin/menu-items", headers=auth_headers)
    assert items_res.status_code == 200
    menu_items = items_res.json()
    if isinstance(menu_items, dict) and "items" in menu_items:
        menu_items = menu_items["items"]
    target_menu_item = next(m for m in menu_items if m["name"] == "Wholesale Rice Bag 10kg")

    # 2. Create POS Bill using WHOLESALE pricing and Customer Phone
    cust_phone = "9876500112"
    cust_name = "Vikram Traders"

    bill_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "basket_number": "COUNTER-1",
            "customer_name": cust_name,
            "customer_phone": cust_phone,
            "items": [
                {
                    "menu_item_id": target_menu_item["id"],
                    "quantity": 2,
                    "pricing_type": "WHOLESALE",
                }
            ],
        },
    )
    assert bill_res.status_code == 200
    bill_data = bill_res.json()
    assert bill_data["customer_name"] == cust_name
    assert bill_data["customer_phone"] == cust_phone
    # Total should be 2 * 520.0 = 1040.0
    assert float(bill_data["total_amount"]) == 1040.0

    # 3. Verify Customer was auto-created in /api/admin/customers
    cust_res = await client.get(
        f"/api/admin/customers?search={cust_phone}",
        headers=auth_headers,
    )
    assert cust_res.status_code == 200
    customers_list = cust_res.json()
    assert len(customers_list) == 1
    assert customers_list[0]["name"] == cust_name
    assert customers_list[0]["phone"] == cust_phone
