"""
Part 4 tests — Inventory Expiry & Batch Tracking.
"""

from __future__ import annotations

import pytest
from datetime import datetime, timedelta
from decimal import Decimal
from tests.conftest import (
    create_test_category,
    create_test_menu_item,
    create_test_outlet,
    create_test_user,
    get_auth_headers,
)
from app.models.enums import InventoryUnitEnum, RoleEnum
from app.services.inventory_service import log_stock_intake, process_order_auto_deduction
from app.schemas.inventory import InventoryItemCreate, RecipeIngredientItem, RecipeSaveRequest, StockIntakeCreate
from app.services.inventory_service import create_inventory_item, save_menu_item_recipe


@pytest.mark.asyncio
class TestInventoryExpiry:
    """Part 4 Inventory Expiry & Batch FIFO unit tests."""

    async def test_stock_intake_with_expiry_and_remaining(self, client, db_session):
        """Stock intake stores expiry_date and initializes remaining_quantity."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        await db_session.commit()
        headers = get_auth_headers(admin, outlet)

        # Create inventory item
        inv_item = await create_inventory_item(
            db_session, outlet.id,
            InventoryItemCreate(name="Fresh Milk", unit=InventoryUnitEnum.L, current_stock=Decimal("0.0"), cost_per_unit=Decimal("50.0"))
        )
        await db_session.commit()

        expiry = (datetime.utcnow() + timedelta(days=5)).isoformat()
        resp = await client.post("/api/admin/inventory/intake", json={
            "item_id": str(inv_item.id),
            "quantity": 20.0,
            "unit_cost": 50.0,
            "supplier_name": "Amul Dairy",
            "expiry_date": expiry,
            "notes": "Batch A",
        }, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert float(data["remaining_quantity"]) == 20.0
        assert data["expiry_date"] is not None

    async def test_near_expiry_alerts_endpoint(self, client, db_session):
        """Near-expiry alerts endpoint returns batches within threshold."""
        outlet = await create_test_outlet(db_session)
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        inv_item = await create_inventory_item(
            db_session, outlet.id,
            InventoryItemCreate(name="Organic Berries", unit=InventoryUnitEnum.KG, current_stock=Decimal("0.0"), cost_per_unit=Decimal("200.0"))
        )
        await db_session.commit()

        # Intake batch expiring in 3 days
        expiry = datetime.utcnow() + timedelta(days=3)
        await log_stock_intake(
            db_session, outlet.id, admin.id,
            StockIntakeCreate(item_id=inv_item.id, quantity=Decimal("5.0"), unit_cost=Decimal("200.0"), expiry_date=expiry)
        )
        await db_session.commit()

        headers = get_auth_headers(admin, outlet)
        resp = await client.get("/api/admin/inventory/near-expiry-alerts?threshold_days=7", headers=headers)
        assert resp.status_code == 200
        alerts = resp.json()
        assert len(alerts) >= 1
        found = [a for a in alerts if a["item_id"] == str(inv_item.id)]
        assert len(found) == 1
        assert found[0]["status"] == "EXPIRING_SOON"
        assert found[0]["days_until_expiry"] in (2, 3)

    async def test_fifo_auto_deduction_earliest_expiry_first(self, client, db_session):
        """Order stock deduction draws down from earliest-expiring batch first."""
        outlet = await create_test_outlet(db_session)
        outlet.payment_mode = "BOTH"
        outlet.verification_amount_cutoff = Decimal("1000.00")
        admin = await create_test_user(db_session, outlet, role=RoleEnum.OUTLET_ADMIN)
        cat = await create_test_category(db_session, outlet)
        menu_item = await create_test_menu_item(db_session, outlet, cat, name="Fresh Mango Smoothie", price=Decimal("120.0"))

        inv_item = await create_inventory_item(
            db_session, outlet.id,
            InventoryItemCreate(name="Ripe Mangoes", unit=InventoryUnitEnum.KG, current_stock=Decimal("0.0"), cost_per_unit=Decimal("80.0"))
        )
        await save_menu_item_recipe(
            db_session, outlet.id,
            RecipeSaveRequest(menu_item_id=menu_item.id, ingredients=[RecipeIngredientItem(inventory_item_id=inv_item.id, quantity_required=Decimal("0.5"), unit=InventoryUnitEnum.KG)])
        )
        await db_session.commit()

        # Intake Batch 1: Expiring in 2 days (quantity 10 kg)
        b1 = await log_stock_intake(
            db_session, outlet.id, admin.id,
            StockIntakeCreate(item_id=inv_item.id, quantity=Decimal("10.0"), unit_cost=Decimal("80.0"), expiry_date=datetime.utcnow() + timedelta(days=2))
        )
        # Intake Batch 2: Expiring in 10 days (quantity 10 kg)
        b2 = await log_stock_intake(
            db_session, outlet.id, admin.id,
            StockIntakeCreate(item_id=inv_item.id, quantity=Decimal("10.0"), unit_cost=Decimal("80.0"), expiry_date=datetime.utcnow() + timedelta(days=10))
        )
        await db_session.commit()

        # Order 4 smoothies (requires 4 * 0.5 = 2.0 kg mangoes)
        checkout_res = await client.post("/api/orders/checkout", json={
            "outlet_slug": outlet.slug,
            "basket_number": "5",
            "customer_name": "Carol",
            "payment_mode": "PAY_AT_COUNTER",
            "items": [{"menu_item_id": str(menu_item.id), "quantity": 4}],
        })
        assert checkout_res.status_code == 201

        await db_session.refresh(b1)
        await db_session.refresh(b2)

        # Batch 1 (earlier expiry) should be reduced from 10.0 to 8.0 kg
        assert float(b1.remaining_quantity) == 8.0
        # Batch 2 (later expiry) should remain untouched at 10.0 kg
        assert float(b2.remaining_quantity) == 10.0
