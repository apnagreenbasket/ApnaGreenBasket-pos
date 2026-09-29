"""
Staff punch-in / punch-out service for shift management, data isolation, and audit tracking.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import ensure_naive_utc, utc_now
from app.models.enums import RoleEnum
from app.models.staff_punch_session import StaffPunchSession
from app.services.staff_service import create_staff_audit_log

MAX_SHIFT_DURATION_HOURS = 12
MAX_SHIFT_DURATION_SECONDS = MAX_SHIFT_DURATION_HOURS * 3600

# Roles exempt from mandatory shift punch-in
EXEMPT_ROLES = {
    RoleEnum.SUPERADMIN,
    RoleEnum.OUTLET_ADMIN,
    RoleEnum.MANAGER,
}


def is_role_exempt(role: RoleEnum | str | None) -> bool:
    """Check if a staff role is exempt from mandatory shift punch-in."""
    if not role:
        return False
    if isinstance(role, str):
        role_str = role.strip().upper()
        return role_str in ("SUPERADMIN", "OUTLET_ADMIN", "MANAGER")
    return role in EXEMPT_ROLES


def format_duration(seconds: int) -> str:
    """Format duration in seconds into human-readable string like '4h 15m 30s'."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0 or hours > 0:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


async def get_active_punch_session(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
) -> StaffPunchSession | None:
    """
    Get the active punch session for a staff member in an outlet.
    If the session is open but exceeds 12 hours, it is automatically marked
    as auto-punched out and closed.
    """
    stmt = (
        select(StaffPunchSession)
        .where(
            StaffPunchSession.outlet_id == outlet_id,
            StaffPunchSession.staff_id == staff_id,
            StaffPunchSession.punch_out_at.is_(None),
        )
        .order_by(StaffPunchSession.punch_in_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        return None

    now = utc_now()
    punch_in_naive = ensure_naive_utc(session.punch_in_at)
    elapsed_seconds = int((now - punch_in_naive).total_seconds())

    # Auto-expire if >= 12 hours
    if elapsed_seconds >= MAX_SHIFT_DURATION_SECONDS:
        session.punch_out_at = punch_in_naive + timedelta(hours=MAX_SHIFT_DURATION_HOURS)
        session.auto_punched_out = True
        session.duration_seconds = MAX_SHIFT_DURATION_SECONDS
        session.updated_at = now

        await create_staff_audit_log(
            db,
            outlet_id=outlet_id,
            staff_id=staff_id,
            action_type="punch_out",
            reference_type="StaffPunchSession",
            reference_id=str(session.id),
            details="Auto punched-out after 12 hours shift limit reached",
        )
        await db.commit()
        return None

    return session


async def punch_in_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    staff_name: str,
) -> StaffPunchSession:
    """
    Punch in a staff member for a new shift.
    If an active session already exists within 12 hours, return it.
    Otherwise create a new punch session and log the punch-in audit action.
    """
    active = await get_active_punch_session(db, outlet_id, staff_id)
    if active:
        return active

    now = utc_now()
    session = StaffPunchSession(
        id=uuid.uuid4(),
        staff_id=staff_id,
        outlet_id=outlet_id,
        punch_in_at=now,
        auto_punched_out=False,
    )
    db.add(session)
    await db.flush()

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=staff_id,
        action_type="punch_in",
        reference_type="StaffPunchSession",
        reference_id=str(session.id),
        details=f"Staff '{staff_name}' punched in for shift",
    )
    await db.commit()
    await db.refresh(session)
    return session


async def punch_out_staff(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    staff_id: uuid.UUID,
    staff_name: str,
    notes: str | None = None,
) -> tuple[StaffPunchSession | None, str | None]:
    """
    Punch out an active staff member, calculating duration and recording audit action.
    Returns (session, elapsed_duration_str).
    """
    active = await get_active_punch_session(db, outlet_id, staff_id)
    if not active:
        return None, None

    now = utc_now()
    punch_in_naive = ensure_naive_utc(active.punch_in_at)
    duration_sec = max(0, int((now - punch_in_naive).total_seconds()))
    duration_str = format_duration(duration_sec)

    active.punch_out_at = now
    active.duration_seconds = duration_sec
    active.auto_punched_out = False
    if notes:
        active.notes = notes
    active.updated_at = now

    await create_staff_audit_log(
        db,
        outlet_id=outlet_id,
        staff_id=staff_id,
        action_type="punch_out",
        reference_type="StaffPunchSession",
        reference_id=str(active.id),
        details=f"Staff '{staff_name}' punched out. Elapsed shift time: {duration_str}",
    )
    await db.commit()
    await db.refresh(active)
    return active, duration_str


async def get_shift_lower_bound_for_user(
    db: AsyncSession,
    current_user: any,
) -> datetime | None:
    """
    Determine the minimum timestamp cutoff for querying records based on staff shift.
    - If user is exempt (Admin, Superadmin, Manager): returns None (no shift cutoff).
    - If user is non-exempt: returns the active punch_in_at datetime.
    - If user is non-exempt but has NO active punch session: returns datetime.max (effectively 0 records).
    """
    if is_role_exempt(getattr(current_user, "role", None)):
        return None

    outlet_id = getattr(current_user, "outlet_id", None)
    user_id = getattr(current_user, "user_id", None)
    if not outlet_id or not user_id:
        return None

    session = await get_active_punch_session(db, outlet_id, user_id)
    if session:
        return ensure_naive_utc(session.punch_in_at)

    # Not punched in: return far future so no records match
    return datetime(9999, 12, 31, 23, 59, 59)
