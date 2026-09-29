"""
Tests for Admin User POS PIN creation and PIN authentication on unified User model.
"""

import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.user import User
from app.services.staff_service import set_staff_pin, authenticate_staff_pin
from app.services.sync_service import generate_outlet_snapshot


@pytest.mark.asyncio
async def test_admin_pin_auto_creation_and_snapshot_inclusion(db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()

    outlet = Outlet(
        id=outlet_id,
        name="Admin PIN Test Outlet",
        slug=f"admin-pin-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    # Create an Admin User in unified users table
    admin_user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Owner Admin",
        role=RoleEnum.OUTLET_ADMIN,
        email="owner@store.com",
        password_hash="secret_pass_hash",
        status="active",
    )
    db.add(admin_user)
    await db.commit()

    # Admin sets their 4-digit POS PIN via set_staff_pin
    await set_staff_pin(db, outlet_id, admin_user.id, "1234")
    await db.commit()

    # Verify that the Admin user has pin_hash updated directly
    res = await db.execute(select(User).where(User.email == "owner@store.com"))
    updated_user = res.scalar_one_or_none()
    assert updated_user is not None
    assert updated_user.role == RoleEnum.OUTLET_ADMIN
    assert updated_user.pin_hash is not None

    # Verify Admin staff member can authenticate via PIN
    staff_obj = await authenticate_staff_pin(db, outlet_id, updated_user.id, "1234")
    assert staff_obj.name == "Owner Admin"
    assert staff_obj.email == "owner@store.com"

    # Verify the Admin record is included in the outlet snapshot with pin_hash
    snap = await generate_outlet_snapshot(db, outlet_id, since=None)
    assert len(snap.staff) == 1
    assert snap.staff[0].name == "Owner Admin"
    assert snap.staff[0].pin_hash is not None
    assert snap.staff[0].role == RoleEnum.OUTLET_ADMIN.value
