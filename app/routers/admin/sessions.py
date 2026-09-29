"""
Admin session routes — list active sessions, manage abandoned carts,
terminate sessions. All outlet-scoped via JWT.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from datetime import datetime, timezone
from app.core.datetime_utils import utc_now
from app.config import get_settings
from app.core.shift_utils import get_current_shift_window_utc
from app.dependencies import (
    DBSession,
    RequireAdmin,
    RequireStaffOrAdmin,
    outlet_scoped_query,
)
from app.models.abandoned_cart import AbandonedCart
from app.models.enums import SessionStatusEnum
from app.models.order import Order
from app.models.basket_session import BasketSession
from app.models.outlet import Outlet
from app.models.user import User
from app.schemas.common import StrictSchema
from app.schemas.session import AbandonedCartResponse, StaffAddItemsRequest, StaffAddItemsResponse
from app.services import cart_service
from app.services.audit_service import log_action
from app.services.session_service import _archive_session_key, save_abandoned_cart, staff_add_items_to_session, terminate_session

router = APIRouter(prefix="/api/admin/sessions", tags=["admin-sessions"])


# ── Schemas ──────────────────────────────────────────────────────────────


class ActiveSessionResponse(StrictSchema):
    id: str
    basket_number: str
    customer_name: str
    customer_phone: str | None
    status: str
    created_at: str
    expires_at: str
    order_count: int


class TerminateSessionRequest(StrictSchema):
    reason: str = Field(default="Staff terminated session")


# ── Active sessions ──────────────────────────────────────────────────────


@router.get("", response_model=list[ActiveSessionResponse])
@router.get("/", response_model=list[ActiveSessionResponse])
async def list_active_sessions(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    List all ACTIVE sessions for this outlet, ordered by creation time.
    Includes active order count per session.
    Auto-sweeps past-expiry sessions into EXPIRED or ABANDONED CARTS.
    """
    stmt = (
        select(BasketSession)
        .where(
            BasketSession.outlet_id == current_user.outlet_id,
            BasketSession.status == SessionStatusEnum.ACTIVE,
        )
        .options(selectinload(BasketSession.orders), selectinload(BasketSession.customer))
    )

    from app.services.staff_punch_service import is_role_exempt, get_active_punch_session
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            return []
        from app.core.datetime_utils import ensure_naive_utc
        shift_cutoff = ensure_naive_utc(punch_session.punch_in_at)
        stmt = stmt.where(BasketSession.created_at >= shift_cutoff)

    stmt = stmt.order_by(BasketSession.created_at.desc())
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    now = utc_now()
    valid_active_sessions = []
    has_swept = False

    for s in sessions:
        if s.expires_at < now:
            s.status = SessionStatusEnum.EXPIRED
            _archive_session_key(s)
            has_swept = True

            # If session had live draft cart items in Redis, archive as AbandonedCart
            try:
                cart_data = await cart_service.get_cart(s.id)
                items = cart_data.get("items", [])
                subtotal = Decimal(str(cart_data.get("subtotal", 0.0)))
                if items:
                    await save_abandoned_cart(
                        db=db,
                        session_id=s.id,
                        items=items,
                        total_estimate=subtotal,
                    )
            except Exception:
                pass
        else:
            valid_active_sessions.append(s)

    if has_swept:
        await db.flush()

    return [
        ActiveSessionResponse(
            id=str(s.id),
            basket_number=s.basket_number,
            customer_name=s.customer_name,
            customer_phone=s.customer.phone if s.customer else None,
            status=s.status.value,
            created_at=s.created_at.isoformat(),
            expires_at=s.expires_at.isoformat(),
            order_count=len([o for o in s.orders if o.status.value not in ("CANCELLED", "REFUNDED")]),
        )
        for s in valid_active_sessions
    ]


@router.post("/{session_id}/terminate", status_code=status.HTTP_200_OK)
async def terminate_session_endpoint(
    session_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    data: TerminateSessionRequest | None = None,
):
    """
    Staff manually terminates an active session.
    Frees the basket, cancels draft state, and logs the audit event.
    """
    reason = data.reason if data else "Staff terminated session"

    # Verify session belongs to this outlet
    stmt = select(BasketSession).where(
        BasketSession.id == session_id,
        BasketSession.outlet_id == current_user.outlet_id,
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session.status != SessionStatusEnum.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session is already {session.status.value}",
        )

    await terminate_session(
        db=db,
        session_id=session_id,
        terminated_by_id=current_user.user_id,
        reason=reason,
    )

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "TERMINATE",
        "BasketSession",
        str(session_id),
        details={"reason": reason, "basket_number": session.basket_number},
    )

    return {
        "status": "terminated",
        "session_id": str(session_id),
        "reason": reason,
    }


