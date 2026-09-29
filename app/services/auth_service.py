"""
Auth service — registration, login, token refresh, logout.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.enums import RoleEnum
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

#Superadmin
async def register_user(
    db: AsyncSession,
    data: RegisterRequest,
) -> User:
    """Register a new user (default role: OUTLET_ADMIN if first, else STAFF)."""
    norm_email = data.email.lower().strip()

    if data.role == RoleEnum.SUPERADMIN:
        existing = await db.execute(select(User.id).where(User.email == norm_email))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User with email '{data.email}' already exists",
            )
    else:
        # Check if email is already taken by a SUPERADMIN
        superadmin_exists = await db.execute(
            select(User.id).where(User.email == norm_email, User.role == RoleEnum.SUPERADMIN)
        )
        if superadmin_exists.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email belongs to a Superadmin account and cannot be reused for an outlet.",
            )

        # Check if email is already taken in this specific outlet
        if data.outlet_id:
            existing = await db.execute(
                select(User.id).where(User.email == norm_email, User.outlet_id == data.outlet_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A user with email '{data.email}' already exists in this outlet.",
                )

    user = User(
        id=uuid.uuid4(),
        email=norm_email,
        password_hash=hash_password(data.password),
        name=data.name.strip() if data.name else (data.email.split("@")[0].title() if data.email else "Team Member"),
        phone=data.phone.strip() if data.phone else None,
        pin_hash=hash_password(data.pin) if data.pin else None,
        outlet_id=data.outlet_id,
        role=data.role,
        status="active",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user

#User
async def login_user(
    db: AsyncSession,
    data: LoginRequest,
) -> TokenResponse:
    """Authenticate user with email and password, issue tokens."""
    clean_email = data.email.strip().lower()

    # 1. Check if account is locked due to 5 failed attempts
    from app.services.password_reset_service import (
        check_account_locked,
        clear_failed_logins,
        record_failed_login,
    )

    is_locked, remaining_seconds = await check_account_locked(clean_email)
    if is_locked:
        mins = max(1, remaining_seconds // 60)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account is locked due to 5 failed login attempts. Please check your email for the instant unlock link, wait {mins} minute(s), or reset your password using Forgot Password.",
        )

    if data.outlet_id:
        result = await db.execute(
            select(User).where(func.lower(User.email) == clean_email, User.outlet_id == data.outlet_id)
        )
        user = result.scalar_one_or_none()
    else:
        # Check if a SUPERADMIN user exists with this email first
        superadmin_res = await db.execute(
            select(User).where(func.lower(User.email) == clean_email, User.role == RoleEnum.SUPERADMIN)
        )
        user = superadmin_res.scalar_one_or_none()

        if not user:
            users_res = await db.execute(
                select(User).where(func.lower(User.email) == clean_email, User.is_active == True)
            )
            matching_users = users_res.scalars().all()
            if len(matching_users) == 1:
                user = matching_users[0]
            elif len(matching_users) > 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Multiple accounts found for this email. Please select your store outlet to log in.",
                )
            else:
                user = None

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account does not exist.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    if not verify_password(data.password, user.password_hash):
        is_now_locked, remaining_attempts, _ = await record_failed_login(clean_email)
        if is_now_locked:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account has been locked for 15 minutes due to 5 consecutive failed attempts. An instant unlock link has been sent to your email to unlock immediately, or you can wait 15 minutes / reset your password.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid credentials. {remaining_attempts} attempt{'s' if remaining_attempts != 1 else ''} remaining before account lockout.",
        )

    # Clear failed login attempts on successful authentication
    await clear_failed_logins(clean_email)

    access_token = create_access_token(
        user_id=user.id,
        outlet_id=user.outlet_id,
        role=user.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        outlet_id=user.outlet_id,
        role=user.role.value,
    )

    # Store refresh token hash
    user.refresh_token_hash = hash_token(refresh_token)
    await db.flush()
    await db.refresh(user)

    from app.services.staff_service import to_staff_response
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role.value,
        user=to_staff_response(user),
    )

#User and Staff
async def refresh_tokens(
    db: AsyncSession,
    refresh_token: str,
) -> TokenResponse:
    """
    Rotate refresh token — issue new access + refresh, invalidate the old one.
    Handles both User and Staff accounts gracefully.
    """
    try:
        payload = decode_token(refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — expected refresh token",
        )

    user_id = uuid.UUID(payload["sub"])

    # Check User table first, then Staff table
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    staff = None
    if not user:
        result_staff = await db.execute(select(Staff).where(Staff.id == user_id))
        staff = result_staff.scalar_one_or_none()

    if not user and not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    if user and not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    if staff and staff.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff account is inactive",
        )

    target_entity = user if user else staff
    assert target_entity is not None

    # Verify refresh token hash matches stored hash
    incoming_hash = hash_token(refresh_token)
    if target_entity.refresh_token_hash != incoming_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked refresh token",
        )

    target_role = target_entity.role.value
    target_outlet_id = target_entity.outlet_id

    # Issue new tokens
    new_access = create_access_token(
        user_id=user_id,
        outlet_id=target_outlet_id,
        role=target_role,
    )
    new_refresh = create_refresh_token(
        user_id=user_id,
        outlet_id=target_outlet_id,
        role=target_role,
    )

    target_entity.refresh_token_hash = hash_token(new_refresh)
    await db.flush()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        role=target_role,
    )

#User and Staff
async def logout_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    """Revoke refresh token on logout (User or Staff)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user:
        user.refresh_token_hash = None
        await db.flush()
        return

    result_staff = await db.execute(select(Staff).where(Staff.id == user_id))
    staff = result_staff.scalar_one_or_none()
    if staff:
        staff.refresh_token_hash = None
        await db.flush()
