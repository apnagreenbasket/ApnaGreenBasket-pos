"""
Staff service — CRUD operations, password & PIN hashing/verification, role permissions mapping, and audit trail logging.
Operates on the unified User database model.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.enums import RoleEnum
from app.models.user import User
from app.models.staff_audit_log import StaffAuditLog
from app.schemas.staff import (
    RolePermissions,
    StaffCreate,
    StaffResponse,
    StaffUpdate,
)

# ------------------------------------------------------------------
# Fixed Role Permission Mapping Matrix
# ------------------------------------------------------------------
ROLE_PERMISSIONS_MAP: dict[RoleEnum, RolePermissions] = {
    RoleEnum.SUPERADMIN: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "billing", "menu", "staff", "analytics", "inventory", "customerservices", "settings", "qrcodes", "sessions"],
    ),
    RoleEnum.OUTLET_ADMIN: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=True,
        allowed_sidebar_tabs=["orders", "billing", "menu", "staff", "analytics", "inventory", "customerservices", "settings", "qrcodes", "sessions"],
    ),
    RoleEnum.MANAGER: RolePermissions(
        can_manage_staff=True,
        can_manage_billing=True,
        can_edit_menu=True,
        can_manage_inventory=True,
        can_cancel_orders=True,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders", "billing", "menu", "staff", "inventory", "sessions"],
    ),
    RoleEnum.CASHIER: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=True,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=True,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders", "billing", "sessions"],
    ),
    RoleEnum.FLOOR_STAFF: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=False,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders", "sessions"],
    ),
    RoleEnum.DELIVERY_BOY: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=False,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders", "sessions"],
    ),
    RoleEnum.STAFF: RolePermissions(
        can_manage_staff=False,
        can_manage_billing=False,
        can_edit_menu=False,
        can_manage_inventory=False,
        can_cancel_orders=False,
        can_process_payments=False,
        can_manage_orders=True,
        can_view_analytics=False,
        allowed_sidebar_tabs=["orders", "sessions"],
    ),
}

# ------------------------------------------------------------------
# Role Hierarchy & Management Permission Rules
# ------------------------------------------------------------------
ROLE_HIERARCHY: dict[RoleEnum, int] = {
    RoleEnum.SUPERADMIN: 100,
    RoleEnum.OUTLET_ADMIN: 50,
    RoleEnum.MANAGER: 30,
    RoleEnum.CASHIER: 10,
    RoleEnum.FLOOR_STAFF: 10,
    RoleEnum.DELIVERY_BOY: 10,
    RoleEnum.STAFF: 10,
}


def can_actor_manage_target_role(actor_role: RoleEnum | None, target_role: RoleEnum) -> bool:
    """
    Check if actor has authority to create, edit, activate, or deactivate target_role:
    - SUPERADMIN: Full cross-outlet authority.
    - OUTLET_ADMIN: Full outlet authority (can manage any outlet role, target != SUPERADMIN).
    - MANAGER: Strictly subordinate roles only (rank < MANAGER).
      Managers CANNOT create, update, activate, deactivate, or manage anyone with role >= MANAGER.
    - Others: No staff management permissions.
    """
    if not actor_role:
        return True
    if actor_role == RoleEnum.SUPERADMIN:
        return True
    if actor_role == RoleEnum.OUTLET_ADMIN:
        return target_role != RoleEnum.SUPERADMIN
    if actor_role == RoleEnum.MANAGER:
        return ROLE_HIERARCHY.get(target_role, 0) < ROLE_HIERARCHY[RoleEnum.MANAGER]
    return False


def get_permissions_for_role(role: RoleEnum) -> RolePermissions:
    """Return permissions object for a role."""
    return ROLE_PERMISSIONS_MAP.get(role, ROLE_PERMISSIONS_MAP[RoleEnum.STAFF])


def to_staff_response(user: User) -> StaffResponse:
    """Helper to convert User model to StaffResponse Pydantic schema."""
    return StaffResponse(
        id=user.id,
        outlet_id=user.outlet_id,
        name=user.name or (user.email.split("@")[0].title() if user.email else "Team Member"),
        email=user.email,
        phone=user.phone,
        role=user.role,
        status=user.status,
        has_pin=user.pin_hash is not None,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def create_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    data: StaffCreate,
    created_by_user_id: uuid.UUID | None = None,
    actor_role: RoleEnum | None = None,
) -> User:
    """Create a new staff member (User) for an outlet with role hierarchy check."""
    norm_email = data.email.lower().strip()

    # 1. Check actor role hierarchy (Managers cannot create Manager/Admin/Superadmin)
    if actor_role and not can_actor_manage_target_role(actor_role, data.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: You do not have permission to create staff with role '{data.role.value}'.",
        )

    # 2. Reject if email belongs to a SUPERADMIN
    superadmin_exists = await db.execute(
        select(User.id).where(User.email == norm_email, User.role == RoleEnum.SUPERADMIN)
    )
    if superadmin_exists.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email belongs to a Superadmin account and cannot be used for staff.",
        )

    # 3. Reject if email already exists in THIS outlet
    existing = await db.execute(
        select(User.id).where(
            User.email == norm_email,
            User.outlet_id == outlet_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{data.email}' already exists in this outlet.",
        )

    pwd_hash = hash_password(data.password)
    p_hash = hash_password(data.pin) if data.pin else None

    user = User(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=data.name.strip(),
        email=data.email.lower().strip(),
        phone=data.phone.strip() if data.phone else None,
        role=data.role,
        password_hash=pwd_hash,
        pin_hash=p_hash,
        is_active=True,
        status="active",
        created_by=created_by_user_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_created",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Created staff '{user.name}' with role {user.role.value}",
    )

    return user


async def update_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    data: StaffUpdate,
    actor_role: RoleEnum | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> User:
    """Update staff profile, role, or active status with privilege hierarchy enforcement."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if actor_role:
        if actor_user_id and actor_user_id == staff_id:
            # Self-update restrictions
            if data.role is not None and data.role != user.role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: Cannot change your own role.",
                )
            if data.status is not None and data.status != "active":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate your own account.",
                )
        else:
            if not can_actor_manage_target_role(actor_role, user.role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: You do not have permission to modify a staff member with role '{user.role.value}'.",
                )
            if data.role is not None and not can_actor_manage_target_role(actor_role, data.role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: You cannot assign the role '{data.role.value}'.",
                )
            if data.status is not None and not can_actor_manage_target_role(actor_role, user.role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: You cannot change the status of this staff member.",
                )

    if data.name is not None:
        user.name = data.name.strip()
    if data.email is not None:
        new_email = data.email.lower().strip()
        if new_email != user.email:
            superadmin_exists = await db.execute(
                select(User.id).where(User.email == new_email, User.role == RoleEnum.SUPERADMIN)
            )
            if superadmin_exists.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This email belongs to a Superadmin account and cannot be used for staff.",
                )
            existing = await db.execute(
                select(User.id).where(User.email == new_email, User.outlet_id == outlet_id, User.id != staff_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"User with email '{data.email}' already exists in this outlet.",
                )
            user.email = new_email
    if data.phone is not None:
        user.phone = data.phone.strip()
    if data.role is not None:
        user.role = data.role
    if data.status is not None:
        user.status = data.status
        user.is_active = (data.status == "active")

    await db.flush()
    await db.refresh(user)

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_updated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Updated staff '{user.name}'",
    )

    return user


