"""
Customer Service — listing, searching, creating, and compiling order history stats for outlet customers.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Sequence
from app.core.shift_utils import IST

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.enums import OrderStatusEnum
from app.models.order import Order


async def list_customers(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    search: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    """
    List all registered customers for an outlet with computed total_orders and total_spent.
    Optionally filter by search query (name or phone).
    """
    stmt = select(Customer).where(Customer.outlet_id == outlet_id)
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(
            (Customer.name.ilike(q)) | (Customer.phone.ilike(q))
        )
    stmt = stmt.order_by(Customer.created_at.desc())

    total = 0
    if page is not None and page_size is not None:
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    res = await db.execute(stmt)
    customers = res.scalars().all()

    # Pre-fetch order stats for all customers in this outlet
    stats_stmt = (
        select(
            Order.customer_id,
            func.count(Order.id).label("total_orders"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_spent"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.customer_id.isnot(None),
            Order.status.in_([OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, OrderStatusEnum.PARTIALLY_REFUNDED]),
        )
        .group_by(Order.customer_id)
    )
    stats_res = await db.execute(stats_stmt)
    stats_map = {row.customer_id: (row.total_orders, float(row.total_spent)) for row in stats_res}

    # Pre-fetch customer refunds to net out returns (excluding voided edit bills)
    from app.models.customer_return import CustomerReturn
    from sqlalchemy import or_
    ret_stmt = (
        select(
            CustomerReturn.customer_phone,
            func.coalesce(func.sum(CustomerReturn.total_refund_amount), 0).label("total_refunded"),
        )
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            or_(Order.id.is_(None), Order.is_void == False),
        )
        .group_by(CustomerReturn.customer_phone)
    )
    ret_res = await db.execute(ret_stmt)
    ret_map = {row.customer_phone: float(row.total_refunded) for row in ret_res}

    result = []
    for c in customers:
        orders_count, spent = stats_map.get(c.id, (0, 0.0))
        net_spent = round(max(0.0, spent - ret_map.get(c.phone, 0.0)), 2)
        result.append({
            "id": c.id,
            "outlet_id": c.outlet_id,
            "name": c.name,
            "phone": c.phone,
            "extra_detail": c.extra_detail,
            "gstin": c.gstin,
            "legal_name": c.legal_name,
            "state_code": c.state_code,
            "address": c.address,
            "city": c.city,
            "state": c.state,
            "total_orders": orders_count,
            "total_spent": net_spent,
            "loyalty_points": c.loyalty_points,
            "credit_balance": float(c.credit_balance),
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        })
    if page is not None and page_size is not None:
        return {
            "items": result,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    return result


async def create_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    name: str,
    phone: str,
    extra_detail: str | None = None,
    gstin: str | None = None,
    legal_name: str | None = None,
    state_code: str | None = None,
    address: str | None = None,
    city: str | None = None,
    state: str | None = None,
) -> Customer:
    """Create a new customer or return existing customer if phone matches."""
    clean_phone = phone.strip()
    clean_name = name.strip()

    existing = await db.execute(
        select(Customer).where(
            Customer.outlet_id == outlet_id,
            Customer.phone == clean_phone,
        )
    )
    cust = existing.scalar_one_or_none()
    if cust:
        cust.name = clean_name
        if extra_detail is not None:
            cust.extra_detail = extra_detail
        if gstin is not None:
            cust.gstin = gstin.strip().upper() if gstin else None
        if legal_name is not None:
            cust.legal_name = legal_name.strip() if legal_name else None
        if state_code is not None:
            cust.state_code = state_code.strip() if state_code else None
        if address is not None:
            cust.address = address.strip() if address else None
        if city is not None:
            cust.city = city.strip() if city else None
        if state is not None:
            cust.state = state.strip() if state else None
        await db.flush()
        await db.refresh(cust)
        return cust

    cust = Customer(
        id=uuid.uuid4(),
        outlet_id=outlet_id,
        name=clean_name,
        phone=clean_phone,
        extra_detail=extra_detail,
        gstin=gstin.strip().upper() if gstin else None,
        legal_name=legal_name.strip() if legal_name else None,
        state_code=state_code.strip() if state_code else None,
        address=address.strip() if address else None,
        city=city.strip() if city else None,
        state=state.strip() if state else None,
    )
    db.add(cust)
    await db.flush()
    await db.refresh(cust)
    return cust


async def update_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    customer_id: uuid.UUID,
    name: str | None = None,
    phone: str | None = None,
    extra_detail: str | None = None,
    gstin: str | None = None,
    legal_name: str | None = None,
    state_code: str | None = None,
    address: str | None = None,
    city: str | None = None,
    state: str | None = None,
) -> Customer:
    """Update a customer's details (name, phone, GST info, address, city, state)."""
    res = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.outlet_id == outlet_id,
        )
    )
    cust = res.scalar_one_or_none()
    if not cust:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    if name is not None:
        cust.name = name
    if extra_detail is not None:
        cust.extra_detail = extra_detail
    if gstin is not None:
        cust.gstin = gstin.strip().upper() if gstin else None
    if legal_name is not None:
        cust.legal_name = legal_name.strip() if legal_name else None
    if state_code is not None:
        cust.state_code = state_code.strip() if state_code else None
    if address is not None:
        cust.address = address.strip() if address else None
    if city is not None:
        cust.city = city.strip() if city else None
    if state is not None:
        cust.state = state.strip() if state else None
    if phone is not None:
        # Check if new phone is already taken by another customer
        if phone != cust.phone:
            existing = await db.execute(
                select(Customer).where(
                    Customer.outlet_id == outlet_id,
                    Customer.phone == phone,
                    Customer.id != customer_id
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phone number already in use by another customer"
                )
        cust.phone = phone

    await db.flush()
    await db.refresh(cust)
    return cust


async def delete_customer(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    customer_id: uuid.UUID,
) -> bool:
    """Delete a customer record by ID."""
    res = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.outlet_id == outlet_id,
        )
    )
    cust = res.scalar_one_or_none()
    if not cust:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    await db.delete(cust)
    await db.flush()
    return True


