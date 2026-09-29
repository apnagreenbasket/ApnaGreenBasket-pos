"""
Comprehensive tests for Forgot Password with Resend OTP,
cooldown timers, attempt invalidation, and 5-attempt account lockout.
"""

import json
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.security import hash_password
from app.models.enums import RoleEnum
from app.models.user import User


@pytest.mark.asyncio
async def test_forgot_password_full_flow_and_lockout(
    client: AsyncClient,
    db_session: AsyncSession,
):
    redis = await get_redis()
    test_email = "store.manager@apnagreenbasket.com"
    initial_password = "OldPassword123!"
    new_password = "NewStrongPassword456!"

    # Clean redis state for this email
    await redis.delete(
        f"login:failed:{test_email}",
        f"login:locked:{test_email}",
        f"pwd_reset:cooldown:{test_email}",
        f"pwd_reset:window:{test_email}",
        f"pwd_reset:otp:{test_email}",
    )

    # 1. Create active test user
    user = User(
        id=uuid.uuid4(),
        email=test_email,
        password_hash=hash_password(initial_password),
        name="Store Manager",
        role=RoleEnum.MANAGER,
        status="active",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # 2. Test Account Lockout: 5 consecutive wrong passwords
    for attempt in range(1, 5):
        resp = await client.post(
            "/api/auth/login",
            json={"email": test_email, "password": "WrongPassword!"},
        )
        assert resp.status_code == 401
        assert f"{5 - attempt} attempt" in resp.json()["detail"]

    # 5th failed attempt should lock account
    resp5 = await client.post(
        "/api/auth/login",
        json={"email": test_email, "password": "WrongPassword!"},
    )
    assert resp5.status_code == 423
    assert "locked for 15 minutes" in resp5.json()["detail"]

    # Subsequent login attempts with EVEN CORRECT password should be blocked
    blocked_resp = await client.post(
        "/api/auth/login",
        json={"email": test_email, "password": initial_password},
    )
    assert blocked_resp.status_code == 423
    assert "Account is locked" in blocked_resp.json()["detail"]

    # 3. Test OTP Request: Send OTP
    otp_req = await client.post(
        "/api/auth/forgot-password/request-otp",
        json={"email": test_email},
    )
    assert otp_req.status_code == 200
    data = otp_req.json()
    assert data["cooldown_seconds"] == 60
    assert data["email_masked"].startswith("s*")
    assert data["email_masked"].endswith("@apnagreenbasket.com")

    # 4. Test 1-Minute Cooldown: Immediate second request must be rejected (429)
    second_req = await client.post(
        "/api/auth/forgot-password/request-otp",
        json={"email": test_email},
    )
    assert second_req.status_code == 429
    assert "Please wait" in second_req.json()["detail"]

    # 5. Extract generated OTP directly from Redis
    otp_data_raw = await redis.get(f"pwd_reset:otp:{test_email}")
    assert otp_data_raw is not None
    otp_data = json.loads(otp_data_raw)
    stored_hash = otp_data["otp_hash"]

    # 6. Test OTP Anti-Brute-Force: 5 wrong attempts must invalidate the OTP
    # We simulate guessing wrong 6-digit codes
    for attempt in range(1, 5):
        wrong_otp_resp = await client.post(
            "/api/auth/forgot-password/reset-password",
            json={
                "email": test_email,
                "otp": "000000",
                "new_password": new_password,
            },
        )
        assert wrong_otp_resp.status_code == 400
        assert f"{5 - attempt} attempt" in wrong_otp_resp.json()["detail"]

    # 5th wrong attempt invalidates the OTP completely
    fifth_wrong = await client.post(
        "/api/auth/forgot-password/reset-password",
        json={
            "email": test_email,
            "otp": "000000",
            "new_password": new_password,
        },
    )
    assert fifth_wrong.status_code == 400
    assert "Too many incorrect attempts" in fifth_wrong.json()["detail"]

    # OTP key should now be deleted from Redis
    assert await redis.get(f"pwd_reset:otp:{test_email}") is None

    # 7. Request a new OTP after clearing cooldown
    await redis.delete(f"pwd_reset:cooldown:{test_email}")
    new_otp_req = await client.post(
        "/api/auth/forgot-password/request-otp",
        json={"email": test_email},
    )
    assert new_otp_req.status_code == 200

    # For testing verification, find the valid OTP matching the hash
    # Or generate a known OTP in redis
    import hashlib
    known_otp = "852963"
    known_hash = hashlib.sha256(known_otp.encode("utf-8")).hexdigest()
    await redis.set(
        f"pwd_reset:otp:{test_email}",
        json.dumps({"otp_hash": known_hash, "wrong_attempts": 0}),
        ex=900,
    )

    # 8. Reset password with valid OTP
    success_reset = await client.post(
        "/api/auth/forgot-password/reset-password",
        json={
            "email": test_email,
            "otp": known_otp,
            "new_password": new_password,
        },
    )
    assert success_reset.status_code == 200
    assert "Password has been successfully reset" in success_reset.json()["message"]

    # Verify audit log entry was written
    from app.models.audit_log import AuditLog
    from sqlalchemy import select
    audit_res = await db_session.execute(
        select(AuditLog).where(AuditLog.user_id == user.id, AuditLog.action == "PASSWORD_RESET_COMPLETED")
    )
    audit_record = audit_res.scalar_one_or_none()
    assert audit_record is not None
    assert "Reset password via OTP verification" in audit_record.description

    # 9. Verify Immediate Account Unlock: Account is now unlocked and can log in with new password!
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": test_email, "password": new_password},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

    # 10. Test Max 5 OTP requests per 15-min window
    # Set window count to 5
    await redis.set(f"pwd_reset:window:{test_email}", "5", ex=900)
    await redis.delete(f"pwd_reset:cooldown:{test_email}")
    exceeded_req = await client.post(
        "/api/auth/forgot-password/request-otp",
        json={"email": test_email},
    )
    assert exceeded_req.status_code == 429
    assert "reached the limit of 5" in exceeded_req.json()["detail"]


@pytest.mark.asyncio
async def test_non_existent_account_login_and_forgot_password(client: AsyncClient):
    """
    If an email is not registered in the system:
    1. Login endpoint returns 404 with detail 'Account does not exist.'
    2. Staff login endpoint returns 404 with detail 'Account does not exist.'
    3. Forgot password request-otp endpoint returns 404 with detail 'Account does not exist.'
    """
    fake_email = "nonexistent.user.12345@apnagreenbasket.com"

    # 1. Login with unregistered email
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": fake_email, "password": "AnyPassword123!"},
    )
    assert login_resp.status_code == 404
    assert login_resp.json()["detail"] == "Account does not exist."

    # 2. Staff login with unregistered email
    staff_resp = await client.post(
        "/api/staff/login",
        json={"email": fake_email, "password": "AnyPassword123!"},
    )
    assert staff_resp.status_code == 404
    assert staff_resp.json()["detail"] == "Account does not exist."

    # 3. Forgot password OTP request with unregistered email
    forgot_resp = await client.post(
        "/api/auth/forgot-password/request-otp",
        json={"email": fake_email},
    )
    assert forgot_resp.status_code == 404
    assert forgot_resp.json()["detail"] == "Account does not exist."

