"""
Staff management FastAPI router — CRUD, PIN setup, login, PIN quick-switch, permissions, and audit trail.
Operates on the unified User database model.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.security import create_access_token, create_refresh_token, hash_token
from app.dependencies import (
    AuthenticatedUser,
    DBSession,
    RequireAdmin,
    RequireSuperadmin,
    require_permission,
    outlet_scoped_query,
)
from app.models.enums import RoleEnum
from app.models.user import User
from app.models.staff_audit_log import StaffAuditLog
from app.schemas.staff import (
    RolePermissions,
    SetPinRequest,
    StaffAuditLogPageResponse,
    StaffAuditLogResponse,
    StaffContextTokenResponse,
    StaffCreate,
    StaffLoginRequest,
    StaffLoginResponse,
    StaffPinLoginRequest,
    StaffPinSwitchRequest,
    StaffPunchOutRequest,
    StaffPunchStatusResponse,
    StaffResponse,
    StaffUpdate,
)
from app.services.staff_punch_service import (
    MAX_SHIFT_DURATION_SECONDS,
    get_active_punch_session,
    is_role_exempt,
    punch_in_staff,
    punch_out_staff,
)
from app.services.staff_service import (
    activate_staff,
    authenticate_staff_email,
    authenticate_staff_pin,
    authenticate_staff_pin_standalone,
    create_staff,
    create_staff_audit_log,
    deactivate_staff,
    delete_staff_permanently,
    get_permissions_for_role,
    set_staff_pin,
    to_staff_response,
    update_staff,
)

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
async def create_staff_endpoint(
    data: StaffCreate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Create a new staff member (Admin: own outlet; Superadmin: specified outlet)."""
    target_outlet_id = data.outlet_id or current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="outlet_id is required",
        )

    # Superadmin or Admin only
    if current_user.role != RoleEnum.SUPERADMIN and target_outlet_id != current_user.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot create staff for another outlet",
        )

    staff = await create_staff(
        db,
        target_outlet_id,
        data,
        created_by_user_id=current_user.user_id,
        actor_role=current_user.role,
    )
    return to_staff_response(staff)


