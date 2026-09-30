"""
Tests for standalone staff PIN login endpoint (POST /api/staff/pin-login).
"""

import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PaymentModeEnum, RoleEnum
from app.models.outlet import Outlet
from app.models.user import User
from app.core.security import hash_password


@pytest.mark.asyncio
async def test_standalone_staff_pin_login_endpoint(client, db_session: AsyncSession):
    db = db_session
    outlet_id = uuid.uuid4()

    outlet = Outlet(
        id=outlet_id,
        name="PIN Login Test Outlet",
        slug=f"pin-login-{uuid.uuid4().hex[:6]}",
        payment_mode=PaymentModeEnum.PAY_AT_COUNTER,
    )
    db.add(outlet)

    # Create a Cashier user with a PIN in unified users table
    cashier = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name="Ramesh Cashier",
        email="ramesh@counter.com",
        role=RoleEnum.CASHIER,
        password_hash="pass_hash",
        pin_hash=hash_password("4321"),
        status="active",
    )
    db.add(cashier)
    await db.commit()

    # Call standalone PIN login endpoint (NO Auth bearer token needed!)
    resp = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(cashier.id), "pin": "4321"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["staff"]["name"] == "Ramesh Cashier"
    assert data["staff"]["role"] == RoleEnum.CASHIER.value

    # Test invalid PIN
    bad_resp = await client.post(
        "/api/staff/pin-login",
        json={"outlet_id": str(outlet_id), "staff_id": str(cashier.id), "pin": "9999"},
    )
    assert bad_resp.status_code == 401
    assert "Invalid staff PIN. 4 attempts remaining before account lockout." in bad_resp.json()["detail"]