@router.post(
    "/{session_id}/add-items",
    response_model=StaffAddItemsResponse,
    status_code=status.HTTP_201_CREATED,
)
async def staff_add_items_endpoint(
    session_id: uuid.UUID,
    data: StaffAddItemsRequest,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Staff assists customer by adding items directly to an active basket session.
    Mutates live draft cart in Redis, broadcasts WS update to customer, and logs audit.
    """
    res = await staff_add_items_to_session(
        db=db,
        session_id=session_id,
        outlet_id=current_user.outlet_id,
        staff_user=current_user,
        data=data,
    )

    return StaffAddItemsResponse(
        order_id=res["order_id"],
        session_id=res["session_id"],
        basket_number=res["basket_number"],
        customer_name=res["customer_name"],
        total_amount=res["total_amount"],
        status=res["status"],
        added_items_count=res["added_items_count"],
        added_by_staff_id=res["added_by_staff_id"],
    )


@router.post(
    "/baskets/{basket_number}/add-items",
    response_model=StaffAddItemsResponse,
    status_code=status.HTTP_201_CREATED,
)
async def staff_add_items_by_basket_endpoint(
    basket_number: str,
    data: StaffAddItemsRequest,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Staff adds items to the single active session of a smart basket (by basket_number).
    Lookup targets the active session (`status == SessionStatusEnum.ACTIVE`) at staff's outlet.
    """
    stmt = select(BasketSession).where(
        BasketSession.outlet_id == current_user.outlet_id,
        BasketSession.basket_number == basket_number,
        BasketSession.status == SessionStatusEnum.ACTIVE,
    )
    res_db = await db.execute(stmt)
    session = res_db.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active session found for Basket #{basket_number}.",
        )

    res = await staff_add_items_to_session(
        db=db,
        session_id=session.id,
        outlet_id=current_user.outlet_id,
        staff_user=current_user,
        data=data,
    )

    return StaffAddItemsResponse(
        order_id=res["order_id"],
        session_id=res["session_id"],
        basket_number=res["basket_number"],
        customer_name=res["customer_name"],
        total_amount=res["total_amount"],
        status=res["status"],
        added_items_count=res["added_items_count"],
        added_by_staff_id=res["added_by_staff_id"],
    )



# ── Abandoned carts ─────────────────────────────────────────────────────


@router.get("/abandoned-carts", response_model=list[AbandonedCartResponse])
async def list_abandoned_carts(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    status_filter: str | None = None,
    all_history: bool = False,
):
    """
    List abandoned carts for this outlet, most recent first.
    Filters by the DASHBOARD_RESET_TIME business shift window unless all_history=True.
    """
    stmt = (
        select(AbandonedCart)
        .where(AbandonedCart.outlet_id == current_user.outlet_id)
        .order_by(AbandonedCart.created_at.desc())
        .limit(100)
    )
    if status_filter:
        stmt = stmt.where(AbandonedCart.status == status_filter.upper())

    if not all_history:
        outlet = await db.get(Outlet, current_user.outlet_id)
        reset_time = outlet.dashboard_reset_time if outlet else "00:00"
        shift_start_utc, shift_end_utc = get_current_shift_window_utc(reset_time)
        stmt = stmt.where(
            AbandonedCart.created_at >= shift_start_utc,
            AbandonedCart.created_at <= shift_end_utc,
        )

    # Staff Shift Isolation for non-exempt roles
    from app.services.staff_punch_service import is_role_exempt, get_active_punch_session
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            return []
        from app.core.datetime_utils import ensure_naive_utc
        shift_cutoff = ensure_naive_utc(punch_session.punch_in_at)
        stmt = stmt.where(AbandonedCart.created_at >= shift_cutoff)

    result = await db.execute(stmt)
    carts = result.scalars().all()

    return [
        AbandonedCartResponse(
            id=str(c.id),
            outlet_id=str(c.outlet_id),
            session_id=str(c.session_id),
            basket_number=c.basket_number,
            customer_name=c.customer_name,
            customer_phone=c.customer_phone,
            items=c.items or [],
            total_estimate=float(c.total_estimate),
            status=c.status,
            converted_order_id=str(c.converted_order_id) if c.converted_order_id else None,
            created_at=c.created_at.isoformat(),
        )
        for c in carts
    ]


