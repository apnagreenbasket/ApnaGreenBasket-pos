"""
Billing FastAPI Router — manual bill creation, discount approval workflows, Cash/UPI settlement, and pending notification badge counts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import (
    AuthenticatedUser,
    CurrentUser,
    DBSession,
    RequireAdmin,
    require_permission,
)
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.enums import RoleEnum, OrderStatusEnum
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.user import User
from app.schemas.billing import (
    ApplyDiscountRequest,
    ApproveDiscountRequest,
    BillResponse,
    CreateManualBillRequest,
    CustomerReturnRequest,
    DiscountApprovalResponse,
    MarkPaidRequest,
    UpdateManualBillRequest,
)
from app.schemas.return_ledger import ItemReturnLedgerResponse, ItemReturnLedgerSummary
from app.services.billing_service import (
    apply_discount,
    approve_discount,
    create_manual_bill,
    finalize_bill,
    get_daily_cash_denominations,
    get_item_level_return_ledger,
    get_pending_approvals_count,
    list_customer_returns,
    mark_bill_paid,
    process_customer_return,
    update_manual_bill,
)
from app.services.staff_punch_service import get_active_punch_session, is_role_exempt

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _format_bill_response(order: Order) -> BillResponse:
    items_out = []
    for item in order.items:
        qty = float(item.quantity) if item.quantity is not None else 1.0
        price = float(item.unit_price) if item.unit_price is not None else 0.0
        mrp_val = float(item.mrp) if getattr(item, "mrp", None) is not None else price
        tax_rate_val = float(item.tax_rate) if getattr(item, "tax_rate", None) is not None else 0.0
        l_total = float(item.line_total) if item.line_total is not None else (qty * price)

        name_val = item.item_name
        mi_dict = item.__dict__.get("menu_item")
        if not name_val and mi_dict:
            name_val = getattr(mi_dict, "name", None)
        if not name_val:
            name_val = "Item"

        unit_val = getattr(item, "selected_unit", None)
        if not unit_val and mi_dict:
            inv_dict = mi_dict.__dict__.get("inventory_item") if hasattr(mi_dict, "__dict__") else None
            if inv_dict and getattr(inv_dict, "unit", None):
                unit_val = str(inv_dict.unit)
            elif getattr(mi_dict, "unit_label", None):
                unit_val = str(mi_dict.unit_label)

        batch_id_str = str(item.selected_batch_id) if getattr(item, "selected_batch_id", None) else None
        batch_num_str = None
        cost_val = None

        sb = item.__dict__.get("selected_batch")
        if sb:
            if hasattr(sb, "batch_number"):
                batch_num_str = sb.batch_number
            if getattr(sb, "unit_cost", None) is not None:
                cost_val = float(sb.unit_cost)

        if cost_val is None and mi_dict:
            inv_dict = mi_dict.__dict__.get("inventory_item") if hasattr(mi_dict, "__dict__") else None
            if inv_dict and getattr(inv_dict, "cost_per_unit", None) is not None:
                cost_val = float(inv_dict.cost_per_unit)

        # Scale cost price to match selected alternate unit if applicable
        if cost_val is not None and unit_val:
            from app.services.inventory_service import get_unit_conversion_multiplier
            inv_dict = mi_dict.__dict__.get("inventory_item") if (mi_dict and hasattr(mi_dict, "__dict__")) else None
            mult = float(get_unit_conversion_multiplier(unit_val, inv_item=inv_dict, menu_item=mi_dict))
            cost_val = round(cost_val * mult, 4)

        items_out.append(
            {
                "id": str(item.id),
                "menu_item_id": str(item.menu_item_id) if item.menu_item_id else None,
                "variant_id": str(item.variant_id) if item.variant_id else None,
                "item_name": name_val,
                "quantity": qty,
                "selected_unit": unit_val,
                "unit_price": price,
                "cost_price": cost_val,
                "mrp": mrp_val,
                "tax_rate": tax_rate_val,
                "is_complimentary": getattr(item, "is_complimentary", False),
                "returned_quantity": float(getattr(item, "returned_quantity", 0.0)),
                "line_total": l_total,
                "selected_batch_id": batch_id_str,
                "selected_batch_number": batch_num_str,
                "hsn_code": getattr(item, "hsn_code", None),
            }
        )

    cust_obj = order.__dict__.get("customer")
    cust_gstin = getattr(cust_obj, "gstin", None) if cust_obj else None
    cust_legal = getattr(cust_obj, "legal_name", None) if cust_obj else None

    tot_amt = float(order.total_amount) if order.total_amount is not None else 0.0
    total_refunded = round(
        sum(
            float(getattr(item, "returned_quantity", 0.0) or 0.0) * float(getattr(item, "unit_price", 0.0) or 0.0)
            for item in order.items
        ),
        2,
    )
    net_amt = round(max(0.0, tot_amt - total_refunded), 2)

    cust_bal = None
    if getattr(order, "customer_balance", None) is not None:
        cust_bal = float(order.customer_balance)
    elif cust_obj and getattr(cust_obj, "credit_balance", None) is not None:
        cust_bal = float(cust_obj.credit_balance)

    cust_loyalty = None
    if getattr(order, "customer_loyalty_balance", None) is not None:
        cust_loyalty = int(order.customer_loyalty_balance)
    elif cust_obj and getattr(cust_obj, "loyalty_points", None) is not None:
        cust_loyalty = int(cust_obj.loyalty_points)

    return BillResponse(
        id=str(order.id),
        outlet_id=str(order.outlet_id),
        basket_number=order.basket_number,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        customer_gstin=cust_gstin,
        customer_legal_name=cust_legal,
        status=order.status.value if hasattr(order.status, "value") else str(order.status),
        is_void=getattr(order, "is_void", False),
        source=order.source or "manual",
        subtotal_amount=float(order.subtotal_amount or order.total_amount or 0.0),
        delivery_charge=float(order.delivery_charge) if getattr(order, 'delivery_charge', None) is not None else 0.0,
        handling_charge=float(order.handling_charge) if getattr(order, 'handling_charge', None) is not None else 0.0,
        tax_amount=float(order.tax_amount or 0.0),
        total_amount=tot_amt,
        total_refunded_amount=total_refunded,
        net_amount=net_amt,
        is_interstate=bool(getattr(order, "is_interstate", False)),
        place_of_supply=getattr(order, "place_of_supply", None),
        credit_applied=float(order.credit_applied) if getattr(order, "credit_applied", None) is not None else 0.0,
        debit_applied=float(order.debit_applied) if getattr(order, "debit_applied", None) is not None else 0.0,
        credit_awarded=float(order.credit_awarded) if getattr(order, "credit_awarded", None) is not None else 0.0,
        debt_settled=float(order.debt_settled) if getattr(order, "debt_settled", None) is not None else 0.0,
        credit_cashed_out=float(order.credit_cashed_out) if getattr(order, "credit_cashed_out", None) is not None else 0.0,
        customer_balance=cust_bal,
        customer_loyalty_points=cust_loyalty,
        discount_type=order.discount_type,
        discount_value=float(order.discount_value) if order.discount_value is not None else None,
        discount_reason=order.discount_reason,
        discount_status=order.discount_status,
        payment_method=order.payment_method,
        cash_amount=float(getattr(order, "cash_amount", 0.0) or 0.0),
        upi_amount=float(getattr(order, "upi_amount", 0.0) or 0.0),
        cash_denominations=order.cash_denominations,
        change_denominations=order.change_denominations,
        loyalty_points_earned=order.loyalty_points_earned,
        loyalty_points_redeemed=order.loyalty_points_redeemed,
        loyalty_discount_inr=float(order.loyalty_discount_inr) if getattr(order, "loyalty_discount_inr", None) is not None else 0.0,
        created_by_staff_id=str(order.created_by_staff_id) if order.created_by_staff_id else None,
        replaces_bill_id=str(order.replaces_bill_id) if getattr(order, "replaces_bill_id", None) else None,
        created_at=order.created_at.isoformat() if hasattr(order.created_at, "isoformat") else str(order.created_at),
        finalized_at=order.finalized_at.isoformat() if order.finalized_at and hasattr(order.finalized_at, "isoformat") else None,
        paid_at=order.paid_at.isoformat() if order.paid_at and hasattr(order.paid_at, "isoformat") else None,
        items=items_out,
    )



@router.post("/bills", response_model=BillResponse)
async def create_bill_endpoint(
    data: CreateManualBillRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Create a draft manual bill."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active shift punch-in session required to create bills.",
            )

    order = await create_manual_bill(db, current_user.outlet_id, current_user, data)
    return _format_bill_response(order)


@router.put("/bills/{bill_id}", response_model=BillResponse)
async def update_bill_endpoint(
    bill_id: uuid.UUID,
    data: UpdateManualBillRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Update line items or basket info on draft bill."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await update_manual_bill(db, bill_id, current_user.outlet_id, data)
    return _format_bill_response(order)


@router.delete("/bills/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bill_endpoint(
    bill_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Explicitly delete a non-completed bill."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from app.services.billing_service import delete_manual_bill
    await delete_manual_bill(db, bill_id, current_user.outlet_id, current_user)
    return None


@router.post("/bills/{bill_id}/apply-discount", response_model=BillResponse)
async def apply_discount_endpoint(
    bill_id: uuid.UUID,
    data: ApplyDiscountRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Apply discount (% / flat / complimentary) with reason note."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await apply_discount(db, bill_id, current_user.outlet_id, current_user, data)
    return _format_bill_response(order)


@router.post("/approvals/{approval_id}/resolve")
async def resolve_discount_approval_endpoint(
    approval_id: uuid.UUID,
    data: ApproveDiscountRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Manager/Admin approves or rejects a pending discount request."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    approval = await approve_discount(db, approval_id, current_user.outlet_id, current_user, data.approve)
    return {"status": approval.status, "message": f"Discount approval {approval.status.lower()} successfully."}


@router.post("/bills/{bill_id}/finalize", response_model=BillResponse)
async def finalize_bill_endpoint(
    bill_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Lock draft bill from further item edits."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await finalize_bill(db, bill_id, current_user.outlet_id)
    return _format_bill_response(order)


@router.post("/bills/{bill_id}/mark-paid", response_model=BillResponse)
async def mark_paid_endpoint(
    bill_id: uuid.UUID,
    data: MarkPaidRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Record Cash or UPI payment and mark bill as paid."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    order = await mark_bill_paid(
        db,
        bill_id,
        current_user.outlet_id,
        data.payment_method,
        cash_denominations=data.cash_denominations,
        change_denominations=data.change_denominations,
        redeem_loyalty_points=data.redeem_loyalty_points,
        delivery_charge=data.delivery_charge,
        handling_charge=data.handling_charge,
        apply_credit=data.apply_credit,
        record_debit=data.record_debit,
        record_credit=data.record_credit,
        debt_settled=data.debt_settled,
        credit_cashed_out=data.credit_cashed_out,
        cash_amount=data.cash_amount,
        upi_amount=data.upi_amount,
        staff_user=current_user,
    )
    return _format_bill_response(order)


@router.get("/pending-approvals-count")
async def pending_approvals_count_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Get count of pending discount approval requests for manager badge."""
    if not current_user.outlet_id:
        return {"count": 0}
    cnt = await get_pending_approvals_count(db, current_user.outlet_id)
    return {"count": cnt}