@router.get("/me", response_model=StaffResponse)
async def get_my_profile_endpoint(
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Fetch profile info of currently logged in user/staff member."""
    user = await db.get(User, current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found")
    return to_staff_response(user)


@router.get("", response_model=list[StaffResponse])
async def list_staff_endpoint(
    current_user: AuthenticatedUser,
    db: DBSession,
    outlet_id: uuid.UUID | None = None,
):
    """List staff for an outlet (Admin: own outlet; Superadmin: filterable)."""
    target_outlet_id = outlet_id or current_user.outlet_id

    stmt = select(User).where(User.role != RoleEnum.SUPERADMIN)
    stmt = outlet_scoped_query(stmt, User, target_outlet_id, current_user)
    stmt = stmt.order_by(User.name)

    result = await db.execute(stmt)
    staff_list = result.scalars().all()
    return [to_staff_response(s) for s in staff_list]


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff_endpoint(
    staff_id: uuid.UUID,
    data: StaffUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update staff details, role, or status with role hierarchy check."""
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(User).where(User.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    staff = await update_staff(
        db,
        target_outlet_id,
        staff_id,
        data,
        actor_role=current_user.role,
        actor_user_id=current_user.user_id,
    )
    return to_staff_response(staff)


@router.post("/{staff_id}/activate", response_model=StaffResponse)
async def activate_staff_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Activate an inactive staff member."""
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(User).where(User.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    staff = await activate_staff(
        db,
        target_outlet_id,
        staff_id,
        actor_role=current_user.role,
        actor_user_id=current_user.user_id,
    )
    return to_staff_response(staff)


@router.post("/{staff_id}/deactivate", response_model=StaffResponse)
async def deactivate_staff_post_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Deactivate an active staff member."""
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(User).where(User.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    staff = await deactivate_staff(
        db,
        target_outlet_id,
        staff_id,
        actor_role=current_user.role,
        actor_user_id=current_user.user_id,
    )
    return to_staff_response(staff)


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff_endpoint(
    staff_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
    permanent: bool = Query(False),
):
    """
    Deactivate or permanently delete a staff member.
    If permanent=True: Permanently deletes the staff member (requires OUTLET_ADMIN/SUPERADMIN and member must be deactivated).
    If permanent=False: Deactivates the staff member.
    """
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(User).where(User.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    if permanent:
        await delete_staff_permanently(
            db,
            target_outlet_id,
            staff_id,
            actor_role=current_user.role,
            actor_user_id=current_user.user_id,
        )
    else:
        await deactivate_staff(
            db,
            target_outlet_id,
            staff_id,
            actor_role=current_user.role,
            actor_user_id=current_user.user_id,
        )


@router.post("/{staff_id}/set-pin", status_code=status.HTTP_200_OK)
async def set_staff_pin_endpoint(
    staff_id: uuid.UUID,
    data: SetPinRequest,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Admin/Superadmin sets a staff member's 4-digit PIN."""
    target_outlet_id = current_user.outlet_id
    if current_user.role == RoleEnum.SUPERADMIN:
        res = await db.execute(select(User).where(User.id == staff_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Staff member not found")
        target_outlet_id = s.outlet_id

    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    await set_staff_pin(
        db,
        target_outlet_id,
        staff_id,
        data.pin,
        actor_role=current_user.role,
        actor_user_id=current_user.user_id,
    )
    return {"message": "Staff PIN set successfully"}


@router.post("/set-my-pin", status_code=status.HTTP_200_OK)
async def set_my_pin_endpoint(
    data: SetPinRequest,
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Staff member sets their own PIN."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    await set_staff_pin(db, current_user.outlet_id, current_user.user_id, data.pin)
    return {"message": "Your PIN has been updated successfully"}


@router.post("/login", response_model=StaffLoginResponse)
async def staff_login_endpoint(
    data: StaffLoginRequest,
    db: DBSession,
):
    """Staff login via email and password."""
    staff = await authenticate_staff_email(db, data.email, data.password, data.outlet_id)

    access_token = create_access_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )

    staff.refresh_token_hash = hash_token(refresh_token)
    await db.flush()
    await db.refresh(staff)

    await create_staff_audit_log(
        db,
        outlet_id=staff.outlet_id,
        staff_id=staff.id,
        action_type="staff_logged_in",
        reference_type="User",
        reference_id=str(staff.id),
        details=f"Staff '{staff.name}' logged in via email/password",
    )

    return StaffLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        staff=to_staff_response(staff),
    )


@router.post("/pin-login", response_model=StaffLoginResponse)
async def staff_pin_login_endpoint(
    data: StaffPinLoginRequest,
    db: DBSession,
):
    """Standalone staff login via outlet_id, optional staff_id, and 4-digit PIN."""
    if data.staff_id:
        staff = await authenticate_staff_pin(db, data.outlet_id, data.staff_id, data.pin)
    else:
        staff = await authenticate_staff_pin_standalone(db, data.outlet_id, data.pin)

    access_token = create_access_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )

    staff.refresh_token_hash = hash_token(refresh_token)
    await db.flush()
    await db.refresh(staff)

    await create_staff_audit_log(
        db,
        outlet_id=staff.outlet_id,
        staff_id=staff.id,
        action_type="staff_pin_logged_in",
        reference_type="User",
        reference_id=str(staff.id),
        details=f"Staff '{staff.name}' logged in via PIN",
    )

    return StaffLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        staff=to_staff_response(staff),
    )


@router.post("/pin-switch", response_model=StaffContextTokenResponse)
async def pin_switch_endpoint(
    data: StaffPinSwitchRequest,
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """
    PIN Quick-Switch on a shared counter/kitchen device.
    Verifies staff PIN and returns a short-lived Staff Context Token layered on the device session.
    """
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active outlet session required for PIN quick-switch",
        )

    staff = await authenticate_staff_pin(
        db, target_outlet_id, data.staff_id, data.pin
    )

    staff_context_token = create_access_token(
        user_id=staff.id,
        outlet_id=staff.outlet_id,
        role=staff.role.value,
    )

    await create_staff_audit_log(
        db,
        outlet_id=staff.outlet_id,
        staff_id=staff.id,
        action_type="pin_quick_switch",
        reference_type="User",
        reference_id=str(staff.id),
        details=f"Switched active staff to '{staff.name}' via PIN",
    )

    return StaffContextTokenResponse(
        staff_context_token=staff_context_token,
        active_staff=to_staff_response(staff),
    )


@router.get("/permissions", response_model=RolePermissions)
async def get_permissions_endpoint(
    current_user: AuthenticatedUser,
):
    """Fetch role -> permission matrix for current user."""
    return get_permissions_for_role(current_user.role)


@router.get("/audit-log", response_model=StaffAuditLogPageResponse)
async def list_staff_audit_log_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    staff_id: uuid.UUID | None = None,
    action_type: str | None = None,
    role: str | None = None,
    outlet_id: uuid.UUID | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """Get paginated staff audit trail."""
    target_outlet_id = outlet_id or current_user.outlet_id
    stmt = (
        select(StaffAuditLog)
        .join(StaffAuditLog.staff, isouter=True)
        .options(selectinload(StaffAuditLog.staff))
    )
    if target_outlet_id:
        stmt = stmt.where(StaffAuditLog.outlet_id == target_outlet_id)

    if staff_id:
        stmt = stmt.where(StaffAuditLog.staff_id == staff_id)
    if action_type and action_type.strip():
        clean_action = action_type.strip().lower().replace(" ", "_")
        stmt = stmt.where(func.lower(StaffAuditLog.action_type) == clean_action)
    if role and role.strip():
        from app.models.user import User
        from sqlalchemy import String
        clean_role = role.strip().upper()
        role_match = None
        for r_item in RoleEnum:
            if r_item.value.upper() == clean_role:
                role_match = r_item
                break
        if role_match:
            stmt = stmt.where(User.role == role_match)
        else:
            stmt = stmt.where(func.upper(func.cast(User.role, String)) == clean_role)
    if from_date:
        stmt = stmt.where(StaffAuditLog.created_at >= from_date)
    if to_date:
        stmt = stmt.where(StaffAuditLog.created_at <= to_date)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await db.execute(count_stmt)
    total = total_res.scalar_one() or 0

    offset = (page - 1) * page_size
    stmt = stmt.order_by(StaffAuditLog.created_at.desc()).offset(offset).limit(page_size)
    res = await db.execute(stmt)
    rows = res.scalars().all()

    items = [
        StaffAuditLogResponse(
            id=r.id,
            staff_id=r.staff_id,
            staff_name=r.staff.name if r.staff else None,
            outlet_id=r.outlet_id,
            action_type=r.action_type,
            reference_type=r.reference_type,
            reference_id=r.reference_id,
            details=r.details,
            created_at=r.created_at,
        )
        for r in rows
    ]

    total_pages = max(1, math.ceil(total / page_size))
    return StaffAuditLogPageResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ── Staff Incentives & Performance ──────────────────────────────────────


@router.get("/incentives/report")
async def get_staff_incentives_report(
    current_user: RequireAdmin,
    db: DBSession,
    start_date: str | None = Query(None, description="Format: YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Format: YYYY-MM-DD"),
):
    """
    Store-wide staff incentive report for settled orders.
    Calculates total items assisted, sales volume generated, and estimated commission.
    """
    from app.models.enums import OrderStatusEnum
    from app.models.order import Order
    from app.models.order_item import OrderItem
    from app.models.user import User

    stmt = (
        select(
            OrderItem.added_by_staff_id,
            User.name.label("staff_name"),
            User.email.label("staff_email"),
            func.count(OrderItem.id).label("item_count"),
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.sum(OrderItem.unit_price * OrderItem.quantity).label("total_sales"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(User, User.id == OrderItem.added_by_staff_id)
        .where(
            Order.outlet_id == current_user.outlet_id,
            Order.status == OrderStatusEnum.COMPLETED,
            OrderItem.added_by_staff_id.isnot(None),
        )
    )

    if start_date:
        try:
            dt_start = datetime.strptime(start_date, "%Y-%m-%d")
            stmt = stmt.where(Order.created_at >= dt_start)
        except ValueError:
            pass

    if end_date:
        try:
            dt_end = datetime.strptime(end_date, "%Y-%m-%d")
            stmt = stmt.where(Order.created_at <= dt_end)
        except ValueError:
            pass

    stmt = stmt.group_by(
        OrderItem.added_by_staff_id,
        User.name,
        User.email,
    ).order_by(func.sum(OrderItem.unit_price * OrderItem.quantity).desc())

    result = await db.execute(stmt)
    rows = result.all()

    report_items = []
    total_store_assisted_sales = 0.0

    for r in rows:
        sales_val = float(r.total_sales or 0.0)
        total_store_assisted_sales += sales_val
        report_items.append(
            {
                "staff_id": str(r.added_by_staff_id),
                "staff_name": r.staff_name or "Staff Member",
                "staff_email": r.staff_email,
                "item_count": r.item_count,
                "total_quantity": r.total_quantity,
                "total_sales": sales_val,
                "estimated_incentive": round(sales_val * 0.01, 2),
            }
        )

    return {
        "outlet_id": str(current_user.outlet_id),
        "total_assisted_sales": round(total_store_assisted_sales, 2),
        "total_estimated_incentive_pool": round(total_store_assisted_sales * 0.01, 2),
        "staff_breakdown": report_items,
    }


# ── Shift Punch-In / Punch-Out ──────────────────────────────────────────


@router.get("/punch/status", response_model=StaffPunchStatusResponse)
async def get_punch_status_endpoint(
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Fetch current shift punch status for the authenticated user."""
    is_exempt = is_role_exempt(current_user.role)
    if is_exempt or not current_user.outlet_id:
        return StaffPunchStatusResponse(
            is_exempt=is_exempt,
            is_punched_in=True,
            session_id=None,
            punch_in_at=None,
            elapsed_seconds=0,
            max_shift_seconds=MAX_SHIFT_DURATION_SECONDS,
        )

    session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
    if not session:
        return StaffPunchStatusResponse(
            is_exempt=False,
            is_punched_in=False,
            session_id=None,
            punch_in_at=None,
            elapsed_seconds=0,
            max_shift_seconds=MAX_SHIFT_DURATION_SECONDS,
        )

    from app.core.datetime_utils import utc_now, ensure_naive_utc
    now = utc_now()
    punch_in_naive = ensure_naive_utc(session.punch_in_at)
    elapsed = max(0, int((now - punch_in_naive).total_seconds()))

    return StaffPunchStatusResponse(
        is_exempt=False,
        is_punched_in=True,
        session_id=session.id,
        punch_in_at=session.punch_in_at,
        elapsed_seconds=elapsed,
        max_shift_seconds=MAX_SHIFT_DURATION_SECONDS,
    )


@router.post("/punch/in", response_model=StaffPunchStatusResponse)
async def punch_in_endpoint(
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Punch in authenticated staff member for a new shift."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="Active outlet session required to punch in")

    staff_user = await db.get(User, current_user.user_id)
    staff_name = staff_user.name if staff_user and staff_user.name else "Team Member"

    session = await punch_in_staff(db, current_user.outlet_id, current_user.user_id, staff_name)
    from app.core.datetime_utils import utc_now, ensure_naive_utc
    now = utc_now()
    punch_in_naive = ensure_naive_utc(session.punch_in_at)
    elapsed = max(0, int((now - punch_in_naive).total_seconds()))

    return StaffPunchStatusResponse(
        is_exempt=is_role_exempt(current_user.role),
        is_punched_in=True,
        session_id=session.id,
        punch_in_at=session.punch_in_at,
        elapsed_seconds=elapsed,
        max_shift_seconds=MAX_SHIFT_DURATION_SECONDS,
    )


@router.post("/punch/out", response_model=StaffPunchStatusResponse)
async def punch_out_endpoint(
    data: StaffPunchOutRequest,
    current_user: AuthenticatedUser,
    db: DBSession,
):
    """Punch out authenticated staff member, ending their active shift."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="Active outlet session required to punch out")

    staff_user = await db.get(User, current_user.user_id)
    staff_name = staff_user.name if staff_user and staff_user.name else "Team Member"

    session, duration_str = await punch_out_staff(
        db, current_user.outlet_id, current_user.user_id, staff_name, data.notes
    )

    return StaffPunchStatusResponse(
        is_exempt=is_role_exempt(current_user.role),
        is_punched_in=False,
        session_id=None,
        punch_in_at=None,
        elapsed_seconds=0,
        max_shift_seconds=MAX_SHIFT_DURATION_SECONDS,
    )