@router.get("/abandoned-carts/count")
async def abandoned_cart_count(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Count of un-converted abandoned carts for the current business shift (for dashboard badge).
    Filters by the DASHBOARD_RESET_TIME business day window.
    """
    outlet = await db.get(Outlet, current_user.outlet_id)
    reset_time = outlet.dashboard_reset_time if outlet else "00:00"
    shift_start_utc, shift_end_utc = get_current_shift_window_utc(reset_time)

    stmt = (
        select(func.count())
        .select_from(AbandonedCart)
        .where(
            AbandonedCart.outlet_id == current_user.outlet_id,
            AbandonedCart.status == "ABANDONED",
            AbandonedCart.created_at >= shift_start_utc,
            AbandonedCart.created_at <= shift_end_utc,
        )
    )

    # Staff Shift Isolation for non-exempt roles
    from app.services.staff_punch_service import is_role_exempt, get_active_punch_session
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            return {"count": 0}
        from app.core.datetime_utils import ensure_naive_utc
        shift_cutoff = ensure_naive_utc(punch_session.punch_in_at)
        stmt = stmt.where(AbandonedCart.created_at >= shift_cutoff)

    result = await db.execute(stmt)
    count = result.scalar_one()
    return {"count": count}


@router.post("/abandoned-carts/{cart_id}/convert", status_code=status.HTTP_200_OK)
async def convert_abandoned_cart(
    cart_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Convert an abandoned cart into a manual bill via the existing
    billing service. Pre-fills items from the cart snapshot.
    """
    # Load the abandoned cart
    stmt = select(AbandonedCart).where(
        AbandonedCart.id == cart_id,
        AbandonedCart.outlet_id == current_user.outlet_id,
    )
    result = await db.execute(stmt)
    cart = result.scalar_one_or_none()
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Abandoned cart not found",
        )
    if cart.status == "CONVERTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This cart has already been converted to a bill",
        )

    # Use the existing billing service to create a manual bill
    from app.services.billing_service import create_manual_bill
    from app.schemas.billing import BillItemInput, CreateManualBillRequest

    bill_items = []
    for item in (cart.items or []):
        bill_items.append(BillItemInput(
            menu_item_id=item.get("menu_item_id"),
            variant_id=item.get("variant_id"),
            quantity=Decimal(str(item.get("quantity", 1))),
        ))

    bill_request = CreateManualBillRequest(
        basket_number=cart.basket_number,
        customer_name=cart.customer_name,
        customer_phone=cart.customer_phone,
        items=bill_items,
    )

    # Load actual User object for billing service
    user_result = await db.execute(
        select(User).where(User.id == current_user.user_id)
    )
    staff_user = user_result.scalar_one_or_none()
    if not staff_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff user not found",
        )

    order = await create_manual_bill(
        db=db,
        outlet_id=current_user.outlet_id,
        staff_user=staff_user,
        data=bill_request,
    )

    # Mark cart as converted
    cart.status = "CONVERTED"
    cart.converted_order_id = order.id
    await db.flush()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "CONVERT",
        "AbandonedCart",
        str(cart_id),
        details={
            "converted_order_id": str(order.id),
            "customer_name": cart.customer_name,
        },
    )

    return {
        "status": "converted",
        "abandoned_cart_id": str(cart_id),
        "order_id": str(order.id),
    }


@router.post("/abandoned-carts/{cart_id}/dismiss", status_code=status.HTTP_200_OK)
async def dismiss_abandoned_cart(
    cart_id: uuid.UUID,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """
    Dismiss an abandoned cart so it is marked as DISMISSED and cleared from the active badge counter.
    """
    stmt = select(AbandonedCart).where(
        AbandonedCart.id == cart_id,
        AbandonedCart.outlet_id == current_user.outlet_id,
    )
    result = await db.execute(stmt)
    cart = result.scalar_one_or_none()
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Abandoned cart not found",
        )
    if cart.status == "CONVERTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Converted cart cannot be dismissed",
        )

    cart.status = "DISMISSED"
    await db.flush()

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "DISMISS",
        "AbandonedCart",
        str(cart_id),
        details={
            "customer_name": cart.customer_name,
            "basket_number": cart.basket_number,
        },
    )

    return {
        "status": "dismissed",
        "abandoned_cart_id": str(cart_id),
    }
