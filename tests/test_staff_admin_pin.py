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


@pytest.mark.asyncio
async def test_unset_staff_pin_and_public_dropdown_filtering(client, db_session: AsyncSession):
    """
    Test:
    1. Public /api/public/outlets/{outlet_id}/staff only returns staff with pin_hash.
    2. Admin can delete/unset staff PIN via DELETE /api/staff/{staff_id}/pin.
    3. Once unset, user immediately disappears from the public PIN dropdown.
    """
    from app.core.security import create_access_token, hash_password

    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="PIN Filter Outlet",
        slug=f"pin-filter-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    admin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Admin Priya",
        email=f"priya-{uuid.uuid4().hex[:4]}@store.com",
        role=RoleEnum.OUTLET_ADMIN,
        password_hash=hash_password("adminpass123"),
        status="active",
    )
    cashier_with_pin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Cashier Rahul",
        email=f"rahul-{uuid.uuid4().hex[:4]}@store.com",
        role=RoleEnum.CASHIER,
        password_hash=hash_password("cashierpass123"),
        pin_hash=hash_password("1122"),
        status="active",
    )
    staff_without_pin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Staff Rahul",
        email=f"staffrahul-{uuid.uuid4().hex[:4]}@store.com",
        role=RoleEnum.STAFF,
        password_hash=hash_password("staffpass123"),
        pin_hash=None,
        status="active",
    )
    db.add_all([admin, cashier_with_pin, staff_without_pin])
    await db.commit()

    token = create_access_token(user_id=admin.id, outlet_id=outlet_id, role=admin.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Check public endpoint: ONLY Cashier Rahul (who has pin_hash) should be returned!
    pub_resp = await client.get(f"/api/public/outlets/{outlet_id}/staff")
    assert pub_resp.status_code == 200
    pub_staff = pub_resp.json()
    assert len(pub_staff) == 1
    assert pub_staff[0]["name"] == "Cashier Rahul"
    assert pub_staff[0]["role"] == RoleEnum.CASHIER.value
    # Staff without PIN and Admin without PIN must NOT be in the public PIN dropdown
    assert not any(s["name"] == "Staff Rahul" for s in pub_staff)
    assert not any(s["name"] == "Admin Priya" for s in pub_staff)

    # 2. Admin unsets Cashier Rahul's PIN via DELETE /api/staff/{staff_id}/pin
    del_resp = await client.delete(f"/api/staff/{cashier_with_pin.id}/pin", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["message"] == "Staff PIN removed successfully"

    # Verify pin_hash is now None in DB
    await db.refresh(cashier_with_pin)
    assert cashier_with_pin.pin_hash is None

    # 3. Public endpoint now returns empty list since no staff has PIN
    pub_resp_after = await client.get(f"/api/public/outlets/{outlet_id}/staff")
    assert pub_resp_after.status_code == 200
    assert len(pub_resp_after.json()) == 0


@pytest.mark.asyncio
async def test_edit_staff_set_and_unset_pin(client, db_session: AsyncSession):
    """
    Test setting, preserving, and clearing PIN via PUT /api/staff/{staff_id}:
    - Setting new PIN (4 digits)
    - Preserving PIN when '••••' is sent
    - Unsetting PIN when empty string '' is sent
    """
    from app.core.security import create_access_token, hash_password

    db = db_session
    outlet_id = uuid.uuid4()
    outlet = Outlet(
        id=outlet_id,
        name="Edit PIN Outlet",
        slug=f"edit-pin-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    admin = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Admin Boss",
        email=f"boss-{uuid.uuid4().hex[:4]}@store.com",
        role=RoleEnum.OUTLET_ADMIN,
        password_hash=hash_password("adminpass123"),
        status="active",
    )
    member = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Team Member",
        email=f"member-{uuid.uuid4().hex[:4]}@store.com",
        role=RoleEnum.STAFF,
        password_hash=hash_password("memberpass123"),
        pin_hash=None,
        status="active",
    )
    db.add_all([admin, member])
    await db.commit()

    token = create_access_token(user_id=admin.id, outlet_id=outlet_id, role=admin.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Edit member to set PIN = "7788"
    resp1 = await client.put(
        f"/api/staff/{member.id}",
        json={"name": "Team Member", "pin": "7788"},
        headers=headers,
    )
    assert resp1.status_code == 200, resp1.text
    data1 = resp1.json()
    assert data1["has_pin"] is True

    # Authenticate with the new PIN
    auth_resp = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(member.id), "pin": "7788"},
    )
    assert auth_resp.status_code == 200

    # 2. Edit member but keep masked '••••' -> PIN preserved
    resp2 = await client.put(
        f"/api/staff/{member.id}",
        json={"name": "Team Member Renamed", "pin": "••••"},
        headers=headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["has_pin"] is True
    # Still authenticates with 7788
    auth_resp2 = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(member.id), "pin": "7788"},
    )
    assert auth_resp2.status_code == 200

    # 3. Edit member and clear PIN (empty string '') -> PIN unset!
    resp3 = await client.put(
        f"/api/staff/{member.id}",
        json={"name": "Team Member Renamed", "pin": ""},
        headers=headers,
    )
    assert resp3.status_code == 200
    assert resp3.json()["has_pin"] is False

    # Verify PIN login now fails because PIN is removed
    auth_resp3 = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(member.id), "pin": "7788"},
    )
    assert auth_resp3.status_code == 401


