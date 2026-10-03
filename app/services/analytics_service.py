"""
Analytics Service — SQL aggregation queries for revenue, peak hours, top dishes, order funnel, and profit margin analysis.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, time, timezone

from app.core.datetime_utils import ensure_naive_utc

from sqlalchemy import Float, Integer, String, Numeric, cast, func, select, text, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, aliased

from app.models.enums import OrderStatusEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.stock_ledger import StockLedger
from app.models.category import Category
from app.models.customer import Customer
from app.models.customer_return import CustomerReturn
from app.models.supplier import Supplier
from app.models.stock_intake import StockIntake
from app.models.purchase_return import PurchaseReturn
from app.models.cash_drawer_ledger import CashDrawerLedger
from app.models.bill_discount_approval import BillDiscountApproval
from app.models.abandoned_cart import AbandonedCart
from app.models.customer_ledger import CustomerLedger
from app.models.user import User

from app.schemas.analytics import (
    FunnelStage,
    KpiSummaryResponse,
    OrderFunnelResponse,
    PeakHourBucket,
    PeakHoursResponse,
    ProfitBucket,
    ProfitMarginResponse,
    RevenueBucket,
    RevenueAnalyticsResponse,
    TopItemResponse,
    TopItemsResponse,
    CategorySalesItem,
    CategorySalesResponse,
    ItemSalesRow,
    ItemSalesResponse,
    ItemSalesReconciliation,
    BillProfitRow,
    BillProfitResponse,
    AovBucket,
    AovByPaymentMethod,
    AovAnalyticsResponse,
    StockIntakeRow,
    StockIntakeReportResponse,
    WastageRow,
    WastageReportResponse,
    StockMovementRow,
    StockMovementResponse,
    PurchaseReturnRow,
    PurchaseReturnReportResponse,
    NewCustomerBucket,
    NewCustomerReportResponse, NewCustomerDetail,
    CustomerReturnRow,
    TopReturnedItem,
    ReturnLedgerEntry,
    CustomerReturnReportResponse,
    DenominationBreakdown,
    CashFlowByType,
    CashDenominationResponse,
    PaymentMixRow,
    PaymentMixResponse,
    TaxSlabRow,
    TaxSummaryResponse,
    TaxableBillRow,
    TaxableBillsResponse,
    ServiceChargeBillRow,
    ServiceChargesSummaryResponse,
    Gstr1HsnItem,
    Gstr1HsnSummaryResponse,
    DiscountSummary,
    DiscountByType,
    DiscountApprovalStats,
    TopDiscountReason,
    DiscountedBillDetail,
    DiscountReportResponse,
    DayBookEntry,
    DayBookResponse,
    AbandonedCartStatsResponse,
    LoyaltyReportResponse,
    SupplierBatchRow,
    SupplierSpendRow,
    SupplierSpendResponse,
    CustomerSpendOrder,
    CustomerSpendReturn,
    CustomerSpendRow,
    CustomerSpendsSummary,
    CustomerSpendsReportResponse,
    InventoryReconciliationBridge,
    InventorySummaryReportResponse,
)


# Valid non-cancelled status filters for revenue calculation
# NOTE: PAYMENT_PENDING is intentionally excluded — unpaid bills are NOT revenue.
SETTLED_STATUSES = [
    OrderStatusEnum.PAID,
    OrderStatusEnum.COMPLETED,
    OrderStatusEnum.PARTIALLY_REFUNDED,
    OrderStatusEnum.REFUNDED,
]


def _calc_pct_change(current: float, prev: float) -> float:
    if prev <= 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - prev) / prev) * 100.0, 2)


def _get_time_bucket_expr(column, granularity: str, dialect_name: str = "sqlite"):
    """Return SQL expression for time-bucketing compatible with PostgreSQL and SQLite."""
    granularity = granularity.lower()
    if dialect_name == "postgresql":
        trunc_unit = {
            "hourly": "hour",
            "daily": "day",
            "weekly": "week",
            "monthly": "month",
        }.get(granularity, "day")
        return func.date_trunc(trunc_unit, column)
    else:
        fmt = {
            "hourly": "%Y-%m-%d %H:00",
            "daily": "%Y-%m-%d",
            "weekly": "%Y-%W",
            "monthly": "%Y-%m",
        }.get(granularity, "%Y-%m-%d")
        return func.strftime(fmt, column)


async def get_kpi_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> KpiSummaryResponse:
    """Calculate overall KPIs and period-over-period percentage changes."""
    duration = to_dt - from_dt
    prev_from_dt = from_dt - duration
    prev_to_dt = from_dt

    # Current period revenue & orders (True Gross Billed - excluding voided bills)
    stmt_curr = select(
        func.coalesce(func.sum(cast(Order.total_amount, Numeric(10, 2))), 0).label("revenue"),
        func.count(Order.id).label("orders_count"),
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    res_curr = await db.execute(stmt_curr)
    row_curr = res_curr.first()
    curr_rev = float(row_curr.revenue) if row_curr else 0.0
    curr_orders = int(row_curr.orders_count) if row_curr else 0
    curr_aov = round(curr_rev / curr_orders, 2) if curr_orders > 0 else 0.0

    # Current period COGS from stock ledger for settled, non-voided orders
    stmt_cogs = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.RESTOCK, -func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0)),
                        else_=func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0),
                    )
                ),
                0,
            )
        )
        .select_from(StockLedger)
        .join(Order, StockLedger.reference_order_id == Order.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            StockLedger.change_type.in_([StockChangeTypeEnum.AUTO_DEDUCTION, StockChangeTypeEnum.OVERSOLD, StockChangeTypeEnum.RESTOCK]),
        )
    )
    res_cogs = await db.execute(stmt_cogs)
    net_cogs = max(0.0, float(res_cogs.scalar() or 0.0))
    net_profit = curr_rev - net_cogs
    curr_margin_pct = round((net_profit / curr_rev) * 100.0, 2) if curr_rev > 0 else 0.0

    # Previous period metrics (excluding voided orders)
    stmt_prev = select(
        func.coalesce(func.sum(Order.total_amount), 0).label("revenue"),
        func.count(Order.id).label("orders_count"),
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= prev_from_dt,
        Order.created_at <= prev_to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    res_prev = await db.execute(stmt_prev)
    row_prev = res_prev.first()
    prev_rev = float(row_prev.revenue) if row_prev else 0.0
    prev_orders = int(row_prev.orders_count) if row_prev else 0
    prev_aov = round(prev_rev / prev_orders, 2) if prev_orders > 0 else 0.0

    stmt_prev_cogs = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.RESTOCK, -func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0)),
                        else_=func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0),
                    )
                ),
                0,
            )
        )
        .select_from(StockLedger)
        .join(Order, StockLedger.reference_order_id == Order.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            Order.created_at >= prev_from_dt,
            Order.created_at <= prev_to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            StockLedger.change_type.in_([StockChangeTypeEnum.AUTO_DEDUCTION, StockChangeTypeEnum.OVERSOLD, StockChangeTypeEnum.RESTOCK]),
        )
    )
    res_prev_cogs = await db.execute(stmt_prev_cogs)
    prev_cogs = max(0.0, float(res_prev_cogs.scalar() or 0.0))
    prev_profit = prev_rev - prev_cogs
    prev_margin_pct = round((prev_profit / prev_rev) * 100.0, 2) if prev_rev > 0 else 0.0

    # New customers
    stmt_new_cust = select(func.count(Customer.id)).where(
        Customer.outlet_id == outlet_id,
        Customer.created_at >= from_dt,
        Customer.created_at <= to_dt,
    )
    res_new_cust = await db.execute(stmt_new_cust)
    new_customers = res_new_cust.scalar() or 0

    # Returns (current period) - Return Absolute
    # Use gross_return_amount when available (modern records), fallback to
    # refund + exchange for legacy records where gross_return_amount was not set.
    ret_val_expr = func.coalesce(
        func.nullif(CustomerReturn.gross_return_amount, 0),
        CustomerReturn.total_refund_amount + CustomerReturn.total_exchange_amount,
        CustomerReturn.total_refund_amount,
        0,
    )
    is_void_expr = func.coalesce(Order.is_void, False)
    stmt_returns = (
        select(
            is_void_expr.label("is_void"),
            func.count(CustomerReturn.id).label("count"),
            func.coalesce(func.sum(ret_val_expr), 0).label("amount"),
        )
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
            or_(Order.id.is_(None), Order.is_void == False),
        )
        .group_by(is_void_expr)
    )
    res_returns = await db.execute(stmt_returns)
    return_count = 0
    total_return_amount = 0.0
    void_return_count = 0
    void_return_amount = 0.0
    for row in res_returns:
        if row.is_void:
            void_return_count += row.count
            void_return_amount += float(row.amount)
        else:
            return_count += row.count
            total_return_amount += float(row.amount)

    # Current Net Revenue & Margin
    # Since curr_rev already excludes voided orders, we only subtract genuine customer returns
    curr_net_rev = curr_rev - total_return_amount
    net_profit = curr_net_rev - net_cogs
    curr_margin_pct = round((net_profit / curr_net_rev) * 100.0, 2) if curr_net_rev > 0 else 0.0
    curr_aov = round(curr_net_rev / curr_orders, 2) if curr_orders > 0 else 0.0

    # Previous period returns & net revenue (excluding voided orders)
    stmt_prev_returns = (
        select(func.coalesce(func.sum(ret_val_expr), 0).label("amount"))
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= prev_from_dt,
            CustomerReturn.created_at <= prev_to_dt,
            or_(Order.id.is_(None), Order.is_void == False),
        )
    )
    res_prev_returns = await db.execute(stmt_prev_returns)
    prev_return_amount = float(res_prev_returns.scalar() or 0.0)
    prev_net_rev = prev_rev - prev_return_amount
    prev_profit = prev_net_rev - prev_cogs
    prev_margin_pct = round((prev_profit / prev_net_rev) * 100.0, 2) if prev_net_rev > 0 else 0.0
    prev_aov = round(prev_net_rev / prev_orders, 2) if prev_orders > 0 else 0.0

    # Total discount (excluding voided orders)
    discount_val_expr = case(
        (
            and_(Order.discount_status == "APPROVED", Order.discount_type == "PERCENT"),
            Order.subtotal_amount * (Order.discount_value / 100.0),
        ),
        (Order.discount_status == "APPROVED", Order.discount_value),
        else_=0.0,
    )
    stmt_discount = select(
        func.coalesce(func.sum(discount_val_expr), 0)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    res_discount = await db.execute(stmt_discount)
    total_discount_given = float(res_discount.scalar() or 0.0)

    return KpiSummaryResponse(
        new_customers=new_customers,
        return_count=return_count,
        void_return_count=void_return_count,
        total_return_amount=round(total_return_amount, 2),
        void_return_amount=round(void_return_amount, 2),
        total_discount_given=round(total_discount_given, 2),
        gross_revenue=round(curr_rev, 2),
        net_revenue=round(curr_net_rev, 2),
        total_revenue=round(curr_net_rev, 2),
        total_orders=curr_orders,
        avg_order_value=curr_aov,
        profit_margin_pct=curr_margin_pct,
        cogs=round(net_cogs, 2),
        net_profit=round(net_profit, 2),
        prev_total_revenue=round(prev_net_rev, 2),
        prev_total_orders=prev_orders,
        prev_avg_order_value=prev_aov,
        prev_profit_margin_pct=prev_margin_pct,
        revenue_change_pct=_calc_pct_change(curr_net_rev, prev_net_rev),
        orders_change_pct=_calc_pct_change(float(curr_orders), float(prev_orders)),
        aov_change_pct=_calc_pct_change(curr_aov, prev_aov),
        margin_change_pct=round(curr_margin_pct - prev_margin_pct, 2),
    )


async def get_revenue_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> RevenueAnalyticsResponse:
    """Bucket revenue and order counts over time with previous period comparison overlay."""
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    bucket_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("bucket_time")

    stmt = (
        select(
            bucket_expr,
            func.sum(Order.total_amount).label("revenue"),
            func.count(Order.id).label("orders_count"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    )

    res = await db.execute(stmt)
    rows = res.all()

    # Query customer returns bucketed by same granularity (Return Absolute)
    ret_bucket_expr = _get_time_bucket_expr(CustomerReturn.created_at, granularity, dialect).label("bucket_time")
    stmt_ret = (
        select(
            ret_bucket_expr,
            func.sum(
                func.coalesce(
                    func.nullif(CustomerReturn.gross_return_amount, 0),
                    CustomerReturn.total_refund_amount + CustomerReturn.total_exchange_amount,
                    CustomerReturn.total_refund_amount,
                    0,
                )
            ).label("refund_amount"),
        )
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
            or_(Order.id.is_(None), Order.is_void == False),
        )
        .group_by(ret_bucket_expr)
    )
    res_ret = await db.execute(stmt_ret)
    ret_map: dict[str, float] = {}
    for r in res_ret.all():
        b_str = r.bucket_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.bucket_time, "strftime") else str(r.bucket_time)
        ret_map[b_str] = float(r.refund_amount or 0)

    buckets: list[RevenueBucket] = []
    for r in rows:
        b_str = r.bucket_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.bucket_time, "strftime") else str(r.bucket_time)
        gross_rev = float(r.revenue or 0)
        ret_amt = ret_map.pop(b_str, 0.0)
        net_rev = gross_rev - ret_amt
        buckets.append(
            RevenueBucket(
                bucket=b_str,
                revenue=round(net_rev, 2),
                orders_count=int(r.orders_count or 0),
            )
        )

    return RevenueAnalyticsResponse(
        granularity=granularity,
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        buckets=buckets,
    )


async def get_peak_hours(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PeakHoursResponse:
    """Group order volume by hour of day (0 to 23) in local time (IST)."""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        # Fallback for Python < 3.9 if zoneinfo isn't available, but we assume 3.9+ 
        from backports.zoneinfo import ZoneInfo
    ist_tz = ZoneInfo("Asia/Kolkata")

    stmt = (
        select(Order.created_at)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
    )
    
    res = await db.execute(stmt)
    hour_map: dict[int, int] = {}
    
    for row in res.all():
        dt = row.created_at
        if dt:
            dt_utc = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
            dt_ist = dt_utc.astimezone(ist_tz)
            hr = dt_ist.hour
            hour_map[hr] = hour_map.get(hr, 0) + 1

    buckets: list[PeakHourBucket] = []
    for h in range(24):
        cnt = hour_map.get(h, 0)
        label = f"{h:02d}:00"
        buckets.append(PeakHourBucket(hour=h, hour_label=label, orders_count=cnt))

    return PeakHoursResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        buckets=buckets,
    )


async def get_top_selling_items(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    sort_by: str,
    limit: int,
    from_dt: datetime,
    to_dt: datetime,
) -> TopItemsResponse:
    """Return top-performing menu items ranked by quantity sold or gross revenue."""
    net_qty_expr = case(
        (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
        else_=0,
    )
    total_qty_col = func.sum(net_qty_expr).label("total_qty")
    total_rev_col = func.sum(net_qty_expr * OrderItem.unit_price).label("total_rev")

    stmt = (
        select(
            OrderItem.menu_item_id,
            OrderItem.item_name,
            Category.name.label("category_name"),
            total_qty_col,
            total_rev_col,
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(Category, MenuItem.category_id == Category.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(OrderItem.menu_item_id, OrderItem.item_name, Category.name)
        .having(func.sum(net_qty_expr) > 0)
    )

    if sort_by.lower() == "revenue":
        stmt = stmt.order_by(total_rev_col.desc())
    else:
        stmt = stmt.order_by(total_qty_col.desc())

    stmt = stmt.limit(limit)
    res = await db.execute(stmt)
    rows = res.all()

    # Calculate global total revenue across all items in period for true revenue share %
    stmt_global_rev = (
        select(func.coalesce(func.sum(net_qty_expr * OrderItem.unit_price), 0.0))
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
    )
    total_rev_all = float((await db.execute(stmt_global_rev)).scalar() or 0.0)

    items: list[TopItemResponse] = []
    for r in rows:
        rev = round(float(r.total_rev or 0), 2)
        share = round((rev / total_rev_all) * 100.0, 2) if total_rev_all > 0 else 0.0
        qty = round(float(r.total_qty or 0), 3)
        items.append(
            TopItemResponse(
                menu_item_id=str(r.menu_item_id) if r.menu_item_id else None,
                name=r.item_name or "Unknown Item",
                category_name=r.category_name,
                quantity_sold=int(qty) if qty.is_integer() else qty,
                revenue=rev,
                revenue_share_pct=share,
            )
        )

    return TopItemsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        sort_by=sort_by,
        items=items,
    )


async def get_order_funnel(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> OrderFunnelResponse:
    """Order funnel stage counts, conversion rates, and cancellation percentage."""
    stmt = (
        select(
            Order.status,
            func.count(Order.id).label("cnt"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.is_void == False,
        )
        .group_by(Order.status)
    )

    res = await db.execute(stmt)
    status_counts: dict[str, int] = {}
    for row in res.all():
        st = row.status.value if hasattr(row.status, "value") else str(row.status)
        status_counts[st] = status_counts.get(st, 0) + int(row.cnt or 0)

    total_orders = sum(status_counts.values())

    def _get_status_count(*statuses) -> int:
        return sum(
            status_counts.get(s.value if hasattr(s, "value") else str(s), 0)
            for s in statuses
        )

    pending_cnt = _get_status_count(OrderStatusEnum.PENDING, OrderStatusEnum.PENDING_VERIFICATION, OrderStatusEnum.PAYMENT_PENDING)
    paid_cnt = _get_status_count(OrderStatusEnum.PAID, OrderStatusEnum.PARTIALLY_REFUNDED)
    served_cnt = _get_status_count(OrderStatusEnum.COMPLETED)
    cancelled_cnt = _get_status_count(OrderStatusEnum.CANCELLED, OrderStatusEnum.REFUNDED)

    stages = [
        FunnelStage(
            stage="PENDING",
            stage_label="Confirmation / Payment Pending",
            count=pending_cnt,
            percentage=round((pending_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
        FunnelStage(
            stage="PAID",
            stage_label="Paid / Kitchen Preparing",
            count=paid_cnt,
            percentage=round((paid_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
        FunnelStage(
            stage="SERVED",
            stage_label="Served & Completed",
            count=served_cnt,
            percentage=round((served_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
        FunnelStage(
            stage="CANCELLED",
            stage_label="Cancelled Orders",
            count=cancelled_cnt,
            percentage=round((cancelled_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0,
        ),
    ]

    conversion_rate = round(((paid_cnt + served_cnt) / total_orders) * 100.0, 2) if total_orders > 0 else 0.0
    cancellation_rate = round((cancelled_cnt / total_orders) * 100.0, 2) if total_orders > 0 else 0.0

    return OrderFunnelResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_orders=total_orders,
        stages=stages,
        conversion_rate_pct=conversion_rate,
        cancellation_rate_pct=cancellation_rate,
    )


async def get_profit_margin_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> ProfitMarginResponse:
    """Bucket revenue, COGS, and profit margin over time for trend analysis."""
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    rev_b_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("b_time")
    cogs_b_expr = _get_time_bucket_expr(StockLedger.created_at, granularity, dialect).label("b_time")

    # Revenue query
    rev_stmt = (
        select(
            rev_b_expr,
            func.sum(Order.total_amount).label("rev"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(rev_b_expr)
    )
    res_rev = await db.execute(rev_stmt)
    raw_rev_map = {
        (r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)): float(r.rev or 0)
        for r in res_rev.all()
    }

    # Net out customer returns bucketed by same granularity
    ret_b_expr = _get_time_bucket_expr(CustomerReturn.created_at, granularity, dialect).label("b_time")
    stmt_ret = (
        select(
            ret_b_expr,
            func.sum(
                func.coalesce(
                    func.nullif(CustomerReturn.gross_return_amount, 0),
                    CustomerReturn.total_refund_amount + CustomerReturn.total_exchange_amount,
                    CustomerReturn.total_refund_amount,
                    0,
                )
            ).label("refund_amount"),
        )
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
            or_(Order.id.is_(None), Order.is_void == False),
        )
        .group_by(ret_b_expr)
    )
    res_ret = await db.execute(stmt_ret)
    ret_map = {
        (r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)): float(r.refund_amount or 0)
        for r in res_ret.all()
    }

    rev_map = {
        k: raw_rev_map.get(k, 0.0) - ret_map.get(k, 0.0)
        for k in set(raw_rev_map.keys()) | set(ret_map.keys())
    }

    # COGS deduction query (nets out restocks/settlements) for settled orders only
    cogs_b_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("b_time")
    cogs_stmt = (
        select(
            cogs_b_expr,
            func.sum(
                case(
                    (StockLedger.change_type == StockChangeTypeEnum.RESTOCK, -func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0)),
                    else_=func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0),
                )
            ).label("cogs_val"),
        )
        .select_from(StockLedger)
        .join(Order, StockLedger.reference_order_id == Order.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            StockLedger.change_type.in_([StockChangeTypeEnum.AUTO_DEDUCTION, StockChangeTypeEnum.OVERSOLD, StockChangeTypeEnum.RESTOCK]),
        )
        .group_by(cogs_b_expr)
    )
    res_cogs = await db.execute(cogs_stmt)
    cogs_map = {
        (r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)): float(r.cogs_val or 0)
        for r in res_cogs.all()
    }

    all_keys = sorted(list(set(rev_map.keys()) | set(cogs_map.keys())))

    buckets: list[ProfitBucket] = []
    tot_rev = 0.0
    tot_cogs = 0.0

    for k in all_keys:
        r_val = rev_map.get(k, 0.0)
        c_val = cogs_map.get(k, 0.0)
        p_val = r_val - c_val
        m_val = round((p_val / r_val) * 100.0, 2) if r_val > 0 else 0.0

        buckets.append(
            ProfitBucket(
                bucket=k,
                revenue=round(r_val, 2),
                cogs=round(c_val, 2),
                profit=round(p_val, 2),
                margin_pct=m_val,
            )
        )
        tot_rev += r_val
        tot_cogs += c_val

    tot_profit = tot_rev - tot_cogs
    overall_margin = round((tot_profit / tot_rev) * 100.0, 2) if tot_rev > 0 else 0.0

    return ProfitMarginResponse(
        granularity=granularity,
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_revenue=round(tot_rev, 2),
        total_cogs=round(tot_cogs, 2),
        total_profit=round(tot_profit, 2),
        overall_margin_pct=overall_margin,
        buckets=buckets,
    )


async def get_category_sales(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CategorySalesResponse:
    """Breakdown gross sales, returns, and revenue share by Category."""
    net_qty_expr = case(
        (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
        else_=0,
    )
    discount_multiplier = case(
        (Order.discount_status != "APPROVED", 1.0),
        (Order.discount_type == "COMPLIMENTARY", 0.0),
        (
            Order.discount_type == "PERCENT",
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0),
            ),
        ),
        (
            and_(Order.subtotal_amount != None, Order.subtotal_amount > 0),
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount),
            ),
        ),
        else_=1.0,
    )
    net_rev_expr = net_qty_expr * OrderItem.unit_price * discount_multiplier

    stmt = (
        select(
            Category.id.label("category_id"),
            Category.name.label("category_name"),
            func.count(func.distinct(OrderItem.menu_item_id)).label("items_sold"),
            func.sum(net_qty_expr).label("quantity_sold"),
            func.sum(net_rev_expr).label("revenue"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .join(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Category, MenuItem.category_id == Category.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(Category.id, Category.name)
        .having(func.sum(net_qty_expr) > 0)
        .order_by(func.sum(net_rev_expr).desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    total_rev = sum(float(r.revenue or 0) for r in rows)
    
    items = []
    for r in rows:
        rev = float(r.revenue or 0)
        qty = float(r.quantity_sold or 0)
        items.append(
            CategorySalesItem(
                category_id=str(r.category_id) if r.category_id else None,
                category_name=r.category_name or "Unknown",
                items_sold=int(r.items_sold or 0),
                quantity_sold=qty,
                revenue=round(rev, 2),
                revenue_share_pct=round((rev / total_rev) * 100.0, 2) if total_rev > 0 else 0.0,
                avg_item_price=round(rev / qty, 2) if qty > 0 else 0.0
            )
        )
    
    return CategorySalesResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_revenue=round(total_rev, 2),
        total_categories=len(items),
        items=items
    )


async def get_item_sales(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    sort_by: str,
    limit: int,
    category_id: str | None = None,
) -> ItemSalesResponse:
    from_dt_naive = ensure_naive_utc(from_dt)
    to_dt_naive = ensure_naive_utc(to_dt)

    # 1. Settled Orders in target timeframe
    settled_orders = (
        select(Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .subquery("settled_orders")
    )

    # 2. Clean item name expression (stripping oversold backorder tag)
    clean_item_name = func.trim(
        func.replace(OrderItem.item_name, " [Oversold Backorder]", "")
    )

    # 3. Match inventory item fallback
    inv_by_barcode = (
        select(InventoryItem.id)
        .where(
            InventoryItem.outlet_id == outlet_id,
            MenuItem.barcode != None,
            MenuItem.barcode != "",
            InventoryItem.barcode == MenuItem.barcode,
        )
        .limit(1)
        .scalar_subquery()
    )
    inv_by_menu_name = (
        select(InventoryItem.id)
        .where(
            InventoryItem.outlet_id == outlet_id,
            func.lower(func.trim(InventoryItem.name)) == func.lower(func.trim(MenuItem.name)),
        )
        .limit(1)
        .scalar_subquery()
    )
    inv_by_clean_name = (
        select(InventoryItem.id)
        .where(
            InventoryItem.outlet_id == outlet_id,
            func.lower(func.trim(InventoryItem.name)) == func.lower(clean_item_name),
        )
        .limit(1)
        .scalar_subquery()
    )

    effective_inv_id = func.coalesce(
        MenuItem.inventory_item_id,
        inv_by_barcode,
        inv_by_menu_name,
        inv_by_clean_name,
    )

    # 4. Raw order items with effective_inv_id and net quantities
    net_qty_expr = case(
        (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
        else_=0,
    )
    net_line_total = net_qty_expr * OrderItem.unit_price

    raw_items_stmt = (
        select(
            OrderItem.id.label("order_item_id"),
            OrderItem.order_id.label("order_id"),
            cast(OrderItem.menu_item_id, String).label("menu_item_id"),
            clean_item_name.label("clean_name"),
            net_qty_expr.label("quantity"),
            net_line_total.label("line_total"),
            Category.name.label("category_name"),
            effective_inv_id.label("effective_inv_id"),
        )
        .select_from(OrderItem)
        .join(settled_orders, OrderItem.order_id == settled_orders.c.id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(Category, MenuItem.category_id == Category.id)
    )

    if category_id:
        try:
            raw_items_stmt = raw_items_stmt.where(MenuItem.category_id == uuid.UUID(category_id))
        except (ValueError, TypeError, AttributeError):
            pass

    raw_items = raw_items_stmt.subquery("raw_items")

    # 5. Total ledger COGS and net quantity per (order_id, item_id)
    order_ledger_totals = (
        select(
            StockLedger.reference_order_id.label("order_id"),
            StockLedger.item_id.label("effective_inv_id"),
            func.sum(
                case(
                    (
                        StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
                        -func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
                    ),
                    else_=func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
                )
            ).label("order_ledger_cogs"),
            func.sum(
                case(
                    (
                        StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
                        -func.abs(StockLedger.quantity_change)
                    ),
                    else_=func.abs(StockLedger.quantity_change)
                )
            ).label("order_ledger_qty"),
        )
        .join(settled_orders, StockLedger.reference_order_id == settled_orders.c.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.change_type.in_([
                StockChangeTypeEnum.AUTO_DEDUCTION,
                StockChangeTypeEnum.OVERSOLD,
                StockChangeTypeEnum.RESTOCK,
            ]),
        )
        .group_by(StockLedger.reference_order_id, StockLedger.item_id)
        .subquery("order_ledger_totals")
    )

    # 6. Fallback item cost from InventoryItem or oldest batch
    fallback_cost = func.coalesce(
        select(InventoryItem.cost_per_unit)
        .where(InventoryItem.id == raw_items.c.effective_inv_id)
        .limit(1)
        .scalar_subquery(),
        select(StockIntake.unit_cost)
        .where(
            StockIntake.item_id == raw_items.c.effective_inv_id,
            StockIntake.remaining_quantity > 0,
        )
        .order_by(StockIntake.intake_date.asc(), StockIntake.created_at.asc())
        .limit(1)
        .scalar_subquery(),
        0.0
    )

    # 7. Group raw_items by order_id and effective_inv_id to align 1:1 with order_ledger_totals
    grouped_raw_items = (
        select(
            raw_items.c.order_id,
            raw_items.c.effective_inv_id,
            raw_items.c.clean_name,
            func.max(cast(raw_items.c.menu_item_id, String)).label("menu_item_id"),
            func.max(raw_items.c.category_name).label("category_name"),
            func.sum(raw_items.c.quantity).label("raw_quantity"),
            func.sum(raw_items.c.line_total).label("line_total"),
        )
        .group_by(
            raw_items.c.order_id,
            raw_items.c.effective_inv_id,
            raw_items.c.clean_name
        )
        .subquery("grouped_raw_items")
    )

    # 8. Line COGS and True Base Quantity with ledger unit cost or fallback
    line_cogs = (
        select(
            grouped_raw_items.c.menu_item_id,
            grouped_raw_items.c.clean_name,
            grouped_raw_items.c.category_name,
            grouped_raw_items.c.line_total,
            case(
                (order_ledger_totals.c.order_ledger_qty != None, order_ledger_totals.c.order_ledger_qty),
                else_=cast(grouped_raw_items.c.raw_quantity, Float)
            ).label("quantity"),
            case(
                (order_ledger_totals.c.order_ledger_cogs != None, order_ledger_totals.c.order_ledger_cogs),
                else_=cast(grouped_raw_items.c.raw_quantity, Float) * fallback_cost
            ).label("computed_cogs"),
            fallback_cost.label("fallback_unit_cost"),
        )
        .select_from(grouped_raw_items)
        .outerjoin(
            order_ledger_totals,
            and_(
                grouped_raw_items.c.order_id == order_ledger_totals.c.order_id,
                grouped_raw_items.c.effective_inv_id == order_ledger_totals.c.effective_inv_id,
            )
        )
        .subquery("line_cogs")
    )

    # 9. Grouped Item Sales
    total_rev_expr = func.sum(line_cogs.c.line_total)
    total_cogs_expr = func.sum(line_cogs.c.computed_cogs)
    total_qty_expr = func.sum(line_cogs.c.quantity)
    profit_expr = total_rev_expr - total_cogs_expr

    stmt = (
        select(
            func.max(cast(line_cogs.c.menu_item_id, String)).label("menu_item_id"),
            line_cogs.c.clean_name.label("item_name"),
            func.max(line_cogs.c.category_name).label("category_name"),
            total_qty_expr.label("quantity_sold"),
            total_rev_expr.label("revenue"),
            total_cogs_expr.label("total_cogs"),
            case(
                (total_qty_expr > 0, total_cogs_expr / total_qty_expr),
                else_=func.avg(line_cogs.c.fallback_unit_cost)
            ).label("cost_per_unit"),
            profit_expr.label("estimated_profit"),
            case(
                (total_rev_expr > 0, (profit_expr / total_rev_expr) * 100.0),
                else_=0.0
            ).label("margin_pct"),
        )
        .select_from(line_cogs)
        .group_by(line_cogs.c.clean_name)
        .having(total_qty_expr > 0)
    )

    # True Global Aggregation across ALL matching items (unbounded by pagination limit)
    grouped_subq = stmt.subquery("grouped_subq")
    agg_stmt = select(
        func.count().label("total_items_count"),
        func.coalesce(func.sum(grouped_subq.c.revenue), 0.0).label("global_rev"),
        func.coalesce(func.sum(grouped_subq.c.total_cogs), 0.0).label("global_cogs"),
        func.coalesce(func.sum(grouped_subq.c.quantity_sold), 0.0).label("global_qty"),
    )
    agg_res = await db.execute(agg_stmt)
    agg_row = agg_res.first()
    total_items = int(agg_row.total_items_count or 0) if agg_row else 0
    total_rev = float(agg_row.global_rev or 0.0) if agg_row else 0.0
    total_cogs = float(agg_row.global_cogs or 0.0) if agg_row else 0.0
    total_units = float(agg_row.global_qty or 0.0) if agg_row else 0.0
    total_profit = total_rev - total_cogs
    overall_margin = round((total_profit / total_rev) * 100.0, 2) if total_rev > 0 else 0.0

    sort_lower = (sort_by or "revenue").lower()
    if sort_lower == "revenue":
        stmt = stmt.order_by(total_rev_expr.desc())
    elif sort_lower == "profit":
        stmt = stmt.order_by(profit_expr.desc())
    elif sort_lower == "margin":
        stmt = stmt.order_by(case((total_rev_expr > 0, (profit_expr / total_rev_expr) * 100.0), else_=0.0).desc())
    else:
        stmt = stmt.order_by(total_qty_expr.desc())

    if limit > 0:
        stmt = stmt.limit(limit)

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for r in rows:
        rev = float(r.revenue or 0)
        qty = float(r.quantity_sold or 0)
        cogs = float(r.total_cogs or 0)
        cpu = float(r.cost_per_unit or 0) if r.cost_per_unit is not None else (cogs / qty if qty > 0 else 0.0)
        profit = float(r.estimated_profit or 0)
        margin = float(r.margin_pct) if r.margin_pct is not None else (round((profit / rev) * 100.0, 2) if rev > 0 else 0.0)

        items.append(
            ItemSalesRow(
                menu_item_id=str(r.menu_item_id) if r.menu_item_id else None,
                item_name=r.item_name or "Unknown Item",
                category_name=r.category_name,
                quantity_sold=round(qty, 3),
                revenue=round(rev, 2),
                revenue_share_pct=round((rev / total_rev) * 100.0, 2) if total_rev > 0 else 0.0,
                cogs=round(cogs, 2),
                cost_per_unit=round(cpu, 2),
                estimated_profit=round(profit, 2),
                margin_pct=round(margin, 2),
            )
        )

    # 10. Financial Reconciliation Bridge (Gross Catalog -> Deductions -> Net Billed Revenue)
    stmt_item_gross = (
        select(
            func.coalesce(func.sum(OrderItem.quantity * OrderItem.unit_price), 0.0).label("gross_items"),
            func.coalesce(
                func.sum(
                    case(
                        (OrderItem.returned_quantity > 0, OrderItem.returned_quantity * OrderItem.unit_price),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("ret_items"),
        )
        .select_from(OrderItem)
        .join(settled_orders, OrderItem.order_id == settled_orders.c.id)
    )
    if category_id:
        stmt_item_gross = stmt_item_gross.outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id).where(
            MenuItem.category_id == uuid.UUID(category_id)
        )
    res_ig = await db.execute(stmt_item_gross)
    row_ig = res_ig.first()
    gross_item_sales = float(row_ig.gross_items or 0.0) if row_ig else 0.0
    item_returns_val = float(row_ig.ret_items or 0.0) if row_ig else 0.0
    net_item_sales = gross_item_sales - item_returns_val

    # Order-level discounts, loyalty redemptions & delivery/handling charges
    stmt_order_adj = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(Order.discount_status == "APPROVED", Order.discount_type == "PERCENT"),
                            Order.subtotal_amount * (Order.discount_value / 100.0),
                        ),
                        (Order.discount_status == "APPROVED", Order.discount_value),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("bill_disc"),
            func.coalesce(func.sum(Order.loyalty_discount_inr), 0.0).label("loyalty_disc"),
            func.coalesce(
                func.sum(
                    func.coalesce(Order.delivery_charge, 0.0)
                    + func.coalesce(Order.handling_charge, 0.0)
                ),
                0.0,
            ).label("delivery_and_handling"),
            func.coalesce(func.sum(Order.total_amount), 0.0).label("gross_orders"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
    )
    res_order_adj = await db.execute(stmt_order_adj)
    row_oa = res_order_adj.first()
    bill_discounts = float(row_oa.bill_disc or 0.0) if row_oa else 0.0
    loyalty_discounts = float(row_oa.loyalty_disc or 0.0) if row_oa else 0.0
    delivery_and_handling = float(row_oa.delivery_and_handling or 0.0) if row_oa else 0.0
    gross_orders = float(row_oa.gross_orders or 0.0) if row_oa else 0.0

    # Extract GST decomposition across settled items in the period
    tax_rate_expr = func.coalesce(OrderItem.tax_rate, 0.0)
    stmt_tax_rates = (
        select(
            OrderItem.order_id,
            tax_rate_expr.label("rate"),
            func.sum(
                case(
                    (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
                    else_=0.0,
                )
                * OrderItem.unit_price
            ).label("gross_val"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(OrderItem.order_id, tax_rate_expr)
    )
    res_tax_rates = await db.execute(stmt_tax_rates)
    extracted_gst = 0.0
    orders_with_gst = set()
    for tr in res_tax_rates.all():
        g_val = float(tr.gross_val or 0.0)
        r_val = float(tr.rate or 0.0)
        if r_val > 0.0:
            tax_part = g_val - (g_val / (1.0 + (r_val / 100.0)))
            extracted_gst += tax_part
            if tax_part > 0.005:
                orders_with_gst.add(tr.order_id)

    # Returns during period (matching Customer Returns and Payment Mix logic)
    ret_val_expr = func.coalesce(
        func.nullif(CustomerReturn.gross_return_amount, 0),
        CustomerReturn.total_refund_amount + CustomerReturn.total_exchange_amount,
        CustomerReturn.total_refund_amount,
        0,
    )
    is_void_expr = func.coalesce(Order.is_void, False)
    stmt_returns = (
        select(is_void_expr.label("is_void"), func.coalesce(func.sum(ret_val_expr), 0.0))
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt_naive,
            CustomerReturn.created_at <= to_dt_naive,
            or_(Order.id.is_(None), Order.is_void == False),
        )
        .group_by(is_void_expr)
    )
    res_returns = await db.execute(stmt_returns)
    customer_returns = 0.0
    voided_customer_returns = 0.0
    for row in res_returns:
        is_void = row[0]
        amt = float(row[1])
        if is_void:
            voided_customer_returns += amt
        else:
            customer_returns += amt
            
    net_billed_revenue = gross_orders - customer_returns

    # Rounding adjustment = actual billed totals − reconstructed catalog totals
    # Captures per-bill rounding to nearest ₹ and any structural differences
    reconstructed_gross = gross_item_sales + delivery_and_handling - bill_discounts
    rounding_adj = gross_orders - reconstructed_gross

    reconciliation_bridge = ItemSalesReconciliation(
        gross_item_sales=round(gross_item_sales, 2),
        item_returns=round(item_returns_val, 2),
        net_item_sales=round(net_item_sales, 2),
        bill_discounts=round(bill_discounts, 2),
        loyalty_discounts=round(loyalty_discounts, 2),
        taxes_and_charges=round(delivery_and_handling, 2),
        delivery_and_handling_charges=round(delivery_and_handling, 2),
        extracted_gst_amount=round(extracted_gst, 2),
        taxable_bills_count=len(orders_with_gst),
        customer_returns=round(customer_returns, 2),
        voided_customer_returns=round(voided_customer_returns, 2),
        gross_billed_revenue=round(gross_orders, 2),
        rounding_adjustment=round(rounding_adj, 2),
        net_billed_revenue=round(net_billed_revenue, 2),
    )

    return ItemSalesResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        sort_by=sort_by,
        category_filter=category_id,
        total_items=total_items,
        total_units_sold=round(total_units, 3),
        total_revenue=round(total_rev, 2),
        total_cogs=round(total_cogs, 2),
        total_profit=round(total_profit, 2),
        overall_margin_pct=overall_margin,
        reconciliation_bridge=reconciliation_bridge,
        items=items,
    )


async def get_bill_profit(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    limit: int = 50,
    offset: int = 0
) -> BillProfitResponse:
    # Accurate COGS subquery from StockLedger (which records exact unit-converted deductions and reconciled costs)
    cogs_subq = (
        select(
            StockLedger.reference_order_id.label("order_id"),
            func.sum(
                case(
                    (
                        StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
                        -func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
                    ),
                    else_=func.abs(StockLedger.quantity_change) * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
                )
            ).label("ledger_cogs")
        )
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.change_type.in_([
                StockChangeTypeEnum.AUTO_DEDUCTION,
                StockChangeTypeEnum.OVERSOLD,
                StockChangeTypeEnum.RESTOCK,
            ])
        )
        .group_by(StockLedger.reference_order_id)
        .subquery()
    )

    bill_disc_mult = case(
        (Order.discount_status != "APPROVED", 1.0),
        (Order.discount_type == "COMPLIMENTARY", 0.0),
        (
            Order.discount_type == "PERCENT",
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0),
            ),
        ),
        (
            and_(Order.subtotal_amount != None, Order.subtotal_amount > 0),
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount),
            ),
        ),
        else_=1.0,
    )

    # Refund subquery from OrderItem returned quantities
    refund_subq = (
        select(
            OrderItem.order_id.label("order_id"),
            func.sum(
                case(
                    (OrderItem.returned_quantity > 0, OrderItem.returned_quantity * OrderItem.unit_price * bill_disc_mult),
                    else_=0.0,
                )
            ).label("refunded_amt"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .group_by(OrderItem.order_id)
        .subquery()
    )

    refund_amt_expr = func.coalesce(refund_subq.c.refunded_amt, 0.0)

    stmt = (
        select(
            Order.id,
            Order.basket_number,
            Order.customer_name,
            Order.created_at,
            Order.payment_method,
            Order.subtotal_amount,
            Order.discount_value,
            Order.total_amount,
            Order.is_void,
            refund_amt_expr.label("refunded_amt"),
            func.count(OrderItem.id.distinct()).label("items_count"),
            func.coalesce(
                cogs_subq.c.ledger_cogs,
                func.sum(
                    case(
                        (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
                        else_=0,
                    ) * func.coalesce(StockIntake.unit_cost, InventoryItem.cost_per_unit, 0)
                ),
                0
            ).label("estimated_cogs")
        )
        .select_from(Order)
        .outerjoin(OrderItem, Order.id == OrderItem.order_id)
        .outerjoin(StockIntake, OrderItem.selected_batch_id == StockIntake.id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(InventoryItem, MenuItem.inventory_item_id == InventoryItem.id)
        .outerjoin(cogs_subq, Order.id == cogs_subq.c.order_id)
        .outerjoin(refund_subq, Order.id == refund_subq.c.order_id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(
            Order.id,
            Order.basket_number,
            Order.customer_name,
            Order.created_at,
            Order.payment_method,
            Order.subtotal_amount,
            Order.discount_value,
            Order.total_amount,
            Order.is_void,
            cogs_subq.c.ledger_cogs,
            refund_amt_expr,
        )
        .order_by(Order.created_at.desc())
    )
    
    # Total stats across all bills
    stmt_totals = (
        select(
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_amount), 0).label("gross_rev"),
            func.coalesce(func.sum(refund_subq.c.refunded_amt), 0).label("tot_refunds"),
        )
        .select_from(Order)
        .outerjoin(refund_subq, Order.id == refund_subq.c.order_id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
    )
    res_totals = await db.execute(stmt_totals)
    tot_row = res_totals.first()
    tot_bills = int(tot_row[0] or 0) if tot_row else 0
    tot_gross_rev = float(tot_row[1] or 0.0) if tot_row else 0.0
    tot_refunds = float(tot_row[2] or 0.0) if tot_row else 0.0
    tot_rev = tot_gross_rev - tot_refunds

    # Global COGS across all settled bills in period (matching row-level fallback logic)
    per_bill_cogs_expr = func.coalesce(
        cogs_subq.c.ledger_cogs,
        func.sum(
            case(
                (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
                else_=0,
            ) * func.coalesce(StockIntake.unit_cost, InventoryItem.cost_per_unit, 0)
        ),
        0
    )
    stmt_global_cogs_subq = (
        select(
            Order.id,
            per_bill_cogs_expr.label("bill_cogs"),
        )
        .select_from(Order)
        .outerjoin(OrderItem, Order.id == OrderItem.order_id)
        .outerjoin(StockIntake, OrderItem.selected_batch_id == StockIntake.id)
        .outerjoin(MenuItem, OrderItem.menu_item_id == MenuItem.id)
        .outerjoin(InventoryItem, MenuItem.inventory_item_id == InventoryItem.id)
        .outerjoin(cogs_subq, Order.id == cogs_subq.c.order_id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(Order.id, cogs_subq.c.ledger_cogs)
        .subquery()
    )
    stmt_global_cogs = select(func.coalesce(func.sum(stmt_global_cogs_subq.c.bill_cogs), 0.0))
    res_global_cogs = await db.execute(stmt_global_cogs)
    tot_cogs = float(res_global_cogs.scalar() or 0.0)

    # Paginated rows
    stmt = stmt.limit(limit).offset(offset)
    res = await db.execute(stmt)
    rows = res.all()

    bills = []
    for r in rows:
        gross_tot = float(r.total_amount or 0)
        ref_amt = float(r.refunded_amt or 0)
        net_amt = gross_tot - ref_amt
        cogs = float(r.estimated_cogs or 0)
        profit = net_amt - cogs
        pm = r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method) if r.payment_method else None
        bills.append(
            BillProfitRow(
                order_id=str(r.id),
                basket_number=r.basket_number or "",
                customer_name=r.customer_name,
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                payment_method=pm,
                subtotal_amount=float(r.subtotal_amount or 0),
                discount_value=float(r.discount_value or 0),
                total_amount=gross_tot,
                total_refunded_amount=round(ref_amt, 2),
                refunded_amt=round(ref_amt, 2),
                net_amount=round(net_amt, 2),
                estimated_cogs=round(cogs, 2),
                estimated_profit=round(profit, 2),
                margin_pct=round((profit / net_amt) * 100.0, 2) if net_amt > 0 else 0.0,
                is_void=bool(r.is_void),
                items_count=int(r.items_count or 0)
            )
        )

    tot_profit = tot_rev - tot_cogs
    overall_margin_pct = round((tot_profit / tot_rev) * 100.0, 2) if tot_rev > 0 else 0.0

    return BillProfitResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_bills=tot_bills,
        total_revenue=round(tot_rev, 2),
        total_refunded_amount=round(tot_refunds, 2),
        total_cogs=round(tot_cogs, 2),
        total_profit=round(tot_profit, 2),
        overall_margin_pct=overall_margin_pct,
        bills=bills
    )


async def get_aov_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> AovAnalyticsResponse:
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    b_expr = _get_time_bucket_expr(Order.created_at, granularity, dialect).label("b_time")

    refund_subq = (
        select(
            OrderItem.order_id,
            func.coalesce(
                func.sum(
                    case(
                        (OrderItem.returned_quantity > 0, OrderItem.returned_quantity * OrderItem.unit_price),
                        else_=0.0,
                    )
                ),
                0,
            ).label("refunded_amount"),
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )

    net_order_expr = case(
        (
            Order.total_amount - func.coalesce(refund_subq.c.refunded_amount, 0) > 0,
            Order.total_amount - func.coalesce(refund_subq.c.refunded_amount, 0),
        ),
        else_=0.0,
    )

    # Trend
    stmt_trend = (
        select(
            b_expr,
            func.avg(net_order_expr).label("aov"),
            func.count(Order.id).label("cnt"),
            func.sum(net_order_expr).label("rev"),
        )
        .outerjoin(refund_subq, Order.id == refund_subq.c.order_id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(b_expr)
        .order_by(b_expr)
    )
    res_trend = await db.execute(stmt_trend)
    trend = []
    tot_rev, tot_ord = 0.0, 0
    for r in res_trend.all():
        b_str = r.b_time.strftime("%Y-%m-%d %H:%M") if hasattr(r.b_time, "strftime") else str(r.b_time)
        trend.append(
            AovBucket(
                bucket=b_str,
                avg_order_value=round(float(r.aov or 0), 2),
                orders_count=int(r.cnt or 0)
            )
        )
        tot_rev += float(r.rev or 0)
        tot_ord += int(r.cnt or 0)
        
    overall_aov = round(tot_rev / tot_ord, 2) if tot_ord > 0 else 0.0

    # By Payment Method
    stmt_pm = (
        select(
            Order.payment_method,
            func.avg(net_order_expr).label("aov"),
            func.count(Order.id).label("cnt"),
            func.sum(net_order_expr).label("rev"),
            func.sum(func.coalesce(Order.cash_amount, 0)).label("cash_sum"),
            func.sum(func.coalesce(Order.upi_amount, 0)).label("upi_sum"),
            func.sum(func.coalesce(Order.credit_applied, 0)).label("credit_sum"),
            func.sum(func.coalesce(Order.debit_applied, 0)).label("debit_sum"),
        )
        .outerjoin(refund_subq, Order.id == refund_subq.c.order_id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(Order.payment_method)
    )
    res_pm = await db.execute(stmt_pm)
    by_pm = []
    for r in res_pm.all():
        pm = r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method) if r.payment_method else "UNKNOWN"
        cnt = int(r.cnt or 0)
        aov = round(float(r.aov or 0), 2)
        rev = float(r.rev or 0)
        c_sum = float(r.cash_sum or 0)
        u_sum = float(r.upi_sum or 0)
        cr_sum = float(r.credit_sum or 0)
        db_sum = float(r.debit_sum or 0)

        cash_share_pct = None
        upi_share_pct = None
        credit_share_pct = None
        debit_share_pct = None
        avg_cash = None
        avg_upi = None
        avg_credit = None
        avg_debit = None
        tenders_present = []
        breakdown_desc = None

        if pm.upper() == "SPLIT" or (cnt > 0 and ((cr_sum > 0) or (db_sum > 0) or (c_sum > 0 and u_sum > 0))):
            base_tot = (c_sum + u_sum + cr_sum + db_sum) if (c_sum + u_sum + cr_sum + db_sum) > 0 else (rev if rev > 0 else 1.0)
            parts = []
            if c_sum > 0:
                cash_share_pct = round((c_sum / base_tot) * 100.0, 1)
                avg_cash = round(c_sum / cnt, 2) if cnt > 0 else 0.0
                parts.append(f"Cash: ₹{c_sum:.2f} ({cash_share_pct:.1f}%)")
                tenders_present.append("Cash")
            if u_sum > 0:
                upi_share_pct = round((u_sum / base_tot) * 100.0, 1)
                avg_upi = round(u_sum / cnt, 2) if cnt > 0 else 0.0
                parts.append(f"UPI: ₹{u_sum:.2f} ({upi_share_pct:.1f}%)")
                tenders_present.append("UPI")
            if cr_sum > 0:
                credit_share_pct = round((cr_sum / base_tot) * 100.0, 1)
                avg_credit = round(cr_sum / cnt, 2) if cnt > 0 else 0.0
                parts.append(f"Store Credit: ₹{cr_sum:.2f} ({credit_share_pct:.1f}%)")
                tenders_present.append("Store Credit")
            if db_sum > 0:
                debit_share_pct = round((db_sum / base_tot) * 100.0, 1)
                avg_debit = round(db_sum / cnt, 2) if cnt > 0 else 0.0
                parts.append(f"Udhaar: ₹{db_sum:.2f} ({debit_share_pct:.1f}%)")
                tenders_present.append("Udhaar")

            if parts:
                breakdown_desc = " • ".join(parts)
        elif pm.upper() == "CASH":
            tenders_present.append("Cash")
        elif pm.upper() == "UPI":
            tenders_present.append("UPI")

        by_pm.append(
            AovByPaymentMethod(
                payment_method=pm,
                avg_order_value=aov,
                orders_count=cnt,
                total_revenue=round(rev, 2),
                cash_amount=round(c_sum, 2) if c_sum > 0 else None,
                upi_amount=round(u_sum, 2) if u_sum > 0 else None,
                credit_amount=round(cr_sum, 2) if cr_sum > 0 else None,
                debit_amount=round(db_sum, 2) if db_sum > 0 else None,
                avg_cash=avg_cash,
                avg_upi=avg_upi,
                avg_credit=avg_credit,
                avg_debit=avg_debit,
                cash_share_pct=cash_share_pct,
                upi_share_pct=upi_share_pct,
                credit_share_pct=credit_share_pct,
                debit_share_pct=debit_share_pct,
                tenders_present=tenders_present if tenders_present else None,
                breakdown_description=breakdown_desc,
            )
        )

    return AovAnalyticsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        overall_aov=overall_aov,
        trend=trend,
        by_payment_method=by_pm
    )


async def get_stock_intake_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    item_id: str | None = None,
    supplier_id: str | None = None
) -> StockIntakeReportResponse:
    stmt = (
        select(
            StockIntake.id,
            InventoryItem.name.label("item_name"),
            StockIntake.item_id,
            Supplier.name.label("supplier_name"),
            StockIntake.batch_number,
            StockIntake.quantity,
            StockIntake.unit_cost,
            StockIntake.intake_date,
            StockIntake.expiry_date
        )
        .select_from(StockIntake)
        .join(InventoryItem, StockIntake.item_id == InventoryItem.id)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date >= from_dt,
            StockIntake.intake_date <= to_dt,
            ~StockIntake.batch_number.like("BAT-OV-%"),
        )
        .order_by(StockIntake.intake_date.desc())
    )

    if item_id:
        stmt = stmt.where(StockIntake.item_id == uuid.UUID(item_id))
    if supplier_id:
        stmt = stmt.where(StockIntake.supplier_id == uuid.UUID(supplier_id))

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    tot_qty = 0.0
    tot_cost = 0.0
    for r in rows:
        qty = float(r.quantity or 0)
        uc = float(r.unit_cost or 0)
        tc = qty * uc
        tot_qty += qty
        tot_cost += tc
        items.append(
            StockIntakeRow(
                intake_id=str(r.id),
                item_name=r.item_name or "Unknown",
                item_id=str(r.item_id),
                supplier_name=r.supplier_name,
                batch_number=r.batch_number,
                quantity=qty,
                unit_cost=uc,
                total_cost=round(tc, 2),
                intake_date=r.intake_date.isoformat() if hasattr(r.intake_date, "isoformat") else str(r.intake_date),
                expiry_date=r.expiry_date.isoformat() if hasattr(r.expiry_date, "isoformat") else str(r.expiry_date) if r.expiry_date else None
            )
        )

    return StockIntakeReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_intakes=len(items),
        total_quantity=round(tot_qty, 2),
        total_cost=round(tot_cost, 2),
        items=items
    )


async def get_wastage_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> WastageReportResponse:
    stmt = (
        select(
            InventoryItem.name.label("item_name"),
            InventoryItem.id.label("item_id"),
            StockLedger.change_type,
            StockLedger.reason,
            StockLedger.notes,
            func.abs(StockLedger.quantity_change).label("quantity_wasted"),
            StockLedger.unit_cost_snapshot,
            StockLedger.created_at,
            User.name.label("created_by_name")
        )
        .select_from(StockLedger)
        .join(InventoryItem, StockLedger.item_id == InventoryItem.id)
        .outerjoin(User, StockLedger.created_by == User.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at >= from_dt,
            StockLedger.created_at <= to_dt,
            StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT,
            StockLedger.quantity_change < 0,
            or_(
                StockLedger.reason.is_(None),
                ~StockLedger.reason.in_(["VOID_BATCH", "INTAKE_CORRECTION", "OVERSOLD_RECONCILE"]),
            ),
        )
        .order_by(StockLedger.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    items = []
    tot_qty = 0.0
    tot_cost = 0.0
    reason_map = {
        "SPOILED_EXPIRED": "Spoiled / Expired",
        "DAMAGED_TRANSIT": "Damaged / Broken",
        "AUDIT_CORRECTION": "Audit Variance",
        "THEFT_LOST": "Theft / Missing",
        "OTHER": "Other Reason",
    }

    audit_count = 0
    audit_cost = 0.0

    for r in rows:
        qty = float(r.quantity_wasted or 0)
        uc = float(r.unit_cost_snapshot or 0)
        wc = qty * uc
        tot_qty += qty
        tot_cost += wc
        raw_reason = r.reason or (r.change_type.value if hasattr(r.change_type, "value") else str(r.change_type))
        if raw_reason == "AUDIT_CORRECTION":
            audit_count += 1
            audit_cost += wc
        display_reason = reason_map.get(raw_reason, raw_reason.replace("_", " ").title())

        items.append(
            WastageRow(
                item_name=r.item_name or "Unknown",
                item_id=str(r.item_id),
                change_type=r.change_type.value if hasattr(r.change_type, "value") else str(r.change_type),
                reason=display_reason,
                notes=r.notes,
                quantity_wasted=qty,
                unit_cost=uc,
                wastage_cost=round(wc, 2),
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                created_by_name=r.created_by_name
            )
        )

    # Get total intake cost for pct calc (excluding oversold negative deficit batches)
    stmt_intake = select(func.coalesce(func.sum(StockIntake.quantity * StockIntake.unit_cost), 0)).where(
        StockIntake.outlet_id == outlet_id,
        StockIntake.intake_date >= from_dt,
        StockIntake.intake_date <= to_dt,
        StockIntake.quantity > 0,
        ~StockIntake.batch_number.like("BAT-OV-%"),
    )
    res_intake = await db.execute(stmt_intake)
    tot_intake_cost = float(res_intake.scalar() or 0.0)
    wastage_pct = round((tot_cost / tot_intake_cost) * 100.0, 2) if tot_intake_cost > 0 else 0.0

    return WastageReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_wastage_entries=len(items),
        total_quantity_wasted=round(tot_qty, 2),
        total_wastage_cost=round(tot_cost, 2),
        wastage_pct_of_intake=wastage_pct,
        total_audit_corrections=audit_count,
        audit_correction_cost=round(audit_cost, 2),
        items=items
    )


async def get_stock_movement(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> StockMovementResponse:
    # Subquery for net stock quantity movements that occurred AFTER to_dt (for historical rollback)
    post_delta_subq = (
        select(
            StockLedger.item_id,
            func.coalesce(func.sum(StockLedger.quantity_change), 0.0).label("post_change")
        )
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at > to_dt,
        )
        .group_by(StockLedger.item_id)
        .subquery("post_delta_subq")
    )

    stmt = (
        select(
            InventoryItem.id.label("item_id"),
            InventoryItem.name.label("item_name"),
            InventoryItem.unit,
            InventoryItem.current_stock.label("current_stock"),
            func.coalesce(post_delta_subq.c.post_change, 0.0).label("post_change"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.INTAKE, StockLedger.quantity_change),
                        else_=0
                    ), 0
                )
            ).label("intake_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type.in_([StockChangeTypeEnum.AUTO_DEDUCTION, StockChangeTypeEnum.OVERSOLD]), func.abs(StockLedger.quantity_change)),
                        else_=0
                    ), 0
                )
            ).label("sales_deduction_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT, StockLedger.quantity_change),
                        else_=0
                    ), 0
                )
            ).label("manual_adjustment_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.RESTOCK, StockLedger.quantity_change),
                        else_=0
                    ), 0
                )
            ).label("restock_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.PURCHASE_RETURN, func.abs(StockLedger.quantity_change)),
                        else_=0
                    ), 0
                )
            ).label("purchase_return_qty"),
            func.sum(
                func.coalesce(
                    case(
                        (StockLedger.change_type == StockChangeTypeEnum.VOID_BATCH, func.abs(StockLedger.quantity_change)),
                        else_=0
                    ), 0
                )
            ).label("void_batch_qty")
        )
        .select_from(InventoryItem)
        .outerjoin(post_delta_subq, InventoryItem.id == post_delta_subq.c.item_id)
        .outerjoin(
            StockLedger, 
            (InventoryItem.id == StockLedger.item_id) & 
            (StockLedger.outlet_id == outlet_id) & 
            (StockLedger.created_at >= from_dt) & 
            (StockLedger.created_at <= to_dt)
        )
        .where(
            InventoryItem.outlet_id == outlet_id,
            InventoryItem.is_active == True
        )
        .group_by(InventoryItem.id, InventoryItem.name, InventoryItem.unit, InventoryItem.current_stock, post_delta_subq.c.post_change)
        .order_by(InventoryItem.name)
    )
    res = await db.execute(stmt)
    
    items = []
    for r in res.all():
        curr = float(r.current_stock or 0)
        post_chg = float(r.post_change or 0)
        cls = curr - post_chg
        inv = float(r.intake_qty or 0)
        sal = float(r.sales_deduction_qty or 0)
        man = float(r.manual_adjustment_qty or 0)
        res_qty = float(r.restock_qty or 0)
        pre = float(r.purchase_return_qty or 0)
        vbc = float(r.void_batch_qty or 0)

        net_change = inv - sal + man + res_qty - pre - vbc
        opn = cls - net_change

        items.append(
            StockMovementRow(
                item_id=str(r.item_id),
                item_name=r.item_name or "Unknown",
                unit=r.unit or "pcs",
                opening_stock=round(opn, 2),
                intake_qty=round(inv, 2),
                sales_deduction_qty=round(sal, 2),
                manual_adjustment_qty=round(man, 2),
                restock_qty=round(res_qty, 2),
                purchase_return_qty=round(pre, 2),
                void_batch_qty=round(vbc, 2),
                closing_stock=round(cls, 2)
            )
        )

    return StockMovementResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_items=len(items),
        items=items
    )


async def get_purchase_returns_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PurchaseReturnReportResponse:
    stmt = (
        select(
            PurchaseReturn.id,
            PurchaseReturn.return_number,
            InventoryItem.name.label("item_name"),
            func.coalesce(Supplier.name, PurchaseReturn.supplier_name, "Unknown").label("supplier_name"),
            PurchaseReturn.batch_number,
            PurchaseReturn.quantity,
            PurchaseReturn.unit_cost,
            PurchaseReturn.total_refund_amount,
            PurchaseReturn.reason,
            PurchaseReturn.created_at
        )
        .select_from(PurchaseReturn)
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(StockIntake, PurchaseReturn.intake_id == StockIntake.id)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            PurchaseReturn.outlet_id == outlet_id,
            PurchaseReturn.created_at >= from_dt,
            PurchaseReturn.created_at <= to_dt,
        )
        .order_by(PurchaseReturn.created_at.desc())
    )
    res = await db.execute(stmt)
    
    items = []
    tot_ref = 0.0
    for r in res.all():
        amt = float(r.total_refund_amount or 0)
        tot_ref += amt
        items.append(
            PurchaseReturnRow(
                return_id=str(r.id),
                return_number=r.return_number or "",
                item_name=r.item_name or "Unknown",
                supplier_name=r.supplier_name or "Unknown",
                batch_number=r.batch_number,
                quantity=float(r.quantity or 0),
                unit_cost=float(r.unit_cost or 0),
                total_refund_amount=round(amt, 2),
                reason=r.reason or "",
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at)
            )
        )

    return PurchaseReturnReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_returns=len(items),
        total_refund_amount=round(tot_ref, 2),
        items=items
    )


async def get_new_customers(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    granularity: str,
    from_dt: datetime,
    to_dt: datetime,
) -> NewCustomerReportResponse:
    bind = db.bind or db.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"
    b_expr = _get_time_bucket_expr(Customer.created_at, granularity, dialect).label("b_time")

    stmt = (
        select(
            b_expr,
            func.count(Customer.id).label("new_count")
        )
        .where(
            Customer.outlet_id == outlet_id,
            Customer.created_at >= from_dt,
            Customer.created_at <= to_dt,
        )
        .group_by(b_expr)
        .order_by(b_expr)
    )
    res = await db.execute(stmt)
    
    stmt_all = select(func.count(Customer.id)).where(Customer.outlet_id == outlet_id)
    res_all = await db.execute(stmt_all)
    tot_all = res_all.scalar() or 0

    stmt_before = select(func.count(Customer.id)).where(
        Customer.outlet_id == outlet_id, Customer.created_at < from_dt
    )
    res_before = await db.execute(stmt_before)
    cum_tot = res_before.scalar() or 0

    trend = []
    tot_new = 0
    for r in res.all():
        nc = int(r.new_count or 0)
        cum_tot += nc
        tot_new += nc
        b_str = r.b_time.strftime("%Y-%m-%d") if hasattr(r.b_time, "strftime") else str(r.b_time)
        trend.append(
            NewCustomerBucket(
                bucket=b_str,
                new_count=nc,
                cumulative_total=cum_tot
            )
        )

    recent_cust_stmt = (
        select(
            Customer.id,
            Customer.name,
            Customer.phone,
            Customer.created_at,
            func.count(Order.id).label("total_orders"),
            func.sum(Order.total_amount).label("total_spent"),
        )
        .outerjoin(
            Order,
            and_(
                Order.customer_id == Customer.id,
                Order.status.in_(SETTLED_STATUSES),
                Order.is_void == False,
            )
        )
        .where(
            Customer.outlet_id == outlet_id,
            Customer.created_at >= from_dt,
            Customer.created_at <= to_dt,
        )
        .group_by(Customer.id, Customer.name, Customer.phone, Customer.created_at)
        .order_by(Customer.created_at.desc())
        .limit(50)
    )
    
    recent_res = await db.execute(recent_cust_stmt)
    
    recent_customers = []
    for r in recent_res.all():
        recent_customers.append(
            NewCustomerDetail(
                customer_id=str(r.id),
                name=r.name,
                phone=r.phone,
                email=None,
                created_at=r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
                total_orders=int(r.total_orders or 0),
                total_spent=float(r.total_spent or 0.0),
            )
        )

    return NewCustomerReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        granularity=granularity,
        total_new_customers=tot_new,
        total_customers_all_time=tot_all,
        trend=trend,
        recent_customers=recent_customers
    )


async def get_customer_return_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CustomerReturnReportResponse:
    stmt = (
        select(
            CustomerReturn.id,
            CustomerReturn.return_number,
            CustomerReturn.order_id,
            Order.customer_name.label("order_customer_name"),
            Order.customer_phone.label("order_customer_phone"),
            CustomerReturn.customer_name.label("return_customer_name"),
            CustomerReturn.customer_phone.label("return_customer_phone"),
            CustomerReturn.returned_items,
            CustomerReturn.gross_return_amount,
            CustomerReturn.total_refund_amount,
            CustomerReturn.total_exchange_amount,
            CustomerReturn.refund_payment_method,
            CustomerReturn.created_at,
            Order.is_void.label("is_void_return")
        )
        .select_from(CustomerReturn)
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
        )
        .order_by(CustomerReturn.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    returns = []
    return_ledger = []
    tot_ref = 0.0
    item_stats = {}
    
    for r in rows:
        if getattr(r, "is_void_return", False) or False:
            continue

        amt = float(r.total_refund_amount or 0)
        gross_amt = float(getattr(r, "gross_return_amount", None) or (amt + (float(getattr(r, "total_exchange_amount", 0) or 0))))
        tot_ref += gross_amt
        ritems = r.returned_items if isinstance(r.returned_items, list) else []
        c_name = r.return_customer_name or r.order_customer_name
        c_phone = r.return_customer_phone or r.order_customer_phone
        created_at_str = r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at)
        
        returns.append(
            CustomerReturnRow(
                return_id=str(r.id),
                return_number=r.return_number or "",
                order_id=str(r.order_id) if r.order_id else None,
                customer_name=c_name,
                customer_phone=c_phone,
                items_returned=len(ritems),
                is_void_return=getattr(r, "is_void_return", False) or False,
                gross_return_amount=round(gross_amt, 2),
                total_exchange_amount=round(float(getattr(r, "total_exchange_amount", 0) or 0), 2),
                total_refund_amount=round(amt, 2),
                refund_payment_method=r.refund_payment_method.value if hasattr(r.refund_payment_method, "value") else str(r.refund_payment_method),
                created_at=created_at_str
            )
        )
        
        for item in ritems:
            iname = item.get("item_name", "Unknown")
            iqty = float(item.get("quantity", 0))
            iuprice = float(item.get("unit_price", 0))
            
            selected_unit = item.get("selected_unit", "")
            if selected_unit:
                unit_clean = str(selected_unit).strip().lower()
                weight_g_synonyms = {"g", "gm", "gms", "gram", "grams"}
                volume_ml_synonyms = {"ml", "milliliter", "milliliters", "millilitre"}
                if unit_clean in weight_g_synonyms or unit_clean in volume_ml_synonyms:
                    iqty = iqty * 0.001
                elif unit_clean in {"dozen", "doz"}:
                    iqty = iqty * 12.0
                elif unit_clean in {"half dozen", "half-dozen", "half doz"}:
                    iqty = iqty * 6.0

            ilrefund = float(item.get("line_refund", 0)) if item.get("line_refund") is not None else round(iqty * iuprice, 2)
            iamt = iqty * iuprice
            
            if iname not in item_stats:
                item_stats[iname] = {"count": 0, "qty": 0.0, "amt": 0.0}
            item_stats[iname]["count"] += 1
            item_stats[iname]["qty"] += iqty
            item_stats[iname]["amt"] += iamt

            return_ledger.append(
                ReturnLedgerEntry(
                    return_number=r.return_number or "",
                    return_id=str(r.id),
                    order_id=str(r.order_id) if r.order_id else None,
                    customer_name=c_name,
                    customer_phone=c_phone,
                    item_name=iname,
                    menu_item_id=str(item.get("menu_item_id")) if item.get("menu_item_id") else None,
                    quantity=round(iqty, 3),
                    selected_unit=item.get("selected_unit"),
                    unit_price=round(iuprice, 2),
                    line_refund=round(ilrefund, 2),
                    reason=item.get("reason", "") or "",
                    created_at=created_at_str,
                )
            )

    top_items = []
    for k, v in sorted(item_stats.items(), key=lambda x: x[1]["amt"], reverse=True):
        top_items.append(
            TopReturnedItem(
                item_name=k,
                return_count=v["count"],
                total_quantity_returned=round(v["qty"], 2),
                total_refund_amount=round(v["amt"], 2)
            )
        )

    stmt_ords = select(
        func.count(Order.id).label("orders_count"),
        func.coalesce(func.sum(cast(Order.total_amount, Numeric(10, 2))), 0).label("revenue")
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    res_ords = await db.execute(stmt_ords)
    row_ords = res_ords.first()
    
    tot_ords = int(row_ords.orders_count) if row_ords else 0
    tot_rev = float(row_ords.revenue) if row_ords else 0.0
    
    distinct_orders_returned = set()
    direct_returns_count = 0
    for r in returns:
        if r.order_id:
            distinct_orders_returned.add(r.order_id)
        else:
            direct_returns_count += 1
            
    total_distinct_returns = len(distinct_orders_returned) + direct_returns_count
    
    rr_pct = round((total_distinct_returns / tot_ords) * 100.0, 2) if tot_ords > 0 else 0.0
    rr_value_pct = float(round((tot_ref / tot_rev) * 100.0, 2)) if tot_rev > 0 else 0.0

    return CustomerReturnReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_returns=total_distinct_returns,
        total_refund_amount=round(tot_ref, 2),
        return_rate_pct=rr_pct,
        return_rate_value_pct=rr_value_pct,
        top_returned_items=top_items,
        returns=returns,
        return_ledger=return_ledger,
    )


async def get_cash_denomination_flow(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CashDenominationResponse:
    stmt = (
        select(
            CashDrawerLedger.transaction_type,
            CashDrawerLedger.denominations
        )
        .outerjoin(Order, CashDrawerLedger.reference_order_id == Order.id)
        .where(
            CashDrawerLedger.outlet_id == outlet_id,
            CashDrawerLedger.created_at >= from_dt,
            CashDrawerLedger.created_at <= to_dt,
            or_(Order.id.is_(None), Order.is_void == False),
        )
    )
    res = await db.execute(stmt)
    
    types_map = {}
    overall_map = {}
    net_in_drawer = 0.0
    tot_tx = 0

    for r in res.all():
        ttype = r.transaction_type.value if hasattr(r.transaction_type, "value") else str(r.transaction_type)
        denoms = r.denominations if isinstance(r.denominations, dict) else {}
        
        if ttype not in types_map:
            types_map[ttype] = {"tx": 0, "denoms": {}}
        
        types_map[ttype]["tx"] += 1
        tot_tx += 1
        
        is_outflow_type = ttype in ("MANUAL_WITHDRAWAL", "CUSTOMER_CHANGE")

        for d, count in denoms.items():
            if not count: continue
            try:
                d_val = float(d)
                cnt = int(count)
            except (ValueError, TypeError):
                continue
            
            if d not in overall_map:
                overall_map[d] = {"in": 0, "out": 0}
            if d not in types_map[ttype]["denoms"]:
                types_map[ttype]["denoms"][d] = {"in": 0, "out": 0}
                
            if is_outflow_type:
                out_qty = abs(cnt)
                overall_map[d]["out"] += out_qty
                types_map[ttype]["denoms"][d]["out"] += out_qty
                net_in_drawer -= out_qty * d_val
            elif cnt > 0:
                overall_map[d]["in"] += cnt
                types_map[ttype]["denoms"][d]["in"] += cnt
                net_in_drawer += cnt * d_val
            else:
                out_qty = abs(cnt)
                overall_map[d]["out"] += out_qty
                types_map[ttype]["denoms"][d]["out"] += out_qty
                net_in_drawer -= out_qty * d_val

    def safe_float_key(x):
        try:
            return float(x)
        except (ValueError, TypeError):
            return 0.0

    overall_denoms = []
    for d in sorted(overall_map.keys(), key=safe_float_key, reverse=True):
        inn = overall_map[d]["in"]
        out = overall_map[d]["out"]
        d_val = safe_float_key(d)
        overall_denoms.append(
            DenominationBreakdown(
                denomination=d,
                notes_in=inn,
                notes_out=out,
                net_notes=inn - out,
                net_value=(inn - out) * d_val
            )
        )
        
    by_type = []
    for ttype, dinfo in types_map.items():
        tdenoms = []
        for d in sorted(dinfo["denoms"].keys(), key=safe_float_key, reverse=True):
            inn = dinfo["denoms"][d]["in"]
            out = dinfo["denoms"][d]["out"]
            d_val = safe_float_key(d)
            tdenoms.append(
                DenominationBreakdown(
                    denomination=d,
                    notes_in=inn,
                    notes_out=out,
                    net_notes=inn - out,
                    net_value=(inn - out) * d_val
                )
            )
        by_type.append(
            CashFlowByType(
                transaction_type=ttype,
                total_transactions=dinfo["tx"],
                denominations=tdenoms
            )
        )

    return CashDenominationResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_transactions=tot_tx,
        net_cash_in_drawer=round(net_in_drawer, 2),
        by_transaction_type=by_type,
        overall_denominations=overall_denoms
    )


async def get_payment_mix(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> PaymentMixResponse:
    # 0. Total distinct settled orders in period (matches get_kpi_summary)
    stmt_order_count = select(func.count(Order.id)).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    total_distinct_orders = (await db.execute(stmt_order_count)).scalar() or 0

    # 1. Gross revenue & order counts by payment method and tender
    stmt = (
        select(
            Order.payment_method,
            func.coalesce(Order.cash_amount, 0).label("cash_amt"),
            func.coalesce(Order.upi_amount, 0).label("upi_amt"),
            func.coalesce(Order.loyalty_discount_inr, 0).label("loyalty_amt"),
            func.coalesce(Order.credit_applied, 0).label("credit_amt"),
            func.coalesce(Order.debit_applied, 0).label("debit_amt"),
            func.coalesce(Order.total_amount, 0).label("tot_amt"),
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
    )
    res = await db.execute(stmt)
    order_rows = res.all()

    pm_orders: dict[str, dict] = {}

    for r in order_rows:
        pm_str = (r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method or "UNKNOWN")).upper()
        c_amt = float(r.cash_amt or 0)
        u_amt = float(r.upi_amt or 0)
        loyalty_amt = float(r.loyalty_amt or 0)
        credit_amt = float(r.credit_amt or 0)
        debit_amt = float(r.debit_amt or 0)
        tot = float(r.tot_amt or 0)

        # Ensure documented tenders do not exceed the order total_amount
        raw_sum = c_amt + u_amt + loyalty_amt + credit_amt + debit_amt
        if tot <= 0:
            c_amt = 0.0
            u_amt = 0.0
            loyalty_amt = 0.0
            credit_amt = 0.0
            debit_amt = 0.0
        elif raw_sum > tot:
            non_cash = loyalty_amt + credit_amt + debit_amt
            if non_cash >= tot:
                c_amt = 0.0
                u_amt = 0.0
                scale = tot / non_cash
                loyalty_amt *= scale
                credit_amt *= scale
                debit_amt *= scale
            else:
                rem = tot - non_cash
                if (c_amt + u_amt) > 0:
                    scale = rem / (c_amt + u_amt)
                    c_amt *= scale
                    u_amt *= scale

        # 1. Direct tender allocation (Cash, UPI, Split)
        is_split = (pm_str == "SPLIT") or (c_amt > 0 and u_amt > 0)
        if is_split:
            key = "SPLIT"
            if key not in pm_orders:
                pm_orders[key] = {"pm": "SPLIT", "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "DIRECT"}
            allocated = (c_amt + u_amt) if (c_amt + u_amt) > 0 else max(0.0, tot - credit_amt - debit_amt - loyalty_amt)
            if allocated > 0:
                pm_orders[key]["gross"] += allocated
                pm_orders[key]["cnt"] += 1
                pm_orders[key]["cash_amt"] += c_amt
                pm_orders[key]["upi_amt"] += u_amt
        elif pm_str == "UPI" or (u_amt > 0 and c_amt == 0):
            key = "UPI"
            if key not in pm_orders:
                pm_orders[key] = {"pm": "UPI", "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "DIRECT"}
            allocated = u_amt if u_amt > 0 else max(0.0, tot - credit_amt - debit_amt - loyalty_amt)
            if allocated > 0:
                pm_orders[key]["gross"] += allocated
                pm_orders[key]["cnt"] += 1
                pm_orders[key]["upi_amt"] += allocated
        elif c_amt > 0 or pm_str == "CASH" or (u_amt == 0 and loyalty_amt == 0 and credit_amt == 0 and debit_amt == 0):
            key = "CASH"
            if key not in pm_orders:
                pm_orders[key] = {"pm": "CASH", "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "DIRECT"}
            allocated = c_amt if c_amt > 0 else max(0.0, tot - credit_amt - debit_amt - loyalty_amt)
            if allocated > 0:
                pm_orders[key]["gross"] += allocated
                pm_orders[key]["cnt"] += 1
                pm_orders[key]["cash_amt"] += allocated

        # 2. Non-cash tender allocation
        if loyalty_amt > 0:
            key = "LOYALTY_POINTS"
            if key not in pm_orders:
                pm_orders[key] = {"pm": "LOYALTY_POINTS", "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "NON_CASH"}
            pm_orders[key]["gross"] += loyalty_amt
            pm_orders[key]["cnt"] += 1

        if credit_amt > 0:
            key = "STORE_CREDIT"
            if key not in pm_orders:
                pm_orders[key] = {"pm": "STORE_CREDIT", "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "NON_CASH"}
            pm_orders[key]["gross"] += credit_amt
            pm_orders[key]["cnt"] += 1

        if debit_amt > 0:
            key = "UDHAAR"
            if key not in pm_orders:
                pm_orders[key] = {"pm": "UDHAAR", "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "NON_CASH"}
            pm_orders[key]["gross"] += debit_amt
            pm_orders[key]["cnt"] += 1

    # 2. Refunds by refund payment method from CustomerReturn (aligned with get_kpi_summary)
    ret_val_expr = func.coalesce(
        func.nullif(CustomerReturn.gross_return_amount, 0),
        CustomerReturn.total_refund_amount + CustomerReturn.total_exchange_amount,
        CustomerReturn.total_refund_amount,
        0,
    )
    stmt_refunds = (
        select(
            func.coalesce(CustomerReturn.refund_payment_method, "CASH").label("pm"),
            ret_val_expr.label("tot_ret_val"),
            func.coalesce(CustomerReturn.credit_awarded, 0).label("credit_awarded"),
        )
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
            or_(Order.id == None, Order.is_void == False),
        )
    )
    res_refunds = await db.execute(stmt_refunds)
    refund_map: dict[str, float] = {}
    for r in res_refunds.all():
        pm_k = (r.pm.value if hasattr(r.pm, "value") else str(r.pm)).upper()
        tot_val = float(r.tot_ret_val or 0)
        c_awarded = float(r.credit_awarded or 0)

        credit_part = min(tot_val, c_awarded)
        direct_part = max(0.0, tot_val - credit_part)

        if credit_part > 0:
            refund_map["STORE_CREDIT"] = refund_map.get("STORE_CREDIT", 0.0) + credit_part
        if direct_part > 0:
            refund_map[pm_k] = refund_map.get(pm_k, 0.0) + direct_part

    all_keys = sorted(list(set(pm_orders.keys()) | set(refund_map.keys())))
    rows_data = []
    tot_rev = 0.0
    tot_gross = 0.0
    tot_refund = 0.0

    for k in all_keys:
        ord_info = pm_orders.get(k, {"pm": k, "cnt": 0, "gross": 0.0, "cash_amt": 0.0, "upi_amt": 0.0, "tender_type": "DIRECT"})
        gross = ord_info["gross"]
        cnt = ord_info["cnt"]
        ref = refund_map.get(k, 0.0)
        net = gross - ref
        cash_amt = ord_info.get("cash_amt", 0.0)
        upi_amt = ord_info.get("upi_amt", 0.0)
        ttype = ord_info.get("tender_type", "DIRECT")

        tot_gross += gross
        tot_refund += ref

        cash_share_pct = None
        upi_share_pct = None
        breakdown_desc = None

        if ord_info["pm"] == "SPLIT":
            base_tot = (cash_amt + upi_amt) if (cash_amt + upi_amt) > 0 else (net if net > 0 else 1.0)
            cash_share_pct = round((cash_amt / base_tot) * 100.0, 1)
            upi_share_pct = round((upi_amt / base_tot) * 100.0, 1)
            breakdown_desc = f"Cash: ₹{cash_amt:.2f} ({cash_share_pct:.1f}%) • UPI: ₹{upi_amt:.2f} ({upi_share_pct:.1f}%)"

        rows_data.append({
            "pm": ord_info["pm"],
            "cnt": cnt,
            "gross": gross,
            "refund": ref,
            "net": net,
            "cash_amt": cash_amt if ord_info["pm"] == "SPLIT" else None,
            "upi_amt": upi_amt if ord_info["pm"] == "SPLIT" else None,
            "cash_share_pct": cash_share_pct,
            "upi_share_pct": upi_share_pct,
            "breakdown_desc": breakdown_desc,
            "tender_type": ttype,
        })

    tot_rev = tot_gross - tot_refund

    # Sort: Direct tenders first, then non-cash, ordered by net revenue descending
    rows_data.sort(key=lambda x: (0 if x["tender_type"] == "DIRECT" else 1, -x["net"]))

    methods = []
    for d in rows_data:
        net = d["net"]
        cnt = d["cnt"]
        methods.append(
            PaymentMixRow(
                payment_method=d["pm"],
                orders_count=cnt,
                total_revenue=round(net, 2),
                gross_revenue=round(d["gross"], 2),
                total_refunded=round(d["refund"], 2),
                revenue_share_pct=round((net / tot_rev) * 100.0, 2) if tot_rev > 0 else 0.0,
                avg_order_value=round(net / cnt, 2) if cnt > 0 else 0.0,
                cash_amount=round(d["cash_amt"], 2) if d["cash_amt"] is not None else None,
                upi_amount=round(d["upi_amt"], 2) if d["upi_amt"] is not None else None,
                cash_share_pct=d["cash_share_pct"],
                upi_share_pct=d["upi_share_pct"],
                breakdown_description=d["breakdown_desc"],
                tender_type=d["tender_type"],
            )
        )

    return PaymentMixResponse(
        from_date=from_dt.isoformat() if hasattr(from_dt, "isoformat") else str(from_dt),
        to_date=to_dt.isoformat() if hasattr(to_dt, "isoformat") else str(to_dt),
        total_orders=total_distinct_orders,
        total_revenue=round(tot_rev, 2),
        gross_revenue=round(tot_gross, 2),
        total_refunded=round(tot_refund, 2),
        methods=methods
    )


async def get_tax_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> TaxSummaryResponse:
    tax_discount_mult = case(
        (Order.discount_status != "APPROVED", 1.0),
        (Order.discount_type == "COMPLIMENTARY", 0.0),
        (
            Order.discount_type == "PERCENT",
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0),
            ),
        ),
        (
            and_(Order.subtotal_amount != None, Order.subtotal_amount > 0),
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount),
            ),
        ),
        else_=1.0,
    )
    net_line_total = case(
        (OrderItem.quantity > OrderItem.returned_quantity, (OrderItem.quantity - OrderItem.returned_quantity) * OrderItem.unit_price * tax_discount_mult),
        else_=0.0,
    )
    cat_expr = func.coalesce(OrderItem.tax_category, "GST 0%")
    rate_expr = func.coalesce(OrderItem.tax_rate, 0.0)
    stmt = (
        select(
            cat_expr.label("cat"),
            rate_expr.label("rate"),
            func.sum(net_line_total).label("taxable"),
            func.count(func.distinct(OrderItem.id)).label("cnt")
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(cat_expr, rate_expr)
        .having(func.sum(net_line_total) > 0)
        .order_by(rate_expr)
    )
    res = await db.execute(stmt)
    rows = res.all()
    
    slabs = []
    tot_taxable = 0.0
    tot_tax = 0.0
    
    for r in rows:
        gross_val = float(r.taxable or 0)
        rate = float(r.rate or 0)
        if rate > 0:
            taxable = gross_val / (1.0 + (rate / 100.0))
            tax_amt = gross_val - taxable
        else:
            taxable = gross_val
            tax_amt = 0.0
            
        cgst = tax_amt / 2.0
        sgst = tax_amt / 2.0
        
        tot_taxable += taxable
        tot_tax += tax_amt
        
        slabs.append(
            TaxSlabRow(
                tax_category=r.cat,
                tax_rate=rate,
                taxable_amount=round(taxable, 2),
                tax_collected=round(tax_amt, 2),
                items_count=int(r.cnt or 0)
            )
        )
        
    return TaxSummaryResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_taxable_amount=round(tot_taxable, 2),
        total_tax_collected=round(tot_tax, 2),
        slabs=slabs
    )


def _normalize_uqc(unit_str: str | None) -> str:
    if not unit_str:
        return "PCS"
    u = unit_str.strip().lower()
    if u in ("kg", "kgs", "kilogram", "kilograms"):
        return "KGS"
    if u in ("g", "gm", "gms", "gram", "grams"):
        return "GMS"
    if u in ("l", "ltr", "litre", "liter", "litres", "liters"):
        return "LTR"
    if u in ("ml", "millilitre", "milliliter"):
        return "MLT"
    if u in ("pc", "pcs", "piece", "pieces"):
        return "PCS"
    if u in ("box", "boxes"):
        return "BOX"
    if u in ("pack", "packs", "pkt", "pkts", "packet", "packets"):
        return "PAC"
    if u in ("doz", "dozen"):
        return "DOZ"
    if u in ("bag", "bags"):
        return "BAG"
    if u in ("can", "cans"):
        return "CAN"
    if u in ("btl", "bottle", "bottles"):
        return "BTL"
    return "OTH"


async def get_gstr1_hsn_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> Gstr1HsnSummaryResponse:
    net_qty_expr = case(
        (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
        else_=0.0,
    )
    gstr_discount_mult = case(
        (Order.discount_status != "APPROVED", 1.0),
        (Order.discount_type == "COMPLIMENTARY", 0.0),
        (
            Order.discount_type == "PERCENT",
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / 100.0),
            ),
        ),
        (
            and_(Order.subtotal_amount != None, Order.subtotal_amount > 0),
            case(
                (1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount) < 0.0, 0.0),
                else_=1.0 - (func.coalesce(Order.discount_value, 0.0) / Order.subtotal_amount),
            ),
        ),
        else_=1.0,
    )
    net_line_total = net_qty_expr * OrderItem.unit_price * gstr_discount_mult

    hsn_expr = func.coalesce(func.nullif(OrderItem.hsn_code, ""), "UNKNOWN")
    rate_expr = func.coalesce(OrderItem.tax_rate, 0.0)
    unit_expr = func.coalesce(OrderItem.selected_unit, "NOS")

    stmt = (
        select(
            hsn_expr.label("hsn"),
            rate_expr.label("rate"),
            unit_expr.label("unit"),
            Order.is_interstate.label("is_interstate"),
            func.max(OrderItem.item_name).label("desc"),
            func.sum(net_qty_expr).label("qty"),
            func.sum(net_line_total).label("total_val"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(
            hsn_expr,
            rate_expr,
            unit_expr,
            Order.is_interstate,
        )
        .having(func.sum(net_qty_expr) > 0)
        .order_by(hsn_expr, rate_expr)
    )
    res = await db.execute(stmt)
    rows = res.all()

    grouped: dict[tuple[str, float, str], dict[str, Any]] = {}
    total_val = 0.0
    total_taxable = 0.0
    total_cgst = 0.0
    total_sgst = 0.0
    total_igst = 0.0

    for r in rows:
        hsn = str(r.hsn or "OTHER").strip()
        rate = float(r.rate or 0.0)
        uqc = _normalize_uqc(r.unit)
        key = (hsn, rate, uqc)

        qty = float(r.qty or 0.0)
        gross_val = float(r.total_val or 0.0)
        is_interstate = bool(r.is_interstate)

        if rate > 0.0:
            taxable = gross_val / (1.0 + (rate / 100.0))
            tot_tax = gross_val - taxable
        else:
            taxable = gross_val
            tot_tax = 0.0

        if is_interstate:
            igst = tot_tax
            cgst = 0.0
            sgst = 0.0
        else:
            igst = 0.0
            cgst = tot_tax / 2.0
            sgst = tot_tax / 2.0

        item_total_val = gross_val

        total_val += item_total_val
        total_taxable += taxable
        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        if key not in grouped:
            grouped[key] = {
                "hsn_code": hsn,
                "description": r.desc or "Goods",
                "unique_items": 1,
                "uqc": uqc,
                "total_quantity": 0.0,
                "total_value": 0.0,
                "taxable_value": 0.0,
                "tax_rate": rate,
                "cgst_amount": 0.0,
                "sgst_amount": 0.0,
                "igst_amount": 0.0,
                "cess_amount": 0.0,
            }
        else:
            if r.desc and r.desc != grouped[key]["description"]:
                grouped[key]["unique_items"] += 1

        grouped[key]["total_quantity"] += qty
        grouped[key]["total_value"] += item_total_val
        grouped[key]["taxable_value"] += taxable
        grouped[key]["cgst_amount"] += cgst
        grouped[key]["sgst_amount"] += sgst
        grouped[key]["igst_amount"] += igst

    items = []
    for v in grouped.values():
        if v["hsn_code"] == "OTHER":
            desc = "Unclassified items (No HSN)"
        elif v["unique_items"] > 1:
            desc = "Multiple items"
        else:
            desc = v["description"]

        items.append(
            Gstr1HsnItem(
                hsn_code=v["hsn_code"],
                description=desc,
                uqc=v["uqc"],
                total_quantity=round(v["total_quantity"], 3),
                total_value=round(v["total_value"], 2),
                taxable_value=round(v["taxable_value"], 2),
                tax_rate=v["tax_rate"],
                cgst_amount=round(v["cgst_amount"], 2),
                sgst_amount=round(v["sgst_amount"], 2),
                igst_amount=round(v["igst_amount"], 2),
                cess_amount=round(v["cess_amount"], 2),
            )
        )

    return Gstr1HsnSummaryResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_value=round(total_val, 2),
        total_taxable_value=round(total_taxable, 2),
        total_cgst=round(total_cgst, 2),
        total_sgst=round(total_sgst, 2),
        total_igst=round(total_igst, 2),
        items=items,
    )


async def get_taxable_bills_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    gst_filter: str = "TAXABLE",  # TAXABLE, ZERO_GST, ALL
    limit: int = 50,
    offset: int = 0,
) -> TaxableBillsResponse:
    """
    Aggregates bills where GST paid > 0 vs Zero-GST bills, with per-bill statutory tax breakdown.
    """
    from_dt_naive = from_dt.replace(tzinfo=None) if from_dt.tzinfo else from_dt
    to_dt_naive = to_dt.replace(tzinfo=None) if to_dt.tzinfo else to_dt

    net_qty_expr = case(
        (OrderItem.quantity > OrderItem.returned_quantity, OrderItem.quantity - OrderItem.returned_quantity),
        else_=0.0,
    )
    line_total_expr = net_qty_expr * OrderItem.unit_price

    # Subquery: aggregate item tax info grouped by order_id and tax_rate
    rate_expr = func.coalesce(OrderItem.tax_rate, 0.0)
    stmt_items = (
        select(
            OrderItem.order_id,
            rate_expr.label("rate"),
            func.sum(line_total_expr).label("gross_line_val"),
            func.count(OrderItem.id).label("item_count"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .group_by(OrderItem.order_id, rate_expr)
    )
    res_items = await db.execute(stmt_items)
    item_rows = res_items.all()

    # Map per order_id
    order_tax_map: dict[uuid.UUID, dict[str, Any]] = {}
    for ir in item_rows:
        oid = ir.order_id
        rate = float(ir.rate or 0.0)
        gross_val = float(ir.gross_line_val or 0.0)
        cnt = int(ir.item_count or 0)

        if rate > 0.0:
            taxable = gross_val / (1.0 + (rate / 100.0))
            tax_amt = gross_val - taxable
        else:
            taxable = gross_val
            tax_amt = 0.0

        if oid not in order_tax_map:
            order_tax_map[oid] = {
                "taxable_base": 0.0,
                "gst_collected": 0.0,
                "items_count": 0,
            }
        order_tax_map[oid]["taxable_base"] += taxable
        order_tax_map[oid]["gst_collected"] += tax_amt
        order_tax_map[oid]["items_count"] += cnt

    # Fetch all settled orders in range
    stmt_orders = (
        select(Order)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .order_by(Order.created_at.desc())
    )
    res_orders = await db.execute(stmt_orders)
    orders = res_orders.scalars().all()

    taxable_bills_count = 0
    taxable_bills_turnover = 0.0
    taxable_base_value = 0.0
    total_gst_collected = 0.0
    total_cgst = 0.0
    total_sgst = 0.0
    total_igst = 0.0
    zero_gst_bills_count = 0
    zero_gst_bills_turnover = 0.0
    total_bills = len(orders)

    all_bill_rows: list[TaxableBillRow] = []

    for ord_obj in orders:
        info = order_tax_map.get(ord_obj.id, {"taxable_base": float(ord_obj.total_amount or 0.0), "gst_collected": 0.0, "items_count": 0})
        order_gst = float(info["gst_collected"])
        order_taxable = float(info["taxable_base"])
        order_total = float(ord_obj.total_amount or 0.0)
        items_cnt = int(info["items_count"])
        is_interstate = bool(ord_obj.is_interstate)

        if is_interstate:
            igst = order_gst
            cgst = 0.0
            sgst = 0.0
        else:
            igst = 0.0
            cgst = order_gst / 2.0
            sgst = order_gst / 2.0

        is_taxable = order_gst > 0.005

        if is_taxable:
            taxable_bills_count += 1
            taxable_bills_turnover += order_total
            taxable_base_value += order_taxable
            total_gst_collected += order_gst
            total_cgst += cgst
            total_sgst += sgst
            total_igst += igst
        else:
            zero_gst_bills_count += 1
            zero_gst_bills_turnover += order_total

        include_in_list = True
        if gst_filter == "TAXABLE" and not is_taxable:
            include_in_list = False
        elif gst_filter == "ZERO_GST" and is_taxable:
            include_in_list = False

        if include_in_list:
            pm = ord_obj.payment_method.value if hasattr(ord_obj.payment_method, "value") else str(ord_obj.payment_method) if ord_obj.payment_method else None
            all_bill_rows.append(
                TaxableBillRow(
                    order_id=str(ord_obj.id),
                    basket_number=ord_obj.basket_number or "",
                    created_at=ord_obj.created_at.isoformat() if hasattr(ord_obj.created_at, "isoformat") else str(ord_obj.created_at),
                    customer_name=ord_obj.customer_name,
                    customer_phone=ord_obj.customer_phone,
                    payment_method=pm,
                    total_amount=round(order_total, 2),
                    taxable_amount=round(order_taxable, 2),
                    cgst_amount=round(cgst, 2),
                    sgst_amount=round(sgst, 2),
                    igst_amount=round(igst, 2),
                    total_gst_amount=round(order_gst, 2),
                    items_count=items_cnt,
                )
            )

    paginated_bills = all_bill_rows[offset : offset + limit]
    avg_gst = (total_gst_collected / taxable_bills_count) if taxable_bills_count > 0 else 0.0

    return TaxableBillsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        taxable_bills_count=taxable_bills_count,
        taxable_bills_turnover=round(taxable_bills_turnover, 2),
        taxable_base_value=round(taxable_base_value, 2),
        total_gst_collected=round(total_gst_collected, 2),
        total_cgst=round(total_cgst, 2),
        total_sgst=round(total_sgst, 2),
        total_igst=round(total_igst, 2),
        avg_gst_per_taxable_bill=round(avg_gst, 2),
        zero_gst_bills_count=zero_gst_bills_count,
        zero_gst_bills_turnover=round(zero_gst_bills_turnover, 2),
        total_bills=total_bills,
        bills=paginated_bills,
    )


async def get_service_charges_summary(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
    charge_filter: str = "ALL_CHARGES",  # ALL_CHARGES, HANDLING_ONLY, DELIVERY_ONLY, BOTH, ZERO_CHARGES, ALL_BILLS
    limit: int = 50,
    offset: int = 0,
) -> ServiceChargesSummaryResponse:
    """
    Aggregates bills where delivery/service charge, handling charge, or both were applied.
    """
    from_dt_naive = from_dt.replace(tzinfo=None) if from_dt.tzinfo else from_dt
    to_dt_naive = to_dt.replace(tzinfo=None) if to_dt.tzinfo else to_dt

    # Get items count per order
    stmt_items = (
        select(
            OrderItem.order_id,
            func.count(OrderItem.id).label("item_count"),
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            func.coalesce(Order.is_void, False) == False,
        )
        .group_by(OrderItem.order_id)
    )
    res_items = await db.execute(stmt_items)
    order_items_map = {row.order_id: int(row.item_count or 0) for row in res_items.all()}

    # Fetch all settled orders in range
    stmt_orders = (
        select(Order)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            func.coalesce(Order.is_void, False) == False,
        )
        .order_by(Order.created_at.desc())
    )
    res_orders = await db.execute(stmt_orders)
    orders = res_orders.scalars().all()

    total_bills = len(orders)
    bills_with_charges_count = 0
    bills_with_charges_turnover = 0.0
    bills_with_charges_subtotal = 0.0
    total_delivery_charges = 0.0
    total_handling_charges = 0.0
    total_combined_charges = 0.0

    handling_only_count = 0
    delivery_only_count = 0
    both_charges_count = 0
    zero_charges_count = 0
    zero_charges_turnover = 0.0

    filtered_rows: list[ServiceChargeBillRow] = []

    for ord_obj in orders:
        del_chg = float(ord_obj.delivery_charge or 0.0)
        hnd_chg = float(ord_obj.handling_charge or 0.0)
        tot_chg = round(del_chg + hnd_chg, 2)
        order_total = float(ord_obj.total_amount or 0.0)
        subtotal = float(ord_obj.subtotal_amount or 0.0)
        discount = float(ord_obj.discount_value or 0.0)

        has_del = del_chg > 0.005
        has_hnd = hnd_chg > 0.005
        has_any_chg = has_del or has_hnd

        total_delivery_charges += del_chg
        total_handling_charges += hnd_chg
        total_combined_charges += tot_chg

        if has_any_chg:
            bills_with_charges_count += 1
            bills_with_charges_turnover += order_total
            bills_with_charges_subtotal += subtotal

            if has_del and has_hnd:
                both_charges_count += 1
            elif has_hnd:
                handling_only_count += 1
            elif has_del:
                delivery_only_count += 1
        else:
            zero_charges_count += 1
            zero_charges_turnover += order_total

        # Filter check (case-insensitive)
        norm_filter = (charge_filter or "").upper().strip()
        matches_filter = False
        if norm_filter == "ALL_CHARGES":
            matches_filter = has_any_chg
        elif norm_filter == "HANDLING_ONLY":
            matches_filter = has_hnd and not has_del
        elif norm_filter == "DELIVERY_ONLY":
            matches_filter = has_del and not has_hnd
        elif norm_filter == "BOTH":
            matches_filter = has_del and has_hnd
        elif norm_filter == "ZERO_CHARGES":
            matches_filter = not has_any_chg
        elif norm_filter == "ALL_BILLS":
            matches_filter = True
        else:
            matches_filter = has_any_chg

        if matches_filter:
            pm = (
                ord_obj.payment_method.value
                if hasattr(ord_obj.payment_method, "value")
                else str(ord_obj.payment_method)
                if ord_obj.payment_method
                else None
            )
            filtered_rows.append(
                ServiceChargeBillRow(
                    order_id=str(ord_obj.id),
                    basket_number=ord_obj.basket_number or "",
                    invoice_no=getattr(ord_obj, "invoice_no", None) or ord_obj.basket_number,
                    created_at=ord_obj.created_at.isoformat()
                    if hasattr(ord_obj.created_at, "isoformat")
                    else str(ord_obj.created_at),
                    customer_name=ord_obj.customer_name,
                    customer_phone=ord_obj.customer_phone,
                    payment_method=pm,
                    items_count=order_items_map.get(ord_obj.id, 0),
                    subtotal_amount=round(subtotal, 2),
                    delivery_charge=round(del_chg, 2),
                    handling_charge=round(hnd_chg, 2),
                    total_charges=round(tot_chg, 2),
                    discount_amount=round(discount, 2),
                    total_amount=round(order_total, 2),
                )
            )

    paginated_bills = filtered_rows[offset : offset + limit]

    return ServiceChargesSummaryResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        bills_with_charges_count=bills_with_charges_count,
        bills_with_charges_turnover=round(bills_with_charges_turnover, 2),
        bills_with_charges_subtotal=round(bills_with_charges_subtotal, 2),
        total_delivery_charges=round(total_delivery_charges, 2),
        total_handling_charges=round(total_handling_charges, 2),
        total_combined_charges=round(total_combined_charges, 2),
        handling_only_count=handling_only_count,
        delivery_only_count=delivery_only_count,
        both_charges_count=both_charges_count,
        zero_charges_count=zero_charges_count,
        zero_charges_turnover=round(zero_charges_turnover, 2),
        total_bills=total_bills,
        bills=paginated_bills,
    )


async def generate_ca_excel_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> tuple[bytes, str]:
    """
    Generate a Chartered Accountant (CA) compliant multi-sheet Excel workbook with:
    1. HSN_Summary_T12 (GSTR-1 Table 12 HSN Summary)
    2. GSTR3B_Liability (Outward Taxable Supplies Summary for Form GSTR-3B Table 3.1)
    3. B2B_Register (Registered buyer invoices for ITC claims)
    4. B2C_Summary (Unregistered consumer supplies by Place of Supply and Tax Rate)
    """
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()

    # Style definitions
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    total_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    total_font = Font(name="Calibri", size=11, bold=True)
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    def style_header_row(ws, col_count: int, row_idx: int = 1):
        for col in range(1, col_count + 1):
            c = ws.cell(row=row_idx, column=col)
            c.fill = header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = thin_border
        ws.row_dimensions[row_idx].height = 28

    def auto_fit_columns(ws):
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    # -------------------------------------------------------------
    # 1. HSN_Summary_T12
    # -------------------------------------------------------------
    ws_hsn = wb.active
    ws_hsn.title = "HSN_Summary_T12"
    hsn_headers = [
        "HSN / SAC", "Description", "UQC", "Total Quantity", "Total Value (INR)",
        "Taxable Value (INR)", "Rate (%)", "IGST (INR)", "CGST (INR)", "SGST (INR)", "Cess (INR)"
    ]
    ws_hsn.append(hsn_headers)
    style_header_row(ws_hsn, len(hsn_headers))

    hsn_data = await get_gstr1_hsn_summary(db, outlet_id, from_dt, to_dt)
    for it in hsn_data.items:
        ws_hsn.append([
            it.hsn_code,
            it.description,
            it.uqc,
            it.total_quantity,
            it.total_value,
            it.taxable_value,
            it.tax_rate,
            it.igst_amount,
            it.cgst_amount,
            it.sgst_amount,
            it.cess_amount,
        ])

    # Add Total Row
    tot_row_idx = len(hsn_data.items) + 2
    ws_hsn.append([
        "TOTAL", "", "", "",
        hsn_data.total_value,
        hsn_data.total_taxable_value,
        "",
        hsn_data.total_igst,
        hsn_data.total_cgst,
        hsn_data.total_sgst,
        0.00,
    ])
    for col in range(1, len(hsn_headers) + 1):
        cell = ws_hsn.cell(row=tot_row_idx, column=col)
        cell.fill = total_fill
        cell.font = total_font
        cell.border = thin_border
    auto_fit_columns(ws_hsn)

    # -------------------------------------------------------------
    # Fetch all settled orders with items and customers
    # -------------------------------------------------------------
    orders_stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.customer))
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
        .order_by(Order.created_at)
    )
    orders_res = await db.execute(orders_stmt)
    orders = orders_res.scalars().all()

    # -------------------------------------------------------------
    # 2. GSTR3B_Liability
    # -------------------------------------------------------------
    ws_gstr3b = wb.create_sheet(title="GSTR3B_Liability")
    gstr3b_headers = [
        "Nature of Supplies (GSTR-3B Table 3.1)", "Total Taxable Value (INR)",
        "Integrated Tax (INR)", "Central Tax (INR)", "State/UT Tax (INR)", "Cess (INR)"
    ]
    ws_gstr3b.append(gstr3b_headers)
    style_header_row(ws_gstr3b, len(gstr3b_headers))

    intra_taxable = 0.0
    intra_cgst = 0.0
    intra_sgst = 0.0

    inter_taxable = 0.0
    inter_igst = 0.0

    exempt_taxable = 0.0

    b2b_rows = []
    b2c_map = {}  # key: (place_of_supply, is_interstate, tax_rate) -> dict

    for order in orders:
        is_inter = bool(order.is_interstate)
        pos = order.place_of_supply or "Local"
        has_b2b_gstin = bool(order.customer and order.customer.gstin and order.customer.gstin.strip())

        for item in order.items:
            net_qty = max(0.0, float(getattr(item, "quantity", 0.0) or 0.0) - float(getattr(item, "returned_quantity", 0.0) or 0.0))
            if net_qty <= 0.0:
                continue
            gross = net_qty * float(item.unit_price or 0.0)
            rate = float(item.tax_rate or 0.0)

            if rate == 0.0:
                taxable = gross
                exempt_taxable += taxable
                cgst = 0.0
                sgst = 0.0
                igst = 0.0
            elif is_inter:
                taxable = gross / (1.0 + (rate / 100.0))
                tot_tax = gross - taxable
                inter_taxable += taxable
                igst = tot_tax
                inter_igst += igst
                cgst = 0.0
                sgst = 0.0
            else:
                taxable = gross / (1.0 + (rate / 100.0))
                tot_tax = gross - taxable
                intra_taxable += taxable
                cgst = tot_tax / 2.0
                sgst = tot_tax / 2.0
                intra_cgst += cgst
                intra_sgst += sgst
                igst = 0.0

            tot_inv = gross

            if has_b2b_gstin:
                b2b_rows.append([
                    order.basket_number or str(order.id)[:8],
                    order.created_at.strftime("%Y-%m-%d %H:%M") if order.created_at else "",
                    order.customer.legal_name or order.customer.name,
                    order.customer.gstin,
                    pos,
                    "Inter-State" if is_inter else "Intra-State",
                    round(tot_inv, 2),
                    round(taxable, 2),
                    rate,
                    round(igst, 2),
                    round(cgst, 2),
                    round(sgst, 2),
                ])
            else:
                b2c_key = (pos, is_inter, rate)
                if b2c_key not in b2c_map:
                    b2c_map[b2c_key] = {
                        "pos": pos,
                        "supply_type": "Inter-State" if is_inter else "Intra-State",
                        "rate": rate,
                        "taxable": 0.0,
                        "cgst": 0.0,
                        "sgst": 0.0,
                        "igst": 0.0,
                        "total": 0.0,
                    }
                b2c_map[b2c_key]["taxable"] += taxable
                b2c_map[b2c_key]["cgst"] += cgst
                b2c_map[b2c_key]["sgst"] += sgst
                b2c_map[b2c_key]["igst"] += igst
                b2c_map[b2c_key]["total"] += tot_inv

    ws_gstr3b.append([
        "3.1(a) Outward Taxable Supplies (other than zero rated, nil rated & exempted) - Intra-State",
        round(intra_taxable, 2),
        0.00,
        round(intra_cgst, 2),
        round(intra_sgst, 2),
        0.00,
    ])
    ws_gstr3b.append([
        "3.1(a) Outward Taxable Supplies (other than zero rated, nil rated & exempted) - Inter-State",
        round(inter_taxable, 2),
        round(inter_igst, 2),
        0.00,
        0.00,
        0.00,
    ])
    ws_gstr3b.append([
        "3.1(c) Other Outward Supplies (Nil rated, Exempted - GST 0%)",
        round(exempt_taxable, 2),
        0.00,
        0.00,
        0.00,
        0.00,
    ])

    tot_taxable_all = intra_taxable + inter_taxable + exempt_taxable
    ws_gstr3b.append([
        "TOTAL OUTWARD SUPPLIES",
        round(tot_taxable_all, 2),
        round(inter_igst, 2),
        round(intra_cgst, 2),
        round(intra_sgst, 2),
        0.00,
    ])
    for col in range(1, len(gstr3b_headers) + 1):
        cell = ws_gstr3b.cell(row=5, column=col)
        cell.fill = total_fill
        cell.font = total_font
        cell.border = thin_border
    auto_fit_columns(ws_gstr3b)

    # -------------------------------------------------------------
    # 3. B2B_Register
    # -------------------------------------------------------------
    ws_b2b = wb.create_sheet(title="B2B_Register")
    b2b_headers = [
        "Invoice / Bill No", "Invoice Date", "Customer Legal / Trade Name",
        "Customer GSTIN", "Place of Supply", "Supply Type", "Invoice Value (INR)",
        "Taxable Value (INR)", "Tax Rate (%)", "IGST (INR)", "CGST (INR)", "SGST (INR)"
    ]
    ws_b2b.append(b2b_headers)
    style_header_row(ws_b2b, len(b2b_headers))

    for row in b2b_rows:
        ws_b2b.append(row)
    if not b2b_rows:
        ws_b2b.append(["No B2B registered customer invoices in this period."])
    auto_fit_columns(ws_b2b)

    # -------------------------------------------------------------
    # 4. B2C_Summary
    # -------------------------------------------------------------
    ws_b2c = wb.create_sheet(title="B2C_Summary")
    b2c_headers = [
        "Place of Supply", "Supply Type", "Tax Rate (%)", "Taxable Value (INR)",
        "Central Tax (CGST)", "State Tax (SGST)", "Integrated Tax (IGST)", "Total Invoice Value (INR)"
    ]
    ws_b2c.append(b2c_headers)
    style_header_row(ws_b2c, len(b2c_headers))

    for item in sorted(b2c_map.values(), key=lambda x: (x["pos"], x["supply_type"], x["rate"])):
        ws_b2c.append([
            item["pos"],
            item["supply_type"],
            item["rate"],
            round(item["taxable"], 2),
            round(item["cgst"], 2),
            round(item["sgst"], 2),
            round(item["igst"], 2),
            round(item["total"], 2),
        ])
    if not b2c_map:
        ws_b2c.append(["No B2C unregistered customer supplies in this period."])
    auto_fit_columns(ws_b2c)

    buf = io.BytesIO()
    wb.save(buf)
    filename = f"CA_GST_Report_{from_dt.strftime('%Y%m%d')}_{to_dt.strftime('%Y%m%d')}.xlsx"
    return buf.getvalue(), filename


async def get_discount_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> DiscountReportResponse:
    actual_discount_expr = case(
        (Order.discount_type == "PERCENT", Order.subtotal_amount * (Order.discount_value / 100.0)),
        else_=Order.discount_value
    )

    stmt_sum = select(
        func.count(Order.id),
        func.sum(actual_discount_expr),
        func.sum(Order.total_amount)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    res_sum = await db.execute(stmt_sum)
    srow = res_sum.first()
    tot_ords = srow[0] if srow else 0
    tot_rev_all = float(srow[2] or 0)
    
    stmt_dsc = select(
        func.count(Order.id),
        func.sum(actual_discount_expr)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
        Order.discount_value > 0,
        Order.discount_status == "APPROVED"
    )
    res_dsc = await db.execute(stmt_dsc)
    drow = res_dsc.first()
    dsc_ords = drow[0] if drow else 0
    dsc_amt = float(drow[1] or 0)
    
    summary = DiscountSummary(
        total_orders_with_discount=dsc_ords,
        total_discount_amount=round(dsc_amt, 2),
        avg_discount_per_order=round(dsc_amt / dsc_ords, 2) if dsc_ords > 0 else 0.0,
        discount_pct_of_revenue=round((dsc_amt / tot_rev_all) * 100.0, 2) if tot_rev_all > 0 else 0.0
    )
    
    stmt_type = select(
        func.coalesce(Order.discount_type, "UNKNOWN").label("type"),
        func.count(Order.id).label("cnt"),
        func.sum(actual_discount_expr).label("amt")
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
        Order.discount_value > 0,
        Order.discount_status == "APPROVED"
    ).group_by("type")
    res_type = await db.execute(stmt_type)
    by_type = [
        DiscountByType(
            discount_type=r.type.value if hasattr(r.type, "value") else str(r.type),
            count=int(r.cnt or 0),
            total_amount=round(float(r.amt or 0), 2)
        ) for r in res_type.all()
    ]
    
    stmt_appr = select(
        BillDiscountApproval.status,
        func.count(BillDiscountApproval.id)
    ).join(Order, BillDiscountApproval.order_id == Order.id).where(
        Order.outlet_id == outlet_id,
        Order.is_void == False,
        BillDiscountApproval.created_at >= from_dt,
        BillDiscountApproval.created_at <= to_dt
    ).group_by(BillDiscountApproval.status)
    res_appr = await db.execute(stmt_appr)
    
    astats = {"PENDING": 0, "APPROVED": 0, "REJECTED": 0}
    for r in res_appr.all():
        s = r[0].value if hasattr(r[0], "value") else str(r[0])
        astats[s] = int(r[1])
        
    tot_req = sum(astats.values())
    appr_stats = DiscountApprovalStats(
        total_requests=tot_req,
        approved=astats.get("APPROVED", 0),
        rejected=astats.get("REJECTED", 0),
        pending=astats.get("PENDING", 0),
        approval_rate_pct=round((astats.get("APPROVED", 0) / tot_req) * 100.0, 2) if tot_req > 0 else 0.0
    )
    
    stmt_rsn = select(
        BillDiscountApproval.reason_note,
        func.count(BillDiscountApproval.id).label("cnt"),
        func.sum(BillDiscountApproval.discount_value).label("amt")
    ).join(Order, BillDiscountApproval.order_id == Order.id).where(
        Order.outlet_id == outlet_id,
        Order.is_void == False,
        BillDiscountApproval.created_at >= from_dt,
        BillDiscountApproval.created_at <= to_dt,
        BillDiscountApproval.status == "APPROVED"
    ).group_by(BillDiscountApproval.reason_note).order_by(func.count(BillDiscountApproval.id).desc()).limit(10)
    res_rsn = await db.execute(stmt_rsn)
    top_rsns = [
        TopDiscountReason(
            reason=r.reason_note or "Unknown",
            count=int(r.cnt or 0),
            total_amount=round(float(r.amt or 0), 2)
        ) for r in res_rsn.all()
    ]
    
    stmt_comp = select(
        func.count(OrderItem.id),
        func.sum(OrderItem.line_total)
    ).select_from(OrderItem).join(Order, OrderItem.order_id == Order.id).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
        OrderItem.is_complimentary == True
    )
    res_comp = await db.execute(stmt_comp)
    crow = res_comp.first()

    # Detailed discounted bills with cashier & approval metadata
    RequestedByUser = aliased(User)
    CreatedByUser = aliased(User)
    ApproverUser = aliased(User)

    stmt_bills = (
        select(
            Order,
            BillDiscountApproval,
            RequestedByUser.name.label("requested_by_name"),
            CreatedByUser.name.label("created_by_name"),
            ApproverUser.name.label("approver_name"),
        )
        .outerjoin(
            BillDiscountApproval,
            and_(
                BillDiscountApproval.order_id == Order.id,
                BillDiscountApproval.status == "APPROVED",
            ),
        )
        .outerjoin(
            RequestedByUser,
            BillDiscountApproval.requested_by_id == RequestedByUser.id,
        )
        .outerjoin(
            CreatedByUser,
            Order.created_by_staff_id == CreatedByUser.id,
        )
        .outerjoin(
            ApproverUser,
            BillDiscountApproval.approved_by_id == ApproverUser.id,
        )
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            Order.discount_value > 0,
            Order.discount_status == "APPROVED",
        )
        .order_by(Order.created_at.desc())
    )
    res_bills = await db.execute(stmt_bills)
    bill_rows = res_bills.all()

    discounted_bills: list[DiscountedBillDetail] = []
    seen_order_ids: set[uuid.UUID] = set()

    for row in bill_rows:
        order = row.Order
        if order.id in seen_order_ids:
            continue
        seen_order_ids.add(order.id)

        approval = row.BillDiscountApproval
        requested_by_name = row.requested_by_name
        created_by_name = row.created_by_name
        approver_name = row.approver_name

        subtotal = float(order.subtotal_amount or order.total_amount or 0.0)
        final_total = float(order.total_amount or 0.0)
        disc_val = float(order.discount_value or 0.0)
        disc_type = (order.discount_type or (approval.discount_type if approval else None) or "FLAT").upper()

        if disc_type == "PERCENT":
            calculated_discount = round(subtotal * (disc_val / 100.0), 2)
        elif disc_type == "FLAT":
            calculated_discount = disc_val
        elif disc_type in ("COMPLIMENTARY", "COMPLIMENTARY_ITEMS"):
            calculated_discount = max(0.0, round(subtotal - final_total, 2)) if subtotal > final_total else disc_val
        else:
            calculated_discount = disc_val

        gross_total = subtotal if subtotal > final_total else round(final_total + calculated_discount, 2)
        reason = order.discount_reason or (approval.reason_note if approval else None) or "—"
        cashier = requested_by_name or created_by_name or "Cashier"

        bill_num = order.basket_number if getattr(order, "basket_number", None) else f"#{order.id.hex[:8].upper()}"
        discounted_bills.append(
            DiscountedBillDetail(
                order_id=str(order.id),
                bill_number=bill_num,
                created_at=order.created_at.isoformat() if order.created_at else "",
                subtotal=gross_total,
                total_amount=final_total,
                discount_type=disc_type,
                discount_value=disc_val,
                discount_amount=calculated_discount,
                discount_reason=reason,
                discount_status=order.discount_status or (approval.status if approval else "APPROVED"),
                cashier_name=cashier,
                cashier_id=str(order.created_by_staff_id) if order.created_by_staff_id else None,
                approved_by_name=approver_name,
                payment_method=order.payment_method,
            )
        )
    
    return DiscountReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        summary=summary,
        by_type=by_type,
        approval_stats=appr_stats,
        top_reasons=top_rsns,
        total_complimentary_items=int(crow[0] if crow else 0),
        total_complimentary_value=round(float(crow[1] or 0), 2),
        discounted_bills=discounted_bills,
    )


async def get_credit_debit_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> dict:
    """Analytics for customer credit and debit."""
    # Summary query
    summary_stmt = (
        select(
            func.coalesce(func.sum(case((Customer.credit_balance > 0, Customer.credit_balance), else_=0)), 0).label("total_outstanding_credit"),
            func.coalesce(func.sum(case((Customer.credit_balance < 0, Customer.credit_balance), else_=0)), 0).label("total_outstanding_debit"),
            func.count(case((Customer.credit_balance > 0, 1))).label("customers_with_credit"),
            func.count(case((Customer.credit_balance < 0, 1))).label("customers_with_debit"),
        )
        .where(Customer.outlet_id == outlet_id)
    )
    summary_res = await db.execute(summary_stmt)
    s_row = summary_res.first()

    # Transactions in period
    tx_stmt = (
        select(func.count(CustomerLedger.id))
        .where(
            CustomerLedger.outlet_id == outlet_id,
            CustomerLedger.created_at >= from_dt,
            CustomerLedger.created_at <= to_dt
        )
    )
    tx_res = await db.execute(tx_stmt)
    total_tx = tx_res.scalar() or 0

    # Customer-wise details
    # We want to list customers who have a non-zero balance OR had transactions in the period
    cust_stmt = (
        select(
            Customer.id,
            Customer.name,
            Customer.phone,
            Customer.credit_balance,
            func.coalesce(func.sum(case((CustomerLedger.entry_type.in_(("CREDIT_ADDED", "DEBIT_SETTLED")), CustomerLedger.amount), else_=0)), 0).label("total_credit_given"),
            func.coalesce(func.sum(case((CustomerLedger.entry_type.in_(("DEBIT_ADDED", "CREDIT_APPLIED", "CREDIT_USED", "CREDIT_CASHED_OUT")), CustomerLedger.amount), else_=0)), 0).label("total_debit_recorded"),
            func.max(CustomerLedger.created_at).label("last_tx")
        )
        .outerjoin(CustomerLedger, (Customer.id == CustomerLedger.customer_id) & (CustomerLedger.created_at >= from_dt) & (CustomerLedger.created_at <= to_dt))
        .where(
            (Customer.outlet_id == outlet_id) &
            ((Customer.credit_balance != 0) | (CustomerLedger.id.isnot(None)))
        )
        .group_by(Customer.id, Customer.name, Customer.phone, Customer.credit_balance)
        .order_by(Customer.credit_balance.asc()) # Largest debits first
    )
    cust_res = await db.execute(cust_stmt)

    customers = []
    for row in cust_res.all():
        customers.append({
            "customer_id": str(row.id),
            "customer_name": row.name,
            "customer_phone": row.phone,
            "credit_balance": float(row.credit_balance),
            "total_credit_given": float(row.total_credit_given),
            "total_debit_recorded": float(row.total_debit_recorded),
            "last_transaction_date": row.last_tx.isoformat() if row.last_tx else None
        })

    # Fetch detailed transaction entries for the period
    tx_list_stmt = (
        select(
            CustomerLedger.id,
            CustomerLedger.created_at,
            CustomerLedger.customer_id,
            Customer.name.label("customer_name"),
            Customer.phone.label("customer_phone"),
            CustomerLedger.entry_type,
            CustomerLedger.amount,
            CustomerLedger.balance_after,
            CustomerLedger.note,
            CustomerLedger.order_id,
            Order.basket_number.label("order_basket_number"),
            User.name.label("staff_name"),
        )
        .join(Customer, CustomerLedger.customer_id == Customer.id)
        .outerjoin(Order, CustomerLedger.order_id == Order.id)
        .outerjoin(User, CustomerLedger.created_by_staff_id == User.id)
        .where(
            CustomerLedger.outlet_id == outlet_id,
            CustomerLedger.created_at >= from_dt,
            CustomerLedger.created_at <= to_dt,
        )
        .order_by(CustomerLedger.created_at.desc())
        .limit(300)
    )
    tx_list_res = await db.execute(tx_list_stmt)
    transactions = [
        {
            "id": str(r.id),
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "customer_id": str(r.customer_id),
            "customer_name": r.customer_name or "Unknown",
            "customer_phone": r.customer_phone or "",
            "entry_type": r.entry_type,
            "amount": float(r.amount),
            "balance_after": float(r.balance_after),
            "note": r.note,
            "order_id": str(r.order_id) if r.order_id else None,
            "order_basket_number": r.order_basket_number,
            "staff_name": r.staff_name,
        }
        for r in tx_list_res.all()
    ]

    return {
        "summary": {
            "total_outstanding_credit": float(s_row.total_outstanding_credit or 0),
            "total_outstanding_debit": abs(float(s_row.total_outstanding_debit or 0)),
            "customers_with_credit": s_row.customers_with_credit or 0,
            "customers_with_debit": s_row.customers_with_debit or 0,
            "total_transactions": total_tx
        },
        "customers": customers,
        "transactions": transactions,
        "from_date": from_dt.isoformat(),
        "to_date": to_dt.isoformat()
    }


async def get_day_book(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    date_str: str,
) -> DayBookResponse:
    dt_target = datetime.strptime(date_str, "%Y-%m-%d").date()
    # DB stores naive UTC. 00:00 IST = 18:30 UTC (previous day)
    start_utc = datetime.combine(dt_target, time.min) - timedelta(hours=5, minutes=30)
    end_utc = datetime.combine(dt_target, time.max) - timedelta(hours=5, minutes=30)
    
    stmt_open = (
        select(
            CashDrawerLedger.transaction_type, CashDrawerLedger.denominations
        )
        .outerjoin(Order, CashDrawerLedger.reference_order_id == Order.id)
        .where(
            CashDrawerLedger.outlet_id == outlet_id,
            CashDrawerLedger.created_at < start_utc,
            or_(Order.id.is_(None), Order.is_void == False),
        )
    )
    res_open = await db.execute(stmt_open)
    opening_cash = 0.0
    for r in res_open.all():
        denoms = r.denominations or {}
        tt = r.transaction_type.value if hasattr(r.transaction_type, "value") else str(r.transaction_type)
        mult = -1 if tt in ("MANUAL_WITHDRAWAL", "CUSTOMER_CHANGE") else 1
        try:
            amt = sum(int(k) * (abs(int(v)) if tt in ("MANUAL_WITHDRAWAL", "CUSTOMER_CHANGE") else int(v)) for k, v in denoms.items() if str(k).isdigit())
        except (ValueError, TypeError):
            amt = 0.0
        opening_cash += amt * mult
    
    entries = []
    
    # Include historical settled orders even if later refunded, preventing retrospective wiping of sales
    daybook_order_statuses = [
        OrderStatusEnum.PAID,
        OrderStatusEnum.PAYMENT_PENDING,
        OrderStatusEnum.COMPLETED,
        OrderStatusEnum.PARTIALLY_REFUNDED,
        OrderStatusEnum.REFUNDED,
    ]
    stmt_ord = (
        select(
            Order.created_at,
            Order.basket_number,
            Order.total_amount,
            Order.payment_method,
            Order.cash_amount,
            Order.upi_amount,
            Order.customer_name,
            Order.customer_phone,
            Order.source,
            CustomerReturn.gross_return_amount.label("exchange_return_gross"),
        )
        .outerjoin(CustomerReturn, Order.id == CustomerReturn.exchange_order_id)
        .where(
            Order.outlet_id == outlet_id, Order.created_at >= start_utc, Order.created_at <= end_utc,
            Order.status.in_(daybook_order_statuses)
        )
    )
    res_ord = await db.execute(stmt_ord)
    tot_sales = 0.0
    cash_sales = 0.0
    for r in res_ord.all():
        amt = float(r.total_amount or 0)
        c_amt = float(r.cash_amount or 0)
        u_amt = float(r.upi_amount or 0)
        pm = r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method or "CASH")
        tot_sales += amt
        cust_name = (r.customer_name or "").strip() or "Walk-in"
        cust_phone = (r.customer_phone or "").strip() or None
        source_val = r.source.value if hasattr(r.source, "value") else str(r.source or "")
        entry_type = "EXCHANGE_SALE" if source_val == "EXCHANGE" else "SALE"

        if source_val == "EXCHANGE":
            # Cash collected is only the difference beyond return credit applied
            ret_gross = float(r.exchange_return_gross or 0)
            diff_paid = max(0.0, amt - ret_gross)
            if pm == "EXCHANGE_CREDIT" or diff_paid <= 0.001:
                desc = "Exchange Sale via Return Credit"
                cr_amt = 0.0
            else:
                desc = f"Exchange Sale via {pm} (Diff Paid)"
                cr_amt = diff_paid
                if pm == "CASH":
                    cash_sales += diff_paid
                elif pm == "SPLIT":
                    cash_sales += min(c_amt, diff_paid)
                elif c_amt > 0:
                    cash_sales += min(c_amt, diff_paid)
        else:
            if pm == "SPLIT" or (c_amt > 0 and u_amt > 0):
                desc = f"Bill via SPLIT [Cash: ₹{c_amt:.2f}, UPI: ₹{u_amt:.2f}]"
                cash_sales += c_amt
            elif pm == "CASH":
                desc = "Bill via CASH"
                cash_sales += (c_amt if c_amt > 0 else amt)
            else:
                desc = f"Bill via {pm}"
                if c_amt > 0:
                    cash_sales += c_amt
            cr_amt = amt

        entries.append({
            "ts": ensure_naive_utc(r.created_at) or start_utc,
            "type": entry_type,
            "ref": r.basket_number or "",
            "desc": desc,
            "dr": 0.0,
            "cr": cr_amt,
            "entity_name": cust_name,
            "entity_phone": cust_phone,
            "entity_type": "CUSTOMER",
        })
        
    stmt_ret = (
        select(
            CustomerReturn.created_at,
            CustomerReturn.return_number,
            CustomerReturn.gross_return_amount,
            CustomerReturn.total_refund_amount,
            CustomerReturn.total_exchange_amount,
            CustomerReturn.customer_name,
            CustomerReturn.customer_phone,
            CustomerReturn.refund_payment_method,
            Order.basket_number.label("order_basket_number"),
            Order.is_void.label("is_void_return"),
        )
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= start_utc,
            CustomerReturn.created_at <= end_utc,
        )
    )
    res_ret = await db.execute(stmt_ret)
    tot_ret = 0.0
    cash_refunds = 0.0
    for r in res_ret.all():
        amt = float(r.total_refund_amount or 0)
        gross_amt = float(getattr(r, "gross_return_amount", None) or (amt + (float(getattr(r, "total_exchange_amount", 0) or 0))))
        tot_ret += gross_amt
        cust_name = (r.customer_name or "").strip() or "Walk-in"
        cust_phone = (r.customer_phone or "").strip() or None
        rpm = (r.refund_payment_method or "CASH").upper()
        if rpm == "CASH":
            cash_refunds += amt
        ref_bill_text = f" (Bill #{r.order_basket_number})" if r.order_basket_number else ""
        is_void_return = getattr(r, "is_void_return", False) or False
        
        if is_void_return:
            desc = f"Voided Bill Refund via {rpm}{ref_bill_text}"
            entry_type = "VOIDED_BILL"
        else:
            desc = f"Customer Refund via {rpm}{ref_bill_text}"
            entry_type = "CUSTOMER_RETURN"
            
        entries.append({
            "ts": ensure_naive_utc(r.created_at) or start_utc,
            "type": entry_type,
            "ref": r.return_number or "",
            "desc": desc,
            "dr": amt,
            "cr": 0.0,
            "entity_name": cust_name,
            "entity_phone": cust_phone,
            "entity_type": "CUSTOMER",
        })
        
    stmt_cdl = (
        select(
            CashDrawerLedger.created_at,
            CashDrawerLedger.transaction_type,
            CashDrawerLedger.denominations,
            CashDrawerLedger.notes,
            User.name.label("user_name"),
            User.phone.label("user_phone"),
            User.email.label("user_email"),
        )
        .outerjoin(User, CashDrawerLedger.created_by == User.id)
        .where(
            CashDrawerLedger.outlet_id == outlet_id,
            CashDrawerLedger.created_at >= start_utc,
            CashDrawerLedger.created_at <= end_utc,
            CashDrawerLedger.transaction_type.in_(["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"]),
        )
    )
    res_cdl = await db.execute(stmt_cdl)
    tot_in, tot_out = 0.0, 0.0
    for r in res_cdl.all():
        denoms = r.denominations or {}
        try:
            amt = sum(int(k) * int(v) for k, v in denoms.items() if str(k).isdigit())
        except (ValueError, TypeError):
            amt = 0.0
        
        amt = abs(float(amt))
        ttype = r.transaction_type.value if hasattr(r.transaction_type, "value") else str(r.transaction_type)
        is_dep = ttype == "MANUAL_DEPOSIT"
        if is_dep:
            tot_in += amt
        else:
            tot_out += amt
        staff_name = (r.user_name or "").strip() or (r.user_email or "").strip() or "Staff Member"
        staff_phone = (r.user_phone or "").strip() or None
        entries.append({
            "ts": ensure_naive_utc(r.created_at) or start_utc,
            "type": "CASH_DEPOSIT" if is_dep else "CASH_WITHDRAWAL",
            "ref": "-",
            "desc": r.notes or ttype,
            "dr": 0.0 if is_dep else amt,
            "cr": amt if is_dep else 0.0,
            "entity_name": staff_name,
            "entity_phone": staff_phone,
            "entity_type": "STAFF",
        })
        
    stmt_si = (
        select(
            StockIntake.intake_date,
            InventoryItem.name,
            StockIntake.quantity,
            StockIntake.unit_cost,
            StockIntake.batch_number,
            Supplier.name.label("supplier_name"),
            Supplier.phone.label("supplier_phone"),
        )
        .select_from(StockIntake)
        .join(InventoryItem, StockIntake.item_id == InventoryItem.id)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date >= start_utc,
            StockIntake.intake_date <= end_utc,
            ~StockIntake.batch_number.like("BAT-OV-%"),
            StockIntake.quantity > 0,
        )
    )
    res_si = await db.execute(stmt_si)
    tot_si = 0.0
    for r in res_si.all():
        amt = float((r.quantity or 0) * (r.unit_cost or 0))
        tot_si += amt
        
        entry_time = start_utc
        if hasattr(r.intake_date, "hour"):
            entry_time = ensure_naive_utc(r.intake_date) or start_utc
        else:
            entry_time = datetime.combine(r.intake_date, datetime.min.time())
            
        supp_name = (r.supplier_name or "").strip() or "Direct Supplier"
        supp_phone = (r.supplier_phone or "").strip() or None
        entries.append({
            "ts": entry_time,
            "type": "STOCK_INTAKE",
            "ref": r.batch_number or "-",
            "desc": f"Purchase: {r.name}",
            "dr": amt,
            "cr": 0.0,
            "entity_name": supp_name,
            "entity_phone": supp_phone,
            "entity_type": "SUPPLIER",
        })

    # Purchase returns issued to suppliers on this date (refund recovery inflow)
    stmt_pr = (
        select(
            PurchaseReturn.created_at,
            PurchaseReturn.return_number,
            PurchaseReturn.quantity,
            PurchaseReturn.total_refund_amount,
            PurchaseReturn.reason,
            func.coalesce(Supplier.name, PurchaseReturn.supplier_name, "Supplier").label("supplier_name"),
            Supplier.phone.label("supplier_phone"),
            InventoryItem.name.label("item_name"),
        )
        .select_from(PurchaseReturn)
        .join(InventoryItem, PurchaseReturn.item_id == InventoryItem.id)
        .outerjoin(StockIntake, PurchaseReturn.intake_id == StockIntake.id)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            PurchaseReturn.outlet_id == outlet_id,
            PurchaseReturn.created_at >= start_utc,
            PurchaseReturn.created_at <= end_utc,
        )
    )
    res_pr = await db.execute(stmt_pr)
    tot_pr = 0.0
    for r in res_pr.all():
        amt = float(r.total_refund_amount or 0)
        tot_pr += amt
        supp_name = (r.supplier_name or "").strip() or "Supplier"
        supp_phone = (r.supplier_phone or "").strip() or None
        reason_text = f" - {r.reason}" if r.reason else ""
        desc = f"Purchase Return: {r.item_name} ({float(r.quantity or 0):.2f}){reason_text}"
        entries.append({
            "ts": ensure_naive_utc(r.created_at) or start_utc,
            "type": "PURCHASE_RETURN",
            "ref": r.return_number or "-",
            "desc": desc,
            "dr": 0.0,
            "cr": amt,
            "entity_name": supp_name,
            "entity_phone": supp_phone,
            "entity_type": "SUPPLIER",
        })
        
    entries.sort(key=lambda x: ensure_naive_utc(x["ts"]) or datetime.min)
    
    day_entries = []
    bal = opening_cash
    for e in entries:
        bal = bal + e["cr"] - e["dr"]
        day_entries.append(
            DayBookEntry(
                timestamp=e["ts"].isoformat() if hasattr(e["ts"], "isoformat") else str(e["ts"]),
                entry_type=e["type"],
                reference_number=e["ref"],
                description=e["desc"],
                debit=round(e["dr"], 2),
                credit=round(e["cr"], 2),
                running_balance=round(bal, 2),
                entity_name=e.get("entity_name"),
                entity_phone=e.get("entity_phone"),
                entity_type=e.get("entity_type"),
            )
        )
        
    closing_cash = round(opening_cash + cash_sales + tot_in - tot_out - cash_refunds, 2)

    return DayBookResponse(
        date=date_str,
        opening_cash=round(opening_cash, 2),
        cash_sales=round(cash_sales, 2),
        cash_refunds=round(cash_refunds, 2),
        closing_cash=round(closing_cash, 2),
        total_sales=round(tot_sales, 2),
        total_returns=round(tot_ret, 2),
        total_cash_in=round(tot_in, 2),
        total_cash_out=round(tot_out, 2),
        total_stock_intake_cost=round(tot_si, 2),
        total_purchase_returns=round(tot_pr, 2),
        closing_balance=round(bal, 2),
        entries=day_entries
    )


async def get_outlet_earnings_report(
    db: AsyncSession,
    outlet_id: str,
    from_dt: datetime,
    to_dt: datetime,
) -> OutletEarningsResponse:
    from app.schemas.analytics import OutletEarningsResponse
    from app.models.order import Order
    from collections import defaultdict
    import math

    stmt = select(Order).where(
        Order.outlet_id == outlet_id,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
    )
    result = await db.execute(stmt)
    orders = result.scalars().all()

    gross_revenue = 0.0
    total_customer_returns = 0.0
    total_loyalty_discounts = 0.0
    total_credit_applied = 0.0
    total_udhaar_given = 0.0
    total_udhaar_recovered = 0.0
    total_credit_cashed_out = 0.0
    total_credit_awarded = 0.0

    chart_dict = defaultdict(lambda: {
        "date": "",
        "udhaar_given": 0.0,
        "udhaar_recovered": 0.0,
        "credit_cashed_out": 0.0,
        "credit_applied": 0.0,
        "loyalty_value_redeemed": 0.0,
        "gross_revenue": 0.0,
        "customer_returns": 0.0,
        "net_paid": 0.0
    })

    for o in orders:
        date_str = o.created_at.strftime("%Y-%m-%d")
        chart_dict[date_str]["date"] = date_str
        
        ta = float(o.total_amount or 0)
        ld = float(getattr(o, "loyalty_discount_inr", 0) or 0)
        ca = float(getattr(o, "credit_applied", 0) or 0)
        da = float(getattr(o, "debit_applied", 0) or 0)
        ds = float(getattr(o, "debt_settled", 0) or 0)
        cco = float(getattr(o, "credit_cashed_out", 0) or 0)
        caw = float(getattr(o, "credit_awarded", 0) or 0)
        
        gross_revenue += ta
        total_loyalty_discounts += ld
        total_credit_applied += ca
        total_udhaar_given += da
        total_udhaar_recovered += ds
        total_credit_cashed_out += cco
        total_credit_awarded += caw
        
        chart_dict[date_str]["gross_revenue"] += ta
        chart_dict[date_str]["loyalty_value_redeemed"] += ld
        chart_dict[date_str]["credit_applied"] += ca
        chart_dict[date_str]["udhaar_given"] += da
        chart_dict[date_str]["udhaar_recovered"] += ds
        chart_dict[date_str]["credit_cashed_out"] += cco
        
        np = ta - ca - da + ds + caw - cco
        chart_dict[date_str]["net_paid"] += np

    from app.models.customer_return import CustomerReturn
    from app.models.order import Order
    stmt_ret = select(CustomerReturn, Order.is_void.label("is_void_return")).outerjoin(Order, CustomerReturn.order_id == Order.id).where(
        CustomerReturn.outlet_id == outlet_id,
        CustomerReturn.created_at >= from_dt,
        CustomerReturn.created_at <= to_dt,
    )
    result_ret = await db.execute(stmt_ret)
    returns = result_ret.all()

    total_voided_returns = 0.0

    for r_row in returns:
        r = r_row[0]
        is_void_ret = r_row[1] or False
        if is_void_ret:
            continue
        date_str = r.created_at.strftime("%Y-%m-%d")
        chart_dict[date_str]["date"] = date_str
        
        gross_amt = float(getattr(r, "gross_return_amount", None) or (r.total_refund_amount + (getattr(r, "total_exchange_amount", 0) or 0)))
        
        total_customer_returns += gross_amt
        chart_dict[date_str]["customer_returns"] += gross_amt
        chart_dict[date_str]["net_paid"] -= gross_amt

        ca = float(getattr(r, "credit_applied", 0) or 0)
        da = float(getattr(r, "debit_applied", 0) or 0)
        ds = float(getattr(r, "debt_settled", 0) or 0)
        cco = float(getattr(r, "credit_cashed_out", 0) or 0)
        caw = float(getattr(r, "credit_awarded", 0) or 0)
        
        total_credit_applied += ca
        total_udhaar_given += da
        total_udhaar_recovered += ds
        total_credit_cashed_out += cco
        total_credit_awarded += caw
        
        chart_dict[date_str]["credit_applied"] += ca
        chart_dict[date_str]["udhaar_given"] += da
        chart_dict[date_str]["udhaar_recovered"] += ds
        chart_dict[date_str]["credit_cashed_out"] += cco

    net_drawer_earnings = (
        gross_revenue
        - total_customer_returns
        - total_credit_applied
        - total_udhaar_given
        + total_udhaar_recovered
        + total_credit_awarded
        - total_credit_cashed_out
    )

    chart_data = list(chart_dict.values())
    chart_data.sort(key=lambda x: x["date"])

    return OutletEarningsResponse(
        gross_revenue=gross_revenue,
        total_customer_returns=total_customer_returns,
        total_voided_returns=total_voided_returns,
        total_loyalty_discounts=total_loyalty_discounts,
        total_credit_applied=total_credit_applied,
        total_udhaar_given=total_udhaar_given,
        total_udhaar_recovered=total_udhaar_recovered,
        total_credit_cashed_out=total_credit_cashed_out,
        total_credit_awarded=total_credit_awarded,
        net_drawer_earnings=net_drawer_earnings,
        chart_data=chart_data,
    )


async def get_abandoned_cart_analytics(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> AbandonedCartStatsResponse:
    stmt = select(
        func.count(AbandonedCart.id),
        func.sum(case((AbandonedCart.status == "CONVERTED", 1), else_=0)),
        func.sum(case((AbandonedCart.status == "ABANDONED", 1), else_=0)),
        func.sum(AbandonedCart.total_estimate),
        func.sum(case((AbandonedCart.status == "CONVERTED", AbandonedCart.total_estimate), else_=0))
    ).where(
        AbandonedCart.outlet_id == outlet_id,
        AbandonedCart.created_at >= from_dt,
        AbandonedCart.created_at <= to_dt,
    )
    res = await db.execute(stmt)
    row = res.first()
    
    tot = int(row[0] or 0) if row else 0
    conv = int(row[1] or 0) if row else 0
    aban = int(row[2] or 0) if row else 0
    tot_val = float(row[3] or 0)
    conv_val = float(row[4] or 0)
    
    return AbandonedCartStatsResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_abandoned=aban,
        total_converted=conv,
        conversion_rate_pct=round((conv / tot) * 100.0, 2) if tot > 0 else 0.0,
        total_abandoned_value=round(tot_val - conv_val, 2),
        total_converted_value=round(conv_val, 2),
        avg_cart_value=round(tot_val / tot, 2) if tot > 0 else 0.0
    )


async def get_loyalty_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> LoyaltyReportResponse:
    stmt_ord = select(
        func.sum(Order.loyalty_points_earned),
        func.sum(Order.loyalty_points_redeemed)
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt,
        Order.created_at <= to_dt,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    res_ord = await db.execute(stmt_ord)
    orow = res_ord.first()
    earned = int(orow[0] or 0) if orow else 0
    redeemed = int(orow[1] or 0) if orow else 0
    
    stmt_cust = select(
        func.sum(Customer.loyalty_points),
        func.count(case((Customer.loyalty_points > 0, 1)))
    ).where(
        Customer.outlet_id == outlet_id,
    )
    res_cust = await db.execute(stmt_cust)
    crow = res_cust.first()
    outs = int(crow[0] or 0) if crow else 0
    withp = int(crow[1] or 0) if crow else 0
    
    return LoyaltyReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_points_earned=earned,
        total_points_redeemed=redeemed,
        net_outstanding_points=outs,
        total_customers_with_points=withp,
        avg_points_per_customer=round(outs / withp, 2) if withp > 0 else 0.0,
        redemption_rate_pct=round((redeemed / earned) * 100.0, 2) if earned > 0 else 0.0
    )


async def get_supplier_spend(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> SupplierSpendResponse:
    sname_expr = func.coalesce(Supplier.name, "Unknown")
    stmt = (
        select(
            Supplier.id.label("sid"),
            sname_expr.label("sname"),
            func.count(StockIntake.id).label("cnt"),
            func.sum(StockIntake.quantity).label("qty"),
            func.sum(StockIntake.quantity * StockIntake.unit_cost).label("spend"),
            func.avg(StockIntake.unit_cost).label("avg_uc")
        )
        .select_from(StockIntake)
        .outerjoin(Supplier, StockIntake.supplier_id == Supplier.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date >= from_dt,
            StockIntake.intake_date <= to_dt,
            ~StockIntake.batch_number.like("BAT-OV-%"),
            StockIntake.quantity > 0,
        )
        .group_by(Supplier.id, sname_expr)
        .order_by(func.sum(StockIntake.quantity * StockIntake.unit_cost).desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    # Query all detailed batches received in this date window to provide transparent breakdown
    stmt_batches = (
        select(
            StockIntake.id,
            StockIntake.supplier_id,
            StockIntake.batch_number,
            StockIntake.item_id,
            InventoryItem.name.label("item_name"),
            StockIntake.intake_date,
            StockIntake.expiry_date,
            StockIntake.quantity,
            StockIntake.remaining_quantity,
            StockIntake.unit_cost,
        )
        .select_from(StockIntake)
        .join(InventoryItem, StockIntake.item_id == InventoryItem.id)
        .where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date >= from_dt,
            StockIntake.intake_date <= to_dt,
            ~StockIntake.batch_number.like("BAT-OV-%"),
            StockIntake.quantity > 0,
        )
        .order_by(StockIntake.intake_date.desc(), StockIntake.created_at.desc())
    )
    res_batches = await db.execute(stmt_batches)
    from collections import defaultdict
    supplier_batches_map = defaultdict(list)
    for b in res_batches.all():
        key = str(b.supplier_id) if b.supplier_id else "__none__"
        b_qty = float(b.quantity or 0)
        b_rem = float(b.remaining_quantity or 0)
        b_uc = float(b.unit_cost or 0)
        supplier_batches_map[key].append(
            SupplierBatchRow(
                intake_id=str(b.id),
                batch_number=b.batch_number,
                item_id=str(b.item_id),
                item_name=b.item_name or "Unknown Item",
                intake_date=b.intake_date.isoformat() if hasattr(b.intake_date, "isoformat") else str(b.intake_date),
                expiry_date=b.expiry_date.isoformat() if (b.expiry_date and hasattr(b.expiry_date, "isoformat")) else (str(b.expiry_date) if b.expiry_date else None),
                quantity=round(b_qty, 3),
                remaining_quantity=round(b_rem, 3),
                unit_cost=round(b_uc, 2),
                total_cost=round(b_qty * b_uc, 2),
            )
        )
    
    tot_spend = sum(float(r.spend or 0) for r in rows)
    suppliers = []
    
    for r in rows:
        sp = float(r.spend or 0)
        s_key = str(r.sid) if r.sid else "__none__"
        suppliers.append(
            SupplierSpendRow(
                supplier_id=str(r.sid) if r.sid else None,
                supplier_name=r.sname,
                total_intakes=int(r.cnt or 0),
                total_quantity=float(r.qty or 0),
                total_spend=round(sp, 2),
                avg_unit_cost=round(float(r.avg_uc or 0), 2),
                share_pct=round((sp / tot_spend) * 100.0, 2) if tot_spend > 0 else 0.0,
                batches=supplier_batches_map.get(s_key, []),
            )
        )
        
    return SupplierSpendResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        total_spend=round(tot_spend, 2),
        total_suppliers=len(suppliers),
        suppliers=suppliers
    )


async def get_customer_spends_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> CustomerSpendsReportResponse:
    """Aggregates customer spends, returns, order histories, and ledger details for a date range."""
    from_dt = ensure_naive_utc(from_dt)
    to_dt = ensure_naive_utc(to_dt)

    # 1. Fetch registered customers for this outlet
    cust_stmt = (
        select(
            Customer.id,
            Customer.name,
            Customer.phone,
            Customer.credit_balance,
            Customer.loyalty_points
        )
        .where(Customer.outlet_id == outlet_id)
    )
    cust_res = await db.execute(cust_stmt)
    customers_by_phone: dict[str, dict] = {}
    customers_by_id: dict[str, dict] = {}
    for c in cust_res.all():
        rec = {
            "id": str(c.id),
            "name": c.name,
            "phone": c.phone,
            "credit_balance": float(c.credit_balance or 0),
            "loyalty_points": int(c.loyalty_points or 0),
        }
        if c.phone:
            customers_by_phone[c.phone.strip()] = rec
        customers_by_id[str(c.id)] = rec

    # 2. Subquery for items count per order
    item_counts_sub = (
        select(
            OrderItem.order_id,
            func.count(OrderItem.id).label("items_count"),
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )

    # 3. Fetch settled orders in period with customer identification
    ord_stmt = (
        select(
            Order.id,
            Order.basket_number,
            Order.customer_id,
            Order.customer_name,
            Order.customer_phone,
            Order.total_amount,
            Order.subtotal_amount,
            Order.tax_amount,
            Order.discount_value,
            Order.payment_method,
            Order.status,
            Order.created_at,
            func.coalesce(item_counts_sub.c.items_count, 0).label("items_count"),
        )
        .outerjoin(item_counts_sub, Order.id == item_counts_sub.c.order_id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt,
            Order.created_at <= to_dt,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            or_(Order.customer_phone.isnot(None), Order.customer_id.isnot(None)),
        )
        .order_by(Order.created_at.desc())
    )
    ord_res = await db.execute(ord_stmt)
    orders = ord_res.all()

    # 4. Fetch customer returns in period
    ret_stmt = (
        select(
            CustomerReturn.id,
            CustomerReturn.return_number,
            CustomerReturn.order_id,
            CustomerReturn.customer_name,
            CustomerReturn.customer_phone,
            CustomerReturn.gross_return_amount,
            CustomerReturn.total_refund_amount,
            CustomerReturn.refund_payment_method,
            CustomerReturn.notes,
            CustomerReturn.returned_items,
            CustomerReturn.created_at,
            Order.customer_phone.label("order_customer_phone"),
            Order.customer_name.label("order_customer_name"),
            Order.basket_number.label("order_basket_number"),
        )
        .outerjoin(Order, CustomerReturn.order_id == Order.id)
        .where(
            CustomerReturn.outlet_id == outlet_id,
            CustomerReturn.created_at >= from_dt,
            CustomerReturn.created_at <= to_dt,
            or_(Order.id == None, Order.is_void == False),
        )
        .order_by(CustomerReturn.created_at.desc())
    )
    ret_res = await db.execute(ret_stmt)
    returns = ret_res.all()

    # 5. Group by customer (preferring normalized phone or customer_id)
    grouped: dict[str, dict] = {}

    def get_or_create_cust(phone: str | None, cid: str | None, fallback_name: str | None) -> dict | None:
        clean_phone = phone.strip() if phone else None
        key = clean_phone or cid
        if not key:
            return None
        if key not in grouped:
            c_rec = customers_by_phone.get(clean_phone) if clean_phone else None
            if not c_rec and cid:
                c_rec = customers_by_id.get(cid)
            grouped[key] = {
                "customer_id": c_rec["id"] if c_rec else cid,
                "customer_name": c_rec["name"] if c_rec else (fallback_name or "Walk-in Customer"),
                "customer_phone": clean_phone or (c_rec["phone"] if c_rec else ""),
                "credit_balance": c_rec["credit_balance"] if c_rec else 0.0,
                "loyalty_points": c_rec["loyalty_points"] if c_rec else 0,
                "orders": [],
                "returns": [],
                "total_spent": 0.0,
                "total_returned_amount": 0.0,
                "last_activity_date": None,
            }
        return grouped[key]

    for o in orders:
        cid_str = str(o.customer_id) if o.customer_id else None
        cust = get_or_create_cust(o.customer_phone, cid_str, o.customer_name)
        if not cust:
            continue
        amt = float(o.total_amount or 0)
        cust["total_spent"] += amt
        dt_str = o.created_at.isoformat() if hasattr(o.created_at, "isoformat") else str(o.created_at)
        if not cust["last_activity_date"] or dt_str > cust["last_activity_date"]:
            cust["last_activity_date"] = dt_str

        status_val = o.status.value if hasattr(o.status, "value") else str(o.status)
        cust["orders"].append(
            CustomerSpendOrder(
                order_id=str(o.id),
                basket_number=o.basket_number or "",
                created_at=dt_str,
                total_amount=round(amt, 2),
                subtotal_amount=round(float(o.subtotal_amount or 0), 2),
                tax_amount=round(float(o.tax_amount or 0), 2),
                discount_value=round(float(o.discount_value or 0), 2),
                payment_method=str(o.payment_method or "CASH"),
                status=status_val,
                items_count=int(o.items_count or 0),
            )
        )

    for r in returns:
        phone = r.customer_phone or r.order_customer_phone
        name = r.customer_name or r.order_customer_name
        cust = get_or_create_cust(phone, None, name)
        if not cust:
            continue
        ref_amt = float(r.total_refund_amount or 0)
        cust["total_returned_amount"] += ref_amt
        dt_str = r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at)
        if not cust["last_activity_date"] or dt_str > cust["last_activity_date"]:
            cust["last_activity_date"] = dt_str

        gross_amt = float(r.gross_return_amount or ref_amt)
        pay_method = r.refund_payment_method.value if hasattr(r.refund_payment_method, "value") else str(r.refund_payment_method or "CASH")

        cust["returns"].append(
            CustomerSpendReturn(
                return_id=str(r.id),
                return_number=r.return_number or "",
                order_id=str(r.order_id) if r.order_id else None,
                order_basket_number=r.order_basket_number,
                created_at=dt_str,
                gross_return_amount=round(gross_amt, 2),
                total_refund_amount=round(ref_amt, 2),
                refund_payment_method=pay_method,
                notes=r.notes,
                returned_items=r.returned_items if isinstance(r.returned_items, list) else [],
            )
        )

    # 6. Also include registered customers who may not have spent in this period
    for phone, rec in customers_by_phone.items():
        if phone not in grouped and rec["id"] not in grouped:
            grouped[phone] = {
                "customer_id": rec["id"],
                "customer_name": rec["name"],
                "customer_phone": phone,
                "credit_balance": rec["credit_balance"],
                "loyalty_points": rec["loyalty_points"],
                "orders": [],
                "returns": [],
                "total_spent": 0.0,
                "total_returned_amount": 0.0,
                "last_activity_date": None,
            }

    customer_rows: list[CustomerSpendRow] = []
    tot_spends = 0.0
    tot_returns = 0.0
    tot_orders_count = 0
    active_customers_count = 0

    for c in grouped.values():
        tot_orders = len(c["orders"])
        t_spent = round(c["total_spent"], 2)
        t_ret = round(c["total_returned_amount"], 2)
        net_spent = round(t_spent - t_ret, 2)
        aov = round(t_spent / tot_orders, 2) if tot_orders > 0 else 0.0

        if tot_orders > 0 or len(c["returns"]) > 0:
            active_customers_count += 1
            tot_spends += t_spent
            tot_returns += t_ret
            tot_orders_count += tot_orders

        customer_rows.append(
            CustomerSpendRow(
                customer_id=c["customer_id"],
                customer_name=c["customer_name"],
                customer_phone=c["customer_phone"],
                total_orders=tot_orders,
                total_spent=t_spent,
                total_returns_count=len(c["returns"]),
                total_returned_amount=t_ret,
                net_spent=net_spent,
                avg_order_value=aov,
                credit_balance=c["credit_balance"],
                loyalty_points=c["loyalty_points"],
                last_activity_date=c["last_activity_date"],
                orders=c["orders"],
                returns=c["returns"],
            )
        )

    # Sort customers: active spenders first (highest spent descending), then alphabetical by name
    customer_rows.sort(key=lambda x: (x.total_spent > 0 or x.total_returned_amount > 0, x.total_spent), reverse=True)

    net_customer_spends = round(tot_spends - tot_returns, 2)
    avg_spend = round(net_customer_spends / active_customers_count, 2) if active_customers_count > 0 else 0.0

    summary = CustomerSpendsSummary(
        total_customer_spends=round(tot_spends, 2),
        total_returns_amount=round(tot_returns, 2),
        net_customer_spends=net_customer_spends,
        total_customers_count=active_customers_count,
        total_orders_count=tot_orders_count,
        avg_spend_per_customer=avg_spend,
    )

    return CustomerSpendsReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        summary=summary,
        customers=customer_rows,
    )


async def get_inventory_summary_report(
    db: AsyncSession,
    outlet_id: uuid.UUID,
    from_dt: datetime,
    to_dt: datetime,
) -> InventorySummaryReportResponse:
    from_dt_naive = ensure_naive_utc(from_dt) or from_dt
    to_dt_naive = ensure_naive_utc(to_dt) or to_dt
    now_naive = ensure_naive_utc(datetime.now(timezone.utc))

    # 1. Gross Inward Spend: Total stock intake batches received in the period
    # Exclude auto-generated oversold deficit placeholders (BAT-OV-%) and non-positive batches
    stmt_spend = select(
        func.coalesce(func.sum(StockIntake.quantity * StockIntake.unit_cost), 0.0)
    ).where(
        StockIntake.outlet_id == outlet_id,
        StockIntake.intake_date >= from_dt_naive,
        StockIntake.intake_date <= to_dt_naive,
        StockIntake.quantity > 0,
        ~StockIntake.batch_number.like("BAT-OV-%"),
    )
    gross_spend_res = await db.execute(stmt_spend)
    gross_inward_spend = float(gross_spend_res.scalar() or 0.0)

    # 2. Purchase Returns: Stock returned to suppliers in the period
    stmt_returns = select(
        func.coalesce(func.sum(PurchaseReturn.total_refund_amount), 0.0)
    ).where(
        PurchaseReturn.outlet_id == outlet_id,
        PurchaseReturn.created_at >= from_dt_naive,
        PurchaseReturn.created_at <= to_dt_naive,
    )
    returns_res = await db.execute(stmt_returns)
    purchase_returns = float(returns_res.scalar() or 0.0)

    # Net Supplier Spend (actual net inward procurement outlay)
    net_supplier_spend = gross_inward_spend - purchase_returns

    # 3. Wastage Cost: Spoiled, expired, damaged, theft or batch voids in period
    # Exclude clerical intake corrections and audit corrections (handled separately)
    stmt_wastage = select(
        func.coalesce(
            func.sum(
                func.abs(StockLedger.quantity_change)
                * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
            ),
            0.0,
        )
    ).where(
        StockLedger.outlet_id == outlet_id,
        StockLedger.created_at >= from_dt_naive,
        StockLedger.created_at <= to_dt_naive,
        or_(
            and_(
                StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT,
                StockLedger.quantity_change < 0,
                ~StockLedger.reason.in_(["AUDIT_CORRECTION", "INTAKE_CORRECTION", "OVERSOLD_RECONCILE"]),
            ),
            StockLedger.change_type == StockChangeTypeEnum.VOID_BATCH,
        ),
    )
    wastage_res = await db.execute(stmt_wastage)
    wastage_cost = float(wastage_res.scalar() or 0.0)

    # 4. Manual Adjustments: Physical audit count discrepancies in period
    # Positive means count adjusted up, negative means adjusted down (shrinkage)
    stmt_adjustments = select(
        func.coalesce(
            func.sum(
                StockLedger.quantity_change
                * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
            ),
            0.0,
        )
    ).where(
        StockLedger.outlet_id == outlet_id,
        StockLedger.created_at >= from_dt_naive,
        StockLedger.created_at <= to_dt_naive,
        StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT,
        StockLedger.reason == "AUDIT_CORRECTION",
    )
    adj_res = await db.execute(stmt_adjustments)
    manual_adjustments = float(adj_res.scalar() or 0.0)

    # 5. Cost of Goods Sold (COGS) from settled, non-voided orders in period
    stmt_cogs = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
                            -func.abs(StockLedger.quantity_change)
                            * func.coalesce(StockLedger.unit_cost_snapshot, 0.0),
                        ),
                        else_=func.abs(StockLedger.quantity_change)
                        * func.coalesce(StockLedger.unit_cost_snapshot, 0.0),
                    )
                ),
                0.0,
            )
        )
        .select_from(StockLedger)
        .join(Order, StockLedger.reference_order_id == Order.id)
        .where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at >= from_dt_naive,
            StockLedger.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
            StockLedger.change_type.in_([
                StockChangeTypeEnum.AUTO_DEDUCTION,
                StockChangeTypeEnum.OVERSOLD,
                StockChangeTypeEnum.RESTOCK,
            ]),
        )
    )
    cogs_res = await db.execute(stmt_cogs)
    cost_of_goods_sold = max(0.0, float(cogs_res.scalar() or 0.0))

    # 6. Current Unsold Inventory Holding Asset Value (live right now)
    stmt_holding = select(
        func.coalesce(
            func.sum(StockIntake.remaining_quantity * StockIntake.unit_cost),
            0.0,
        )
    ).where(
        StockIntake.outlet_id == outlet_id,
        StockIntake.remaining_quantity > 0,
        ~StockIntake.batch_number.like("BAT-OV-%"),
    )
    holding_res = await db.execute(stmt_holding)
    current_holding_value = float(holding_res.scalar() or 0.0)

    # Net stock asset valuation delta in the current period
    # Delta = Net Inward Spend - COGS - Wastage + Manual Adjustments
    net_period_stock_delta = net_supplier_spend - cost_of_goods_sold - wastage_cost + manual_adjustments

    # Historical rollback if to_dt is in the past
    if to_dt_naive < now_naive:
        # Calculate net stock value change between to_dt and now
        stmt_post_spend = select(
            func.coalesce(func.sum(StockIntake.quantity * StockIntake.unit_cost), 0.0)
        ).where(
            StockIntake.outlet_id == outlet_id,
            StockIntake.intake_date > to_dt_naive,
            StockIntake.quantity > 0,
            ~StockIntake.batch_number.like("BAT-OV-%"),
        )
        post_spend = float((await db.execute(stmt_post_spend)).scalar() or 0.0)

        stmt_post_returns = select(
            func.coalesce(func.sum(PurchaseReturn.total_refund_amount), 0.0)
        ).where(
            PurchaseReturn.outlet_id == outlet_id,
            PurchaseReturn.created_at > to_dt_naive,
        )
        post_returns = float((await db.execute(stmt_post_returns)).scalar() or 0.0)

        stmt_post_cogs = (
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (
                                StockLedger.change_type == StockChangeTypeEnum.RESTOCK,
                                -func.abs(StockLedger.quantity_change)
                                * func.coalesce(StockLedger.unit_cost_snapshot, 0.0),
                            ),
                            else_=func.abs(StockLedger.quantity_change)
                            * func.coalesce(StockLedger.unit_cost_snapshot, 0.0),
                        )
                    ),
                    0.0,
                )
            )
            .select_from(StockLedger)
            .join(Order, StockLedger.reference_order_id == Order.id)
            .where(
                StockLedger.outlet_id == outlet_id,
                StockLedger.created_at > to_dt_naive,
                Order.status.in_(SETTLED_STATUSES),
                Order.is_void == False,
                StockLedger.change_type.in_([
                    StockChangeTypeEnum.AUTO_DEDUCTION,
                    StockChangeTypeEnum.OVERSOLD,
                    StockChangeTypeEnum.RESTOCK,
                ]),
            )
        )
        post_cogs = max(0.0, float((await db.execute(stmt_post_cogs)).scalar() or 0.0))

        stmt_post_wastage = select(
            func.coalesce(
                func.sum(
                    func.abs(StockLedger.quantity_change)
                    * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
                ),
                0.0,
            )
        ).where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at > to_dt_naive,
            or_(
                and_(
                    StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT,
                    StockLedger.quantity_change < 0,
                    ~StockLedger.reason.in_(["AUDIT_CORRECTION", "INTAKE_CORRECTION", "OVERSOLD_RECONCILE"]),
                ),
                StockLedger.change_type == StockChangeTypeEnum.VOID_BATCH,
            ),
        )
        post_wastage = float((await db.execute(stmt_post_wastage)).scalar() or 0.0)

        stmt_post_adj = select(
            func.coalesce(
                func.sum(
                    StockLedger.quantity_change
                    * func.coalesce(StockLedger.unit_cost_snapshot, 0.0)
                ),
                0.0,
            )
        ).where(
            StockLedger.outlet_id == outlet_id,
            StockLedger.created_at > to_dt_naive,
            StockLedger.change_type == StockChangeTypeEnum.MANUAL_ADJUSTMENT,
            StockLedger.reason == "AUDIT_CORRECTION",
        )
        post_adj = float((await db.execute(stmt_post_adj)).scalar() or 0.0)

        post_delta = (post_spend - post_returns) - post_cogs - post_wastage + post_adj
        closing_stock_value = max(0.0, current_holding_value - post_delta)
    else:
        closing_stock_value = current_holding_value

    opening_stock_value = max(0.0, closing_stock_value - net_period_stock_delta)

    # Total effective inward stock available for sale in this period:
    # Opening Stock + Net Inward Spend
    effective_inward_stock = max(0.0, opening_stock_value + net_supplier_spend - wastage_cost + manual_adjustments)

    # 7. Sold Inventory Counter Revenue in period (from settled, non-voided orders)
    stmt_rev = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            OrderItem.quantity > OrderItem.returned_quantity,
                            OrderItem.quantity - OrderItem.returned_quantity,
                        ),
                        else_=0.0,
                    )
                    * OrderItem.unit_price
                ),
                0.0,
            )
        )
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.outlet_id == outlet_id,
            Order.created_at >= from_dt_naive,
            Order.created_at <= to_dt_naive,
            Order.status.in_(SETTLED_STATUSES),
            Order.is_void == False,
        )
    )
    rev_res = await db.execute(stmt_rev)
    sold_inventory_revenue = float(rev_res.scalar() or 0.0)

    # Customer discounts and loyalty applied to settled orders in the period
    stmt_disc = select(
        func.coalesce(
            func.sum(
                func.coalesce(
                    case(
                        (Order.discount_type == "PERCENT", Order.subtotal_amount * (Order.discount_value / 100.0)),
                        (Order.discount_type == "FLAT", Order.discount_value),
                        else_=func.coalesce(Order.discount_value, 0.0),
                    ),
                    0.0,
                )
                + func.coalesce(Order.loyalty_discount_inr, 0.0)
            ),
            0.0,
        )
    ).where(
        Order.outlet_id == outlet_id,
        Order.created_at >= from_dt_naive,
        Order.created_at <= to_dt_naive,
        Order.status.in_(SETTLED_STATUSES),
        Order.is_void == False,
    )
    disc_res = await db.execute(stmt_disc)
    customer_discounts = float(disc_res.scalar() or 0.0)
    net_sold_revenue = max(0.0, sold_inventory_revenue - customer_discounts)

    # Section B Computations: Commercial Return & Realized Profit
    gross_merchandise_margin = net_sold_revenue - cost_of_goods_sold
    realized_net_profit = gross_merchandise_margin - wastage_cost + manual_adjustments
    total_economic_value = realized_net_profit + closing_stock_value

    reconciliation_bridge = InventoryReconciliationBridge(
        gross_inward_spend=round(gross_inward_spend, 2),
        purchase_returns=round(purchase_returns, 2),
        net_supplier_spend=round(net_supplier_spend, 2),
        wastage_cost=round(wastage_cost, 2),
        manual_adjustments=round(manual_adjustments, 2),
        effective_inward_stock=round(effective_inward_stock, 2),
        cost_of_goods_sold=round(cost_of_goods_sold, 2),
        current_holding_value=round(current_holding_value, 2),
        opening_stock_value=round(opening_stock_value, 2),
        closing_stock_value=round(closing_stock_value, 2),
        sold_inventory_revenue=round(sold_inventory_revenue, 2),
        customer_discounts=round(customer_discounts, 2),
        net_sold_revenue=round(net_sold_revenue, 2),
        gross_merchandise_margin=round(gross_merchandise_margin, 2),
        realized_net_profit=round(realized_net_profit, 2),
        total_economic_value=round(total_economic_value, 2),
    )

    return InventorySummaryReportResponse(
        from_date=from_dt.isoformat(),
        to_date=to_dt.isoformat(),
        gross_inward_spend=round(gross_inward_spend, 2),
        purchase_returns=round(purchase_returns, 2),
        net_supplier_spend=round(net_supplier_spend, 2),
        wastage_cost=round(wastage_cost, 2),
        manual_adjustments=round(manual_adjustments, 2),
        effective_inward_stock=round(effective_inward_stock, 2),
        cost_of_goods_sold=round(cost_of_goods_sold, 2),
        current_holding_value=round(current_holding_value, 2),
        opening_stock_value=round(opening_stock_value, 2),
        closing_stock_value=round(closing_stock_value, 2),
        sold_inventory_revenue=round(sold_inventory_revenue, 2),
        customer_discounts=round(customer_discounts, 2),
        net_sold_revenue=round(net_sold_revenue, 2),
        gross_merchandise_margin=round(gross_merchandise_margin, 2),
        realized_net_profit=round(realized_net_profit, 2),
        total_economic_value=round(total_economic_value, 2),
        reconciliation_bridge=reconciliation_bridge,
    )


