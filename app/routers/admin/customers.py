"""
Customer Admin Routes — listing, searching, registering, and deleting outlet customers.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status

from app.dependencies import DBSession, RequireAdmin, RequireStaffOrAdmin
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse, CustomerLedgerEntryResponse, CustomerPageResponse
from app.services.audit_service import log_action
from app.services.customer_service import (
    create_customer,
    update_customer,
    delete_customer,
    get_customer_analytics,
    list_customers,
    get_customer_ledger,
)

router = APIRouter(prefix="/api/admin/customers", tags=["admin-customers"])


@router.get("/analytics")
async def customer_analytics_route(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    phone: str = Query(..., min_length=1),
    period: str = Query("all_time"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    """Fetch customer purchase volume, order count, best category & item interest."""
    return await get_customer_analytics(
        db,
        current_user.outlet_id,
        phone=phone,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("", response_model=CustomerPageResponse | list[CustomerResponse])
async def list_customers_route(
    current_user: RequireStaffOrAdmin,
    db: DBSession,
    search: str | None = Query(None, description="Search by customer name or phone"),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=500),
):
    """List all registered customers for current outlet with purchase history stats."""
    return await list_customers(db, current_user.outlet_id, search=search, page=page, page_size=page_size)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer_route(
    data: CustomerCreate,
    current_user: RequireStaffOrAdmin,
    db: DBSession,
):
    """Register a new customer for current outlet."""
    cust = await create_customer(
        db,
        current_user.outlet_id,
        data.name,
        data.phone,
        data.extra_detail,
        gstin=data.gstin,
        legal_name=data.legal_name,
        state_code=data.state_code,
        address=data.address,
        city=data.city,
        state=data.state,
    )

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "CREATE",
        "Customer",
        str(cust.id),
        details={"name": cust.name, "phone": cust.phone, "gstin": cust.gstin},
    )

    return cust


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer_route(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Update a customer's details (name, phone, GST, address, city, state) for current outlet."""
    cust = await update_customer(
        db,
        current_user.outlet_id,
        customer_id,
        name=data.name,
        phone=data.phone,
        extra_detail=data.extra_detail,
        gstin=data.gstin,
        legal_name=data.legal_name,
        state_code=data.state_code,
        address=data.address,
        city=data.city,
        state=data.state,
    )

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "UPDATE",
        "Customer",
        str(cust.id),
        details={"name": cust.name, "phone": cust.phone, "gstin": cust.gstin},
    )

    return cust


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_route(
    customer_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
):
    """Delete a customer record for current outlet."""
    await delete_customer(db, current_user.outlet_id, customer_id)

    await log_action(
        db,
        current_user.outlet_id,
        current_user.user_id,
        "DELETE",
        "Customer",
        str(customer_id),
    )


@router.get("/{customer_id}/ledger", response_model=list[CustomerLedgerEntryResponse])
async def get_customer_ledger_route(
    customer_id: uuid.UUID,
    current_user: RequireAdmin,
    db: DBSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """Fetch paginated ledger entries for a customer."""
    return await get_customer_ledger(
        db,
        current_user.outlet_id,
        customer_id,
        skip=skip,
        limit=limit,
    )
