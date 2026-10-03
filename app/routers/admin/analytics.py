"""
Analytics FastAPI Router — Revenue, Peak Hours, Top Items, Order Funnel, Profit Margin, and Exports.
Gated server-side to Owner/Admin and Manager roles only.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.dependencies import (
    AuthenticatedUser,
    DBSession,
    RequireAdmin,
    require_permission,
)
from app.models.enums import RoleEnum
from app.schemas.analytics import *
from app.services.analytics_service import *

router = APIRouter(
    prefix="/api/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_permission("can_view_analytics"))],
)


from app.core.datetime_utils import ensure_naive_utc


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime, datetime]:
    """Parse date strings or default to past 30 days."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    to_dt = now
    from_dt = now - timedelta(days=30)

    if from_date and from_date.strip():
        try:
            s = from_date.strip()
            parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
            val = ensure_naive_utc(parsed)
            if val:
                from_dt = val
        except Exception:
            pass

    if to_date and to_date.strip():
        try:
            s = to_date.strip()
            # If to_date is date-only (e.g. YYYY-MM-DD), set time to end-of-day
            if len(s) == 10 and s.count("-") == 2:
                parsed = datetime.fromisoformat(s + "T23:59:59.999999+00:00")
            else:
                parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
            val = ensure_naive_utc(parsed)
            if val:
                to_dt = val
        except Exception:
            pass

    if from_dt > to_dt:
        from_dt, to_dt = to_dt, from_dt

    return from_dt, to_dt


@router.get("/kpi-summary", response_model=KpiSummaryResponse)
async def get_kpi_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Fetch KPI summary strip metrics with period-over-period percentage comparisons."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_kpi_summary(db, target_outlet_id, from_dt, to_dt)


@router.get("/revenue", response_model=RevenueAnalyticsResponse)
async def get_revenue_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly|monthly)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Time-bucketed revenue and order counts."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_revenue_analytics(db, target_outlet_id, granularity, from_dt, to_dt)


@router.get("/peak-hours", response_model=PeakHoursResponse)
async def get_peak_hours_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Order volume distribution by hour-of-day (0-23)."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_peak_hours(db, target_outlet_id, from_dt, to_dt)


@router.get("/top-items", response_model=TopItemsResponse)
async def get_top_items_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    sort_by: str = Query("quantity", pattern="^(quantity|revenue)$"),
    limit: int = Query(10, ge=1, le=50),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Top selling menu items ranked by quantity or revenue share."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_top_selling_items(db, target_outlet_id, sort_by, limit, from_dt, to_dt)


@router.get("/funnel", response_model=OrderFunnelResponse)
async def get_funnel_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Order lifecycle conversion funnel and cancellation metrics."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_order_funnel(db, target_outlet_id, from_dt, to_dt)


@router.get("/profit", response_model=ProfitMarginResponse)
async def get_profit_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly|monthly)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Profit margin analysis (Revenue - COGS) using stock ledger unit cost snapshots."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_profit_margin_analytics(db, target_outlet_id, granularity, from_dt, to_dt)




@router.get("/category-sales", response_model=CategorySalesResponse)
async def get_category_sales_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_category_sales(db, target_outlet_id, from_dt, to_dt)


@router.get("/item-sales", response_model=ItemSalesResponse)
async def get_item_sales_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    sort_by: str = Query("revenue", pattern="^(quantity|revenue)$"),
    limit: int = Query(500, ge=1, le=2000),
    category_id: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_item_sales(db, target_outlet_id, from_dt, to_dt, sort_by, limit, category_id)


@router.get("/bill-profit", response_model=BillProfitResponse)
async def get_bill_profit_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_bill_profit(db, target_outlet_id, from_dt, to_dt, limit, offset)


@router.get("/aov", response_model=AovAnalyticsResponse)
async def get_aov_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly|monthly)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_aov_analytics(db, target_outlet_id, granularity, from_dt, to_dt)


@router.get("/stock-intake", response_model=StockIntakeReportResponse)
async def get_stock_intake_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    item_id: str | None = Query(None),
    supplier_id: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_stock_intake_report(db, target_outlet_id, from_dt, to_dt, item_id, supplier_id)


@router.get("/wastage", response_model=WastageReportResponse)
async def get_wastage_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_wastage_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/inventory-summary", response_model=InventorySummaryReportResponse)
async def get_inventory_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_inventory_summary_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/stock-movement", response_model=StockMovementResponse)
async def get_stock_movement_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_stock_movement(db, target_outlet_id, from_dt, to_dt)


@router.get("/purchase-returns", response_model=PurchaseReturnReportResponse)
async def get_purchase_returns_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_purchase_returns_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/new-customers", response_model=NewCustomerReportResponse)
async def get_new_customers_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    granularity: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_new_customers(db, target_outlet_id, granularity, from_dt, to_dt, limit=limit, offset=offset)


@router.get("/customer-returns", response_model=CustomerReturnReportResponse)
async def get_customer_returns_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_customer_return_analytics(db, target_outlet_id, from_dt, to_dt)


@router.get("/cash-denominations", response_model=CashDenominationResponse)
async def get_cash_denominations_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_cash_denomination_flow(db, target_outlet_id, from_dt, to_dt)