@router.get("/pending-approvals", response_model=list[DiscountApprovalResponse])
async def list_pending_approvals_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """List pending discount approvals for manager action panel."""
    if not current_user.outlet_id:
        return []

    stmt = (
        select(BillDiscountApproval)
        .join(Order, BillDiscountApproval.order_id == Order.id)
        .options(selectinload(BillDiscountApproval.order), selectinload(BillDiscountApproval.requested_by))
        .where(
            Order.outlet_id == current_user.outlet_id,
            BillDiscountApproval.status == "PENDING",
        )
        .order_by(BillDiscountApproval.created_at.desc())
    )
    res = await db.execute(stmt)
    approvals = res.scalars().all()

    out = []
    for appr in approvals:
        out.append(
            DiscountApprovalResponse(
                id=str(appr.id),
                order_id=str(appr.order_id),
                requested_by_id=str(appr.requested_by_id),
                requested_by_name=appr.requested_by.email if appr.requested_by else None,
                approved_by_id=str(appr.approved_by_id) if appr.approved_by_id else None,
                status=appr.status,
                discount_type=appr.discount_type,
                discount_value=float(appr.discount_value or 0.0),
                reason_note=appr.reason_note,
                created_at=appr.created_at.isoformat() if hasattr(appr.created_at, "isoformat") else str(appr.created_at),
                order_basket_number=appr.order.basket_number if appr.order else "N/A",
                order_total_amount=float(appr.order.total_amount if appr.order else 0.0),
            )
        )
    return out