async def activate_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    actor_role: RoleEnum | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> User:
    """Activate an inactive staff member."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if actor_role:
        if not can_actor_manage_target_role(actor_role, user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You do not have permission to activate a staff member with role '{user.role.value}'.",
            )

    user.status = "active"
    user.is_active = True
    await db.flush()
    await db.refresh(user)

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_activated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Activated staff '{user.name}' ({user.role.value})",
    )

    return user


async def deactivate_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    actor_role: RoleEnum | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> User:
    """Soft-delete/deactivate a staff member with role hierarchy check and punch clockout."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if actor_role:
        if actor_user_id and actor_user_id == staff_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account.",
            )
        if not can_actor_manage_target_role(actor_role, user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You do not have permission to deactivate a staff member with role '{user.role.value}'.",
            )

    user.status = "inactive"
    user.is_active = False

    # Auto clock-out any open punch sessions
    try:
        from datetime import timezone
        from app.core.datetime_utils import ensure_naive_utc
        from app.models.staff_punch_session import StaffPunchSession
        open_punches = await db.execute(
            select(StaffPunchSession).where(
                StaffPunchSession.staff_id == staff_id,
                StaffPunchSession.punch_out_at.is_(None),
            )
        )
        now = ensure_naive_utc(datetime.now(timezone.utc))
        for punch in open_punches.scalars().all():
            punch.punch_out_at = now
            punch.auto_punched_out = True
            punch.notes = ((punch.notes or "") + " [Auto-closed upon account deactivation]").strip()
            if punch.punch_in_at:
                punch_in_naive = ensure_naive_utc(punch.punch_in_at)
                punch.duration_seconds = max(0, int((now - punch_in_naive).total_seconds()))
    except Exception:
        pass

    await db.flush()
    await db.refresh(user)

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="staff_deactivated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Deactivated staff '{user.name}' ({user.role.value})",
    )

    return user