@router.get("/payment-mix", response_model=PaymentMixResponse)
async def get_payment_mix_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_payment_mix(db, target_outlet_id, from_dt, to_dt)


@router.get("/tax-summary", response_model=TaxSummaryResponse)
async def get_tax_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_tax_summary(db, target_outlet_id, from_dt, to_dt)


@router.get("/gstr1-hsn-summary", response_model=Gstr1HsnSummaryResponse)
async def get_gstr1_hsn_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """GSTR-1 Table 12 HSN/SAC Summary with UQC, Quantities, and Tax Breakup."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_gstr1_hsn_summary(db, target_outlet_id, from_dt, to_dt)


@router.get("/ca-export")
async def get_ca_export_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Download 1-Click Multi-Sheet Chartered Accountant (CA) GST Compliance Workbook (.xlsx)."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    file_bytes, filename = await generate_ca_excel_report(db, target_outlet_id, from_dt, to_dt)
    return Response(
        content=file_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/taxable-bills-summary", response_model=TaxableBillsResponse)
async def get_taxable_bills_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    gst_filter: str = Query("TAXABLE"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Aggregates bills where GST paid > 0 vs Zero-GST bills, with per-bill statutory tax breakdown."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_taxable_bills_summary(
        db, target_outlet_id, from_dt, to_dt, gst_filter=gst_filter, limit=limit, offset=offset
    )


@router.get("/service-charges-summary", response_model=ServiceChargesSummaryResponse)
async def get_service_charges_summary_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    charge_filter: str = Query("ALL_CHARGES"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Aggregates bills where delivery/service charge, handling charge, or both were applied."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_service_charges_summary(
        db, target_outlet_id, from_dt, to_dt, charge_filter=charge_filter, limit=limit, offset=offset
    )


@router.get("/discount-report", response_model=DiscountReportResponse)
async def get_discount_report_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_discount_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/day-book", response_model=DayBookResponse)
async def get_day_book_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    date: str = Query(..., description="YYYY-MM-DD"),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    return await get_day_book(db, target_outlet_id, date)


@router.get("/abandoned-carts", response_model=AbandonedCartStatsResponse)
async def get_abandoned_carts_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_abandoned_cart_analytics(db, target_outlet_id, from_dt, to_dt)


@router.get("/credit-debit-report", response_model=CreditDebitReportResponse)
async def get_credit_debit_report_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Credit and debit analytics report."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_credit_debit_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/customer-spends", response_model=CustomerSpendsReportResponse)
async def get_customer_spends_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Customer spends, returns, order histories, and ledger report."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_customer_spends_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/loyalty", response_model=LoyaltyReportResponse)

async def get_loyalty_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_loyalty_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/supplier-spend", response_model=SupplierSpendResponse)
async def get_supplier_spend_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_supplier_spend(db, target_outlet_id, from_dt, to_dt)


@router.get("/outlet-earnings", response_model=OutletEarningsResponse)
async def get_outlet_earnings_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    from_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="End date (YYYY-MM-DD)"),
):
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")
    from_dt, to_dt = _parse_date_range(from_date, to_date)
    return await get_outlet_earnings_report(db, target_outlet_id, from_dt, to_dt)


@router.get("/export")
async def export_analytics_endpoint(
    current_user: RequireAdmin,
    db: DBSession,
    report: str = Query("revenue", pattern="^(revenue|top_items|funnel|profit)$"),
    format: str = Query("csv", pattern="^(csv)$"),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    """Export analytics report data as CSV file."""
    target_outlet_id = current_user.outlet_id
    if not target_outlet_id:
        raise HTTPException(status_code=400, detail="outlet_id required")

    from_dt, to_dt = _parse_date_range(from_date, to_date)
    output = io.StringIO()
    writer = csv.writer(output)

    if report == "revenue":
        data = await get_revenue_analytics(db, target_outlet_id, "daily", from_dt, to_dt)
        writer.writerow(["Timestamp Bucket", "Revenue (INR)", "Orders Count"])
        for b in data.buckets:
            writer.writerow([b.bucket, f"{b.revenue:.2f}", b.orders_count])
    elif report == "top_items":
        data = await get_top_selling_items(db, target_outlet_id, "quantity", 50, from_dt, to_dt)
        writer.writerow(["Item Name", "Quantity Sold", "Revenue (INR)", "Revenue Share %"])
        for item in data.items:
            writer.writerow([item.name, item.quantity_sold, f"{item.revenue:.2f}", f"{item.revenue_share_pct:.2f}%"])
    elif report == "profit":
        data = await get_profit_margin_analytics(db, target_outlet_id, "daily", from_dt, to_dt)
        writer.writerow(["Timestamp Bucket", "Revenue (INR)", "COGS (INR)", "Net Profit (INR)", "Margin %"])
        for b in data.buckets:
            writer.writerow([b.bucket, f"{b.revenue:.2f}", f"{b.cogs:.2f}", f"{b.profit:.2f}", f"{b.margin_pct:.2f}%"])
    else:
        data = await get_order_funnel(db, target_outlet_id, from_dt, to_dt)
        writer.writerow(["Stage", "Label", "Order Count", "Percentage %"])
        for s in data.stages:
            writer.writerow([s.stage, s.stage_label, s.count, f"{s.percentage:.2f}%"])

    csv_data = output.getvalue()
    filename = f"analytics_{report}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