@router.get("/bills", response_model=list[BillResponse])
async def list_bills_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
    status: str | None = Query(None),
    source: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    search: str | None = Query(None, description="Search customer phone, name, or bill ID"),
    limit: int = Query(500, ge=1, le=500),
):
    """List bills with optional status, source, date range, search, and limit filtering."""
    if not current_user.outlet_id:
        return []

    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.menu_item).selectinload(MenuItem.inventory_item),
            selectinload(Order.items).selectinload(OrderItem.selected_batch),
            selectinload(Order.customer),
        )
        .where(Order.outlet_id == current_user.outlet_id)
    )

    if source:
        stmt = stmt.where(Order.source == source)
    if status:
        if "," in status:
            statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
            stmt = stmt.where(Order.status.in_(statuses))
        else:
            stmt = stmt.where(Order.status == status.strip().upper())
    if start_date and end_date:
        try:
            from datetime import datetime, time, timedelta
            from app.core.datetime_utils import ensure_naive_utc
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            # DB stores naive UTC. 00:00 IST = 18:30 UTC (previous day)
            start_utc = ensure_naive_utc(datetime.combine(dt_start, time.min) - timedelta(hours=5, minutes=30))
            end_utc = ensure_naive_utc(datetime.combine(dt_end, time.max) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(Order.created_at.between(start_utc, end_utc))
        except ValueError:
            pass
    elif start_date:
        try:
            from datetime import datetime, time, timedelta
            from app.core.datetime_utils import ensure_naive_utc
            dt_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            start_utc = ensure_naive_utc(datetime.combine(dt_start, time.min) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(Order.created_at >= start_utc)
        except ValueError:
            pass
    elif end_date:
        try:
            from datetime import datetime, time, timedelta
            from app.core.datetime_utils import ensure_naive_utc
            dt_end = datetime.strptime(end_date, "%Y-%m-%d").date()
            end_utc = ensure_naive_utc(datetime.combine(dt_end, time.max) - timedelta(hours=5, minutes=30))
            stmt = stmt.where(Order.created_at <= end_utc)
        except ValueError:
            pass

    if search and search.strip():
        from sqlalchemy import or_, cast, String
        from app.models.customer import Customer
        term = f"%{search.strip()}%"
        stmt = stmt.outerjoin(Order.customer).where(
            or_(
                cast(Order.id, String).ilike(term),
                Order.basket_number.ilike(term),
                Order.customer_name.ilike(term),
                Order.customer_phone.ilike(term),
                Customer.name.ilike(term),
                Customer.phone.ilike(term),
            )
        )

    # Staff Shift Isolation for non-exempt roles (Cashier, Staff, etc.)
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            # If not searching for returns fallback, un-punched cashier sees empty list
            if not (search and search.strip()):
                return []
        else:
            # Punched in: if not searching for customer return fallback, strictly filter created_at >= punch_in_at
            if not (search and search.strip()):
                from app.core.datetime_utils import ensure_naive_utc
                shift_cutoff = ensure_naive_utc(punch_session.punch_in_at)
                stmt = stmt.where(Order.created_at >= shift_cutoff)

    stmt = stmt.order_by(Order.updated_at.desc(), Order.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    orders = res.scalars().all()

    return [_format_bill_response(o) for o in orders]


@router.get("/daily-cash-denominations")
async def daily_cash_denominations_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
    date: str | None = Query(None, description="Date in YYYY-MM-DD format"),
):
    """Fetch daily cash currency denomination breakdown collected at billing POS."""
    if not current_user.outlet_id:
        return {"date": date, "total_cash_collected": 0.0, "denominations": {}}
    return await get_daily_cash_denominations(db, current_user.outlet_id, date_str=date)


@router.post("/returns")
async def customer_return_endpoint(
    data: CustomerReturnRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Process customer return or exchange against an existing bill or direct return with inventory restocking."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active shift punch-in session required to process customer returns.",
            )

    return await process_customer_return(db, current_user.outlet_id, current_user, data)


@router.get("/returns")
async def list_customer_returns_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    """List customer return bills history for an outlet with optional date filtering."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    min_cutoff = None
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            return []
        from app.core.datetime_utils import ensure_naive_utc
        min_cutoff = ensure_naive_utc(punch_session.punch_in_at)

    return await list_customer_returns(
        db, current_user.outlet_id, start_date=start_date, end_date=end_date, min_created_at=min_cutoff
    )


@router.get("/returns/item-ledger")
async def get_item_level_return_ledger_endpoint(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    search: str | None = Query(None),
    reason: str | None = Query(None),
    menu_item_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    export: str | None = Query(None),
):
    """
    Get paginated item-level transactional ledger of returned items with optional search, reason filter, and CSV export.
    """
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    eff_from_date = from_date or start_date
    eff_to_date = to_date or end_date

    min_cutoff = None
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            if export and str(export).lower() == "csv":
                return Response(
                    content="Return Date,Original Bill,Customer Name,Phone,Item Name,Selected Unit,Quantity Returned,Unit Price,Line Total,Reason,Action Taken\n",
                    media_type="text/csv",
                )
            return ItemReturnLedgerResponse(
                summary=ItemReturnLedgerSummary(
                    total_line_items=0,
                    total_quantity_returned=0.0,
                    total_refund_amount=0.0,
                    unique_bills_count=0,
                ),
                items=[],
                total_count=0,
                page=page if isinstance(page, int) else 1,
                page_size=page_size if isinstance(page_size, int) else 50,
            )
        from app.core.datetime_utils import ensure_naive_utc
        min_cutoff = ensure_naive_utc(punch_session.punch_in_at)

    result = await get_item_level_return_ledger(
        db=db,
        outlet_id=current_user.outlet_id,
        from_date=eff_from_date,
        to_date=eff_to_date,
        search=search,
        reason=reason,
        menu_item_id=menu_item_id,
        page=page,
        page_size=page_size,
        export_format=export,
        min_created_at=min_cutoff,
    )

    if export and export.lower() == "csv":
        return Response(
            content=result,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=returned_items_ledger_{datetime.now().strftime('%Y%m%d')}.csv"
            },
        )

    return result



@router.get("/bills/{bill_id}", response_model=BillResponse)
async def get_bill_endpoint(
    bill_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Fetch single bill by ID."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    res = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.menu_item).selectinload(MenuItem.inventory_item),
            selectinload(Order.items).selectinload(OrderItem.selected_batch),
            selectinload(Order.customer),
        )
        .where(
            Order.id == bill_id,
            Order.outlet_id == current_user.outlet_id,
        )
    )
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Bill not found.")

    return _format_bill_response(order)


@router.delete("/bills/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft_bill_endpoint(
    bill_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Discard/delete a draft or pending bill when canceled without explicitly saving as draft."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from app.services.billing_service import discard_draft_bill
    await discard_draft_bill(db, bill_id, current_user.outlet_id)


class DrawerStateResponse(BaseModel):
    denominations: dict[str, int]
    total_balance: float

@router.get("/drawer-state", response_model=DrawerStateResponse)
async def get_live_drawer_state(
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Calculate exact real-time live cash drawer state."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    
    stmt = select(CashDrawerLedger).where(CashDrawerLedger.outlet_id == current_user.outlet_id)
    res = await db.execute(stmt)
    ledger_entries = res.scalars().all()
    
    denoms = {}
    for entry in ledger_entries:
        mult = 1 if entry.transaction_type in ("MANUAL_DEPOSIT", "CUSTOMER_PAYMENT") else -1
        for d, count in entry.denominations.items():
            if count > 0:
                denoms[d] = denoms.get(d, 0) + (count * mult)
    
    total = sum(float(d) * count for d, count in denoms.items())
    return DrawerStateResponse(denominations=denoms, total_balance=total)

class DrawerTransactionRequest(BaseModel):
    transaction_type: str
    denominations: dict[str, int]
    notes: str | None = None

@router.post("/drawer-transaction")
async def manual_drawer_transaction(
    data: DrawerTransactionRequest,
    db: DBSession,
    current_user: CurrentUser = Depends(require_permission("can_manage_billing")),
):
    """Manually add or withdraw physical cash from the drawer."""
    if not current_user.outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
        
    if not is_role_exempt(getattr(current_user, "role", None)):
        punch_session = await get_active_punch_session(db, current_user.outlet_id, current_user.user_id)
        if not punch_session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active shift punch-in session required to record drawer transactions.",
            )

    if data.transaction_type not in ("MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"):
        raise HTTPException(status_code=400, detail="Invalid transaction type")
        
    ledger = CashDrawerLedger(
        outlet_id=current_user.outlet_id,
        transaction_type=data.transaction_type,
        denominations=data.denominations,
        notes=data.notes,
        created_by=current_user.user_id,
    )
    db.add(ledger)
    await db.commit()
    return {"status": "ok"}