async def delete_staff_permanently(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    actor_role: RoleEnum | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> None:
    """Permanently delete a staff member. Allowed only for deactivated members by Outlet Admin or Superadmin."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if actor_role:
        if actor_role not in (RoleEnum.SUPERADMIN, RoleEnum.OUTLET_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Only an Outlet Admin or Superadmin can permanently delete staff members.",
            )
        if actor_user_id and actor_user_id == staff_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account.",
            )

    # 2-step safeguard: Must be deactivated first
    if user.is_active or user.status == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only deactivated staff members can be permanently deleted. Please deactivate the member first.",
        )

    user_name = user.name
    user_email = user.email

    await db.delete(user)
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=None,
        action_type="staff_permanently_deleted",
        reference_type="User",
        reference_id=str(staff_id),
        details=f"Permanently deleted staff '{user_name}' ({user_email})",
    )


async def set_staff_pin(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    pin: str,
    actor_role: RoleEnum | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> None:
    """Set or update 4-digit PIN for a staff member with role hierarchy check."""
    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff member not found.",
        )

    if actor_role and actor_user_id and actor_user_id != staff_id:
        if not can_actor_manage_target_role(actor_role, user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You do not have permission to set PIN for a staff member with role '{user.role.value}'.",
            )

    user.pin_hash = hash_password(pin)
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=user.id,
        action_type="pin_updated",
        reference_type="User",
        reference_id=str(user.id),
        details=f"Updated PIN for staff '{user.name}'",
    )


async def authenticate_staff_email(
    db: AsyncSession,
    email: str,
    password: str,
    outlet_id: uuid.UUID | None = None,
) -> User:
    """Authenticate staff via email and password."""
    clean_email = email.lower().strip()

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

    stmt = select(User).where(func.lower(User.email) == clean_email)
    if outlet_id:
        stmt = stmt.where(User.outlet_id == outlet_id)
    res = await db.execute(stmt)
    matching_users = res.scalars().all()
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

    if not user.is_active or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )

    if not verify_password(password, user.password_hash):
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

    await clear_failed_logins(clean_email)
    return user


async def authenticate_staff_pin(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    pin: str,
) -> User:
    """Authenticate staff via PIN on a shared outlet device."""
    from app.services.password_reset_service import (
        check_account_locked,
        clear_failed_logins,
        record_failed_login,
    )

    res = await db.execute(
        select(User).where(
            User.id == staff_id,
            User.outlet_id == outlet_id,
            User.is_active == True,
            User.status == "active",
        )
    )
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid staff PIN.",
        )

    clean_email = user.email.strip().lower()

    # 1. Check if account is locked
    is_locked, remaining_seconds = await check_account_locked(clean_email)
    if is_locked:
        mins = max(1, remaining_seconds // 60)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account is locked due to 5 failed login attempts. Please check your email for the instant unlock link, wait {mins} minute(s), or reset your password using Forgot Password.",
        )

    if not user.pin_hash or not verify_password(pin, user.pin_hash):
        is_now_locked, remaining_attempts, _ = await record_failed_login(clean_email)
        if is_now_locked:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account has been locked for 15 minutes due to 5 consecutive failed attempts. An instant unlock link has been sent to your email to unlock immediately, or you can wait 15 minutes / reset your password.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid staff PIN. {remaining_attempts} attempt{'s' if remaining_attempts != 1 else ''} remaining before account lockout.",
        )

    await clear_failed_logins(clean_email)
    return user


async def authenticate_staff_pin_standalone(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    pin: str,
) -> User:
    """Authenticate staff on an outlet device by PIN alone."""
    res = await db.execute(
        select(User).where(
            User.outlet_id == outlet_id,
            User.is_active == True,
            User.status == "active",
            User.pin_hash.isnot(None),
        )
    )
    users_list = res.scalars().all()
    for u in users_list:
        if u.pin_hash and verify_password(pin, u.pin_hash):
            return u

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials.",
    )


async def create_staff_audit_log(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID | None,
    action_type: str,
    reference_type: str | None = None,
    reference_id: str | None = None,
    details: str | None = None,
) -> StaffAuditLog:
    """Write an entry to staff_audit_log."""
    log_entry = StaffAuditLog(
        id=uuid.uuid4(),
        staff_id=staff_id,
        outlet_id=outlet_id,
        action_type=action_type,
        reference_type=reference_type,
        reference_id=reference_id,
        details=details,
    )
    db.add(log_entry)
    await db.flush()
    return log_entry
