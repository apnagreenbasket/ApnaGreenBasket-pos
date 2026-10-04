from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.customer import Customer
from tests.conftest import create_test_outlet, create_test_user, create_test_category, create_test_menu_item, get_auth_headers


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


@pytest.mark.asyncio
async def test_customers_paginated_overall_stats(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify paginated /api/admin/customers returns total_customer_spend and total_customer_orders
    representing all matching customers across all pages rather than only the current page.
    """
    outlet = await create_test_outlet(db_session, slug="cust-stats-outlet", name="Cust Stats Outlet")
    admin = await create_test_user(
        db_session, outlet, email="admin_stats@test.com"
    )
    cat = await create_test_category(db_session, outlet)
    item = await create_test_menu_item(db_session, outlet, cat, price=Decimal("100.00"))
    auth_headers = get_auth_headers(admin, outlet)

    # Create 2 customers
    c1 = Customer(outlet_id=outlet.id, phone="9111111111", name="Customer One")
    c2 = Customer(outlet_id=outlet.id, phone="9222222222", name="Customer Two")
    db_session.add_all([c1, c2])
    await db_session.commit()

    # Create & pay bill for Customer 1: Rs 100
    b1_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Customer One",
            "customer_phone": "9111111111",
            "items": [{"menu_item_id": str(item.id), "quantity": 1, "unit_price": 100.0}],
        },
    )
    assert b1_res.status_code == 200
    await client.post(
        f"/api/billing/bills/{b1_res.json()['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )

    # Create & pay bill for Customer 2: Rs 200 (qty 2)
    b2_res = await client.post(
        "/api/billing/bills",
        headers=auth_headers,
        json={
            "customer_name": "Customer Two",
            "customer_phone": "9222222222",
            "items": [{"menu_item_id": str(item.id), "quantity": 2, "unit_price": 100.0}],
        },
    )
    assert b2_res.status_code == 200
    await client.post(
        f"/api/billing/bills/{b2_res.json()['id']}/mark-paid",
        headers=auth_headers,
        json={"payment_method": "CASH"},
    )

    # Request page 1 with page_size=1 (only 1 customer on this page, but 2 total)
    res = await client.get(
        "/api/admin/customers?page=1&page_size=1",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 1
    assert data["total"] == 2
    assert data["total_pages"] == 2

    # Overall totals must include BOTH customers (100 + 200 = 300, orders = 1 + 1 = 2)
    assert float(data["total_customer_spend"]) == 300.0
    assert int(data["total_customer_orders"]) == 2

