"""
Unit & Integration tests for Sync API endpoints, Snapshotting,
Idempotent Action Ingestion, Conflict Flagging, and RUNTIME_MODE Gating.
"""

import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.inventory_item import InventoryItem
from app.models.user import User
from app.models.sync_action_log import SyncActionLog
from app.models.sync_conflict_flag import SyncConflictFlag
from app.schemas.sync import SyncAction
from app.services.sync_service import (
    generate_outlet_snapshot,
    get_sync_status,
    process_sync_actions_batch,
)
from app.config import get_settings


@pytest.mark.asyncio
async def test_full_and_incremental_snapshot(db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Snapshot Test Outlet",
        slug=f"snap-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    category = Category(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Fresh Produce",
        display_order=1,
    )
    db.add(category)

    item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Fresh Mango",
        category="Fruits",
        unit="kg",
        current_stock=Decimal("15.000"),
        cost_per_unit=Decimal("50.00"),
    )
    db.add(item)

    menu_item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=category.id,
        inventory_item_id=item.id,
        name="Fresh Mango",
        price=Decimal("80.00"),
        is_available=True,
    )
    db.add(menu_item)

    staff = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="John Staff",
        email="john@outlet.com",
        role=RoleEnum.CASHIER,
        password_hash="secret_hash_value",
        pin_hash="1234_hash_value",
        status="active",
    )
    db.add(staff)
    await db.commit()

    # 1. Test Full Snapshot
    snap = await generate_outlet_snapshot(db, outlet_id, since=None)
    assert snap.is_full is True
    assert snap.outlet.name == "Snapshot Test Outlet"
    assert len(snap.categories) == 1
    assert snap.categories[0].name == "Fresh Produce"
    assert len(snap.menu_items) == 1
    assert snap.menu_items[0].name == "Fresh Mango"
    assert len(snap.staff) == 1
    assert snap.staff[0].pin_hash == "1234_hash_value"
    # Ensure sensitive password hash is NOT exposed in StaffSnapshot schema
    assert not hasattr(snap.staff[0], "password_hash")

    # 2. Test Incremental Snapshot (no changes since now -> empty lists)
    future_since = datetime.now(timezone.utc)
    inc_snap = await generate_outlet_snapshot(db, outlet_id, since=future_since)
    assert inc_snap.is_full is False
    assert len(inc_snap.categories) == 0
    assert len(inc_snap.menu_items) == 0


@pytest.mark.asyncio
async def test_sync_action_ingestion_idempotency_and_conflicts(db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Sync Action Test Outlet",
        slug=f"sync-outlet-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    category = Category(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Beverages",
        display_order=1,
    )
    db.add(category)

    inv_item = InventoryItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Cold Drinks",
        category="Beverages",
        unit="pcs",
        current_stock=Decimal("5.000"),
        cost_per_unit=Decimal("20.00"),
    )
    db.add(inv_item)

    menu_item = MenuItem(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        category_id=category.id,
        inventory_item_id=inv_item.id,
        name="Cold Drinks",
        price=Decimal("40.00"),
        is_available=True,
    )
    db.add(menu_item)
    await db.commit()

    # Create bill via action ingestion
    action_1_id = f"act-{uuid.uuid4().hex}"
    actions = [
        SyncAction(
            client_action_id=action_1_id,
            action_type="bill_created",
            action_timestamp=datetime.now(timezone.utc),
            payload={
                "staff_id": str(uuid.uuid4()),
                "bill_data": {
                    "basket_number": "POS-101",
                    "items": [
                        {
                            "menu_item_id": str(menu_item.id),
                            "quantity": "2.000",
                            "unit_price": "40.00",
                        }
                    ],
                    "customer_name": "Walk-in Customer",
                },
            },
        ),
        # Stock deduction action driving stock into negative (to trigger conflict flag)
        SyncAction(
            client_action_id=f"act-{uuid.uuid4().hex}",
            action_type="stock_deducted",
            action_timestamp=datetime.now(timezone.utc),
            payload={
                "item_id": str(inv_item.id),
                "quantity": "10.000",  # Stock was 5.0 -> 5 - 10 = -5.0 (negative stock flag!)
            },
        ),
    ]

    # Ingest Batch
    results = await process_sync_actions_batch(db, outlet_id, actions)
    await db.commit()

    assert len(results) == 2
    assert results[0].status == "applied"
    assert results[1].status == "applied"

    # Idempotency Test: Ingest same batch again
    dup_results = await process_sync_actions_batch(db, outlet_id, actions)
    assert len(dup_results) == 2
    assert dup_results[0].status == "skipped"
    assert dup_results[1].status == "skipped"

    # Verify Negative Stock Conflict Flag was created
    conflicts_stmt = select(SyncConflictFlag).where(
        SyncConflictFlag.outlet_id == outlet_id,
        SyncConflictFlag.conflict_type == "negative_stock",
    )
    conflicts = (await db.execute(conflicts_stmt)).scalars().all()
    assert len(conflicts) == 1
    assert "went negative" in conflicts[0].description

    # Test Sync Status helper
    status_resp = await get_sync_status(db, outlet_id)
    assert status_resp.outlet_name == "Sync Action Test Outlet"
    assert status_resp.pending_conflict_count == 1
