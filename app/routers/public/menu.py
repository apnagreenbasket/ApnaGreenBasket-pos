"""
Public menu route — no auth required.
Serves the cached menu JSON tree for an outlet by slug.
Rate-limited to prevent abuse.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.rate_limit import limiter
from app.dependencies import DBSession
from app.services.menu_service import get_public_menu, get_public_outlets

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/outlets")
@limiter.limit("60/minute")
async def list_outlets(
    request: Request,
    db: DBSession,
):
    """Public list of active outlets for the welcome selector screen."""
    return await get_public_outlets(db)


@router.get("/outlets/{outlet_id}/staff", response_model=list[dict])
@limiter.limit("60/minute")
async def list_outlet_staff(
    outlet_id: str,
    request: Request,
    db: DBSession,
):
    """Public list of active staff for an outlet for the PIN selector screen."""
    from uuid import UUID
    from sqlalchemy import select
    from app.models.user import User
    from app.models.enums import RoleEnum

    try:
        valid_outlet_id = UUID(outlet_id)
    except ValueError:
        return []

    stmt = select(User.id, User.name).where(
        User.outlet_id == valid_outlet_id,
        User.is_active == True,
        User.status == "active",
        User.role != RoleEnum.SUPERADMIN
    ).order_by(User.name)
    
    result = await db.execute(stmt)
    staff_list = [{"id": row.id, "name": row.name} for row in result.all()]
    return staff_list


@router.get("/menu/{outlet_slug}")
@limiter.limit("60/minute")
async def get_menu(
    outlet_slug: str,
    request: Request,
    db: DBSession,
):
    """
    Public menu endpoint — no auth required.
    Uses Redis cache-aside with jittered 24h TTL and thundering-herd protection.
    """
    return await get_public_menu(db, outlet_slug)


@router.get("/prelogin-snapshot")
@limiter.limit("60/minute")
async def get_prelogin_snapshot(request: Request, db: DBSession):
    """
    Public pre-login snapshot containing outlets and staff PIN hashes
    for offline desktop POS pre-login seeding.
    """
    from datetime import datetime, timezone
    from fastapi import HTTPException
    from sqlalchemy import select
    from app.models.outlet import Outlet
    from app.models.user import User

    outlets_result = await db.execute(select(Outlet).order_by(Outlet.created_at.asc()))
    outlets = outlets_result.scalars().all()
    if not outlets:
        raise HTTPException(status_code=404, detail="No outlets found")

    primary_outlet = outlets[0]

    users_result = await db.execute(
        select(User).where(
            User.is_active == True,
            User.status == "active",
            User.pin_hash.isnot(None),
        )
    )
    users = users_result.scalars().all()

    return {
        "outlet": {
            "id": str(primary_outlet.id),
            "name": primary_outlet.name,
            "slug": primary_outlet.slug,
            "payment_mode": primary_outlet.payment_mode.value if hasattr(primary_outlet.payment_mode, "value") else str(primary_outlet.payment_mode),
            "address": primary_outlet.address,
            "phone": primary_outlet.phone,
            "gstin": primary_outlet.gstin,
            "fssai_no": primary_outlet.fssai_no,
        },
        "categories": [],
        "menu_items": [],
        "menu_item_variants": [],
        "menu_item_recipes": [],
        "staff": [
            {
                "id": str(u.id),
                "name": u.name,
                "role": u.role.value if hasattr(u.role, "value") else str(u.role),
                "pin_hash": u.pin_hash,
                "status": u.status,
            }
            for u in users
        ],
        "inventory_items": [],
        "stock_intakes": [],
        "customers": [],
        "suppliers": [],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "is_full": False,
    }
