"""
Tests for INVENTORY_MANAGER role:
- Full access to inventory items, stock intake, and stock adjustments.
- Full access to product catalog (categories, menu items, variants).
- Strict 403 Forbidden access to billing, staff management, expenses, and analytics.
- Validates permissions mapping: allowed_sidebar_tabs = ["inventory", "menu"].
"""

import uuid
from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.category import Category
from app.models.user import User
from app.services.staff_service import get_permissions_for_role


@pytest.mark.asyncio
async def test_inventory_manager_permissions_matrix():
    perms = get_permissions_for_role(RoleEnum.INVENTORY_MANAGER)
    assert perms.can_manage_inventory is True
    assert perms.can_edit_menu is True
    assert perms.can_manage_staff is False
    assert perms.can_manage_billing is False
    assert perms.can_process_payments is False
    assert perms.can_cancel_orders is False
    assert perms.can_view_analytics is False
    assert perms.allowed_sidebar_tabs == ["inventory", "menu"]


@pytest.mark.asyncio
async def test_inventory_manager_allowed_actions(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Stock Outlet",
        slug=f"stock-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    inv_manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Deepak Inventory Head",
        email=f"deepak-{uuid.uuid4().hex[:4]}@stock.com",
        role=RoleEnum.INVENTORY_MANAGER,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(inv_manager)
    await db.commit()

    token = create_access_token(
        user_id=inv_manager.id, outlet_id=outlet_id, role=inv_manager.role.value
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Can create Category
    cat_resp = await client.post(
        "/api/admin/categories",
        json={"name": "Organic Vegetables", "display_order": 1},
        headers=headers,
    )
    assert cat_resp.status_code == 201, cat_resp.text
    category_id = cat_resp.json()["id"]

    # 2. Can create Inventory Item
    inv_resp = await client.post(
        "/api/admin/inventory/items",
        json={
            "name": "Organic Tomatoes",
            "unit": "kg",
            "current_stock": 50.0,
            "reorder_threshold": 10.0,
            "cost_per_unit": 30.0,
        },
        headers=headers,
    )
    assert inv_resp.status_code == 201, inv_resp.text
    inv_item_id = inv_resp.json()["id"]

    # 3. Can log stock intake
    intake_resp = await client.post(
        "/api/admin/inventory/intake",
        json={
            "item_id": inv_item_id,
            "quantity": 25.0,
            "unit_cost": 28.0,
        },
        headers=headers,
    )
    assert intake_resp.status_code == 201, intake_resp.text

    # 4. Can create Menu Item
    item_resp = await client.post(
        "/api/admin/menu-items",
        json={
            "name": "Farm Fresh Tomatoes 1kg",
            "category_id": category_id,
            "price": 40.0,
            "mrp": 50.0,
            "inventory_item_id": inv_item_id,
        },
        headers=headers,
    )
    assert item_resp.status_code == 201, item_resp.text


@pytest.mark.asyncio
async def test_inventory_manager_forbidden_actions(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Security Test Outlet",
        slug=f"sec-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    inv_manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Deepak Inventory Head",
        email=f"deepak-{uuid.uuid4().hex[:4]}@stock.com",
        role=RoleEnum.INVENTORY_MANAGER,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add(inv_manager)
    await db.commit()

    token = create_access_token(
        user_id=inv_manager.id, outlet_id=outlet_id, role=inv_manager.role.value
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Forbidden from Billing POS creation
    bill_resp = await client.post(
        "/api/billing/bills",
        json={
            "customer_name": "Unauthorized Walkin",
            "items": [],
        },
        headers=headers,
    )
    assert bill_resp.status_code == 403, "Inventory Manager must not create bills"

    # 2. Forbidden from Staff Management
    staff_resp = await client.post(
        "/api/staff",
        json={
            "name": "New Cashier",
            "email": "cashier@test.com",
            "password": "password123",
            "role": "CASHIER",
        },
        headers=headers,
    )
    assert staff_resp.status_code == 403, "Inventory Manager must not manage staff"

    # 3. Forbidden from Expenses Management
    expense_resp = await client.post(
        "/api/admin/expenses",
        json={
            "category": "MAINTENANCE",
            "amount": 500.0,
            "description": "Store AC Service",
        },
        headers=headers,
    )
    assert expense_resp.status_code == 403, "Inventory Manager must not submit/manage expenses"

    # 4. Forbidden from Financial Analytics
    analytics_resp = await client.get(
        "/api/analytics/kpi-summary",
        headers=headers,
    )
    assert analytics_resp.status_code == 403, "Inventory Manager must not view analytics"


@pytest.mark.asyncio
async def test_inventory_manager_punch_exempt(client, db_session: AsyncSession):
    """Verify Inventory Manager is exempt from mandatory punch-in and cannot be manager-punched."""
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Punch Test Outlet",
        slug=f"punch-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Store Manager",
        email=f"mgr-{uuid.uuid4().hex[:4]}@stock.com",
        role=RoleEnum.MANAGER,
        password_hash=hash_password("password123"),
        status="active",
    )
    inv_manager = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Deepak Inventory Head",
        email=f"deepak-{uuid.uuid4().hex[:4]}@stock.com",
        role=RoleEnum.INVENTORY_MANAGER,
        password_hash=hash_password("password123"),
        status="active",
    )
    db.add_all([manager, inv_manager])
    await db.commit()

    inv_token = create_access_token(
        user_id=inv_manager.id, outlet_id=outlet_id, role=inv_manager.role.value
    )
    inv_headers = {"Authorization": f"Bearer {inv_token}"}

    # 1. /api/staff/punch/status must return is_exempt=True and is_punched_in=True
    status_resp = await client.get("/api/staff/punch/status", headers=inv_headers)
    assert status_resp.status_code == 200, status_resp.text
    status_data = status_resp.json()
    assert status_data["is_exempt"] is True
    assert status_data["is_punched_in"] is True

    # 2. Manager cannot punch in an Inventory Manager
    mgr_token = create_access_token(
        user_id=manager.id, outlet_id=outlet_id, role=manager.role.value
    )
    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
    punch_resp = await client.post(f"/api/staff/{inv_manager.id}/punch/in", headers=mgr_headers)
    assert punch_resp.status_code == 400
    assert "cannot be marked for Admin, Manager, or Inventory Manager accounts" in punch_resp.json()["detail"]

