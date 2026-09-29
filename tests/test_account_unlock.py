"""
Tests for Instant Account Unlock via Email Token (Anti-Lockout Protection).
"""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.security import hash_password
from app.models.enums import RoleEnum
from app.models.user import User


@pytest.mark.asyncio
async def test_lockout_generates_unlock_token_and_unlocks_account(
    client: AsyncClient,
    db_session: AsyncSession,
):
    redis = await get_redis()
    test_email = "owner.unlock@apnagreenbasket.com"
    correct_password = "CorrectStrongPassword123!"

    # Clean redis state for this email
    await redis.delete(
        f"login:failed:{test_email}",
        f"login:locked:{test_email}",
        f"login:user_unlock_token:{test_email}",
        f"pwd_reset:window:{test_email}",
        f"pwd_reset:cooldown:{test_email}",
        f"pwd_reset:otp:{test_email}",
    )

    # 1. Create active test user
    user = User(
        id=uuid.uuid4(),
        email=test_email,
        password_hash=hash_password(correct_password),
        name="Owner User",
        role=RoleEnum.OUTLET_ADMIN,
        status="active",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # 2. Trigger 5 consecutive failed login attempts
    for attempt in range(1, 5):
        resp = await client.post(
            "/api/auth/login",
            json={"email": test_email, "password": "WrongPassword!"},
        )
        assert resp.status_code == 401
        assert f"{5 - attempt} attempt" in resp.json()["detail"]

    # 5th attempt locks account and returns HTTP 423
    resp5 = await client.post(
        "/api/auth/login",
        json={"email": test_email, "password": "WrongPassword!"},
    )
    assert resp5.status_code == 423
    assert "locked for 15 minutes" in resp5.json()["detail"]
    assert "instant unlock link" in resp5.json()["detail"]

    # 3. Verify unlock token was generated in Redis
    token = await redis.get(f"login:user_unlock_token:{test_email}")
    assert token is not None
    token_email = await redis.get(f"login:unlock_token:{token}")
    assert token_email == test_email

    # 4. Attempting to log in with EVEN CORRECT password must be blocked while locked
    blocked_resp = await client.post(
        "/api/auth/login",
        json={"email": test_email, "password": correct_password},
    )
    assert blocked_resp.status_code == 423
    assert "Account is locked" in blocked_resp.json()["detail"]

    # 5. Use the Instant Unlock token
    unlock_resp = await client.post(
        "/api/auth/unlock-account",
        json={"token": token},
    )
    assert unlock_resp.status_code == 200
    assert "unlocked successfully" in unlock_resp.json()["message"]

    # 6. Verify token is single-use and cannot be replayed
    replay_resp = await client.post(
        "/api/auth/unlock-account",
        json={"token": token},
    )
    assert replay_resp.status_code == 400
    assert "invalid or has already expired" in replay_resp.json()["detail"]

    # 7. Verify user can log in IMMEDIATELY without waiting 15 minutes
    success_resp = await client.post(
        "/api/auth/login",
        json={"email": test_email, "password": correct_password},
    )
    assert success_resp.status_code == 200
    assert "access_token" in success_resp.json()


@pytest.mark.asyncio
async def test_resend_unlock_email_and_cooldown(
    client: AsyncClient,
    db_session: AsyncSession,
):
    redis = await get_redis()
    test_email = "resend.test@apnagreenbasket.com"
    correct_password = "Password12345!"

    await redis.delete(
        f"login:failed:{test_email}",
        f"login:locked:{test_email}",
        f"login:unlock_cooldown:{test_email}",
        f"login:user_unlock_token:{test_email}",
    )

    user = User(
        id=uuid.uuid4(),
        email=test_email,
        password_hash=hash_password(correct_password),
        name="Resend Tester",
        role=RoleEnum.STAFF,
        status="active",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # If account is not locked, resend returns a generic message without error
    resp_unlocked = await client.post(
        "/api/auth/resend-unlock-email",
        json={"email": test_email},
    )
    assert resp_unlocked.status_code == 200

    # Lock account
    for _ in range(5):
        await client.post(
            "/api/auth/login",
            json={"email": test_email, "password": "WrongPassword!"},
        )

    # Clear cooldown that was set during initial lockout for testing resend
    await redis.delete(f"login:unlock_cooldown:{test_email}")

    # Now request resend
    resend_resp = await client.post(
        "/api/auth/resend-unlock-email",
        json={"email": test_email},
    )
    assert resend_resp.status_code == 200
    assert "unlock link has been sent" in resend_resp.json()["message"]

    # Immediate second request should hit 60-second cooldown (429)
    cooldown_resp = await client.post(
        "/api/auth/resend-unlock-email",
        json={"email": test_email},
    )
    assert cooldown_resp.status_code == 429
    assert "Please wait" in cooldown_resp.json()["detail"]