async def get_customer_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    phone: str,
    period: str = "all_time",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Get customer purchase volume, category interest, and item interest over a selected timeframe.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.order_item import OrderItem
    from app.models.category import Category
    from app.models.menu_item import MenuItem

    from app.models.customer_return import CustomerReturn

    clean_phone = phone.strip()
    cust_res = await db.execute(
        select(Customer).where(
            Customer.outlet_id == outlet_id,
            Customer.phone == clean_phone,
        )
    )
    cust = cust_res.scalar_one_or_none()
    cust_name = cust.name if cust else "Walk-In Customer"
    loyalty_points = cust.loyalty_points if cust else 0
    credit_balance = float(cust.credit_balance) if cust else 0.0
    extra_detail = cust.extra_detail if cust else None

    # Base query for paid, completed, or partially refunded orders
    order_stmt = select(Order.id, Order.total_amount, Order.created_at).where(
        Order.outlet_id == outlet_id,
        Order.status.in_([OrderStatusEnum.PAID, OrderStatusEnum.COMPLETED, OrderStatusEnum.PARTIALLY_REFUNDED]),
    )
    from sqlalchemy import or_
    ret_stmt = (
        select(func.coalesce(func.sum(CustomerReturn.total_refund_amount), 0))
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.customer_phone == clean_phone,
            or_(Order.id.is_(None), Order.is_void == False),
        )
    )

    if cust:
        order_stmt = order_stmt.where(Order.customer_id == cust.id)
    else:
        order_stmt = order_stmt.where(Order.customer_phone == clean_phone)

    now_ist = datetime.now(IST)
    if period == "this_week":
        # Monday of current week in IST
        start_ist = now_ist - timedelta(days=now_ist.weekday())
        start_ist = start_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        start_utc = start_ist.astimezone(timezone.utc).replace(tzinfo=None)
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif period == "this_month":
        start_ist = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_utc = start_ist.astimezone(timezone.utc).replace(tzinfo=None)
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif period == "last_1_week":
        start_utc = (now_ist - timedelta(days=7)).astimezone(timezone.utc).replace(tzinfo=None)
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif period == "last_month":
        start_utc = (now_ist - timedelta(days=30)).astimezone(timezone.utc).replace(tzinfo=None)
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif period == "last_6_months":
        start_utc = (now_ist - timedelta(days=180)).astimezone(timezone.utc).replace(tzinfo=None)
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif period == "last_year":
        start_utc = (now_ist - timedelta(days=365)).astimezone(timezone.utc).replace(tzinfo=None)
        order_stmt = order_stmt.where(Order.created_at >= start_utc)
        ret_stmt = ret_stmt.where(CustomerReturn.created_at >= start_utc)
    elif period == "custom" and start_date:
        try:
            s_dt = datetime.fromisoformat(start_date)
            order_stmt = order_stmt.where(Order.created_at >= s_dt)
            ret_stmt = ret_stmt.where(CustomerReturn.created_at >= s_dt)
        except Exception:
            pass
        if end_date:
            try:
                e_dt = datetime.fromisoformat(end_date)
                order_stmt = order_stmt.where(Order.created_at <= e_dt)
                ret_stmt = ret_stmt.where(CustomerReturn.created_at <= e_dt)
            except Exception:
                pass

    orders_res = await db.execute(order_stmt)
    matching_orders = orders_res.all()
    order_ids = [r.id for r in matching_orders]
    gross_volume = sum(float(r.total_amount or 0.0) for r in matching_orders)
    total_orders = len(matching_orders)

    ret_res = await db.execute(ret_stmt)
    refund_amount = float(ret_res.scalar() or 0.0)
    net_volume = round(max(0.0, gross_volume - refund_amount), 2)

    best_categories = []
    best_items = []

    if order_ids:
        from sqlalchemy import case
        net_qty_expr = case(
            (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
            else_=0,
        )
        net_line_total = net_qty_expr * OrderItem.unit_price

        # Category Interest
        cat_stmt = (
            select(
                func.coalesce(Category.name, "Uncategorized").label("category_name"),
                func.sum(net_qty_expr).label("total_qty"),
                func.sum(net_line_total).label("total_amount"),
            )
            .select_from(OrderItem)
            .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
            .outerjoin(Category, MenuItem.category_id == Category.id)
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(Category.name)
            .having(func.sum(net_qty_expr) > 0)
            .order_by(func.sum(net_line_total).desc())
            .limit(10)
        )
        cat_res = await db.execute(cat_stmt)
        for r in cat_res.all():
            best_categories.append({
                "category_name": r.category_name,
                "total_quantity": float(r.total_qty or 0),
                "total_amount": float(r.total_amount or 0.0),
            })

        # Item Interest
        item_stmt = (
            select(
                OrderItem.item_name,
                func.sum(net_qty_expr).label("total_qty"),
                func.sum(net_line_total).label("total_amount"),
            )
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(OrderItem.item_name)
            .having(func.sum(net_qty_expr) > 0)
            .order_by(func.sum(net_qty_expr).desc())
            .limit(10)
        )
        item_res = await db.execute(item_stmt)
        for r in item_res.all():
            best_items.append({
                "item_name": r.item_name or "Item",
                "total_quantity": float(r.total_qty or 0),
                "total_amount": float(r.total_amount or 0.0),
            })

    return {
        "customer_name": cust_name,
        "customer_phone": clean_phone,
        "period": period,
        "total_volume": net_volume,
        "gross_volume": round(gross_volume, 2),
        "refund_amount": round(refund_amount, 2),
        "total_orders": total_orders,
        "loyalty_points": loyalty_points,
        "credit_balance": credit_balance,
        "extra_detail": extra_detail,
        "best_categories": best_categories,
        "best_items": best_items,
    }


async def get_customer_ledger(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    customer_id: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    from app.models.customer_ledger import CustomerLedger
    from app.models.order import Order
    from app.models.user import User

    stmt = (
        select(CustomerLedger, Order.basket_number, User.name.label("created_by_name"))
        .outerjoin(Order, CustomerLedger.order_id == Order.id)
        .outerjoin(User, CustomerLedger.created_by_staff_id == User.id)
        .where(
            CustomerLedger.outlet_id == outlet_id,
            CustomerLedger.customer_id == customer_id,
        )
        .order_by(CustomerLedger.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    res = await db.execute(stmt)
    
    result = []
    for ledger, basket_number, created_by_name in res:
        result.append({
            "id": str(ledger.id),
            "customer_id": str(ledger.customer_id),
            "order_id": str(ledger.order_id) if ledger.order_id else None,
            "order_basket_number": basket_number,
            "entry_type": ledger.entry_type,
            "amount": float(ledger.amount),
            "balance_after": float(ledger.balance_after),
            "note": ledger.note,
            "created_by_name": created_by_name,
            "created_at": ledger.created_at,
        })
    return result
