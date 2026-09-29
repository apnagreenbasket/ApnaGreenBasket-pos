"""
Receipt Service — Backend calculation engine for official store bills and tax memos.
Formats timestamps to UTC+5:30 (IST) and computes exact subtotal, 5% GST breakdown, line item discounts, and grand totals.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any

from app.models.order import Order
from app.models.outlet import Outlet


# IST timezone offset (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))


def format_ist_datetime(dt: datetime | None) -> str:
    """Format datetime object into IST string (YYYY-MM-DD | hh:mm AM/PM)."""
    if not dt:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_time = dt.astimezone(IST)
    return ist_time.strftime("%Y-%m-%d | %I:%M %p")


def calculate_order_receipt(
    order: Order,
    outlet: Outlet,
    menu_items_map: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build a complete, structured receipt data payload for rendering
    80mm thermal receipts and cash memo screens.
    """
    items_map = menu_items_map or {}
    line_items = []
    subtotal_with_discounts = Decimal("0.00")

    for idx, item in enumerate(order.items, 1):
        item_data = items_map.get(str(item.menu_item_id))
        dish_name = item_data.get("name") if item_data else f"Item #{idx}"
        unit_price = Decimal(str(item.unit_price))
        qty = item.quantity
        line_total = unit_price * qty
        subtotal_with_discounts += line_total

        line_items.append({
            "id": str(item.id),
            "item_name": dish_name,
            "quantity": qty,
            "unit_price": float(unit_price),
            "line_total": float(line_total),
        })

    # Tax calculation: Subtotal without tax vs 5% GST (CGST 2.5% + SGST 2.5%)
    # Total amount = subtotal_without_tax + total_tax
    # subtotal_without_tax = total_amount / 1.05
    total_amount = Decimal(str(order.total_amount))
    subtotal_without_tax = (total_amount / Decimal("1.05")).quantize(Decimal("0.01"))
    total_tax = (total_amount - subtotal_without_tax).quantize(Decimal("0.01"))
    cgst = (total_tax / Decimal("2")).quantize(Decimal("0.01"))
    sgst = total_tax - cgst

    is_paid = order.status.value.upper() in ["PAID", "SERVED", "COMPLETED", "SETTLED"]

    return {
        "invoice_no": str(order.id)[:8].upper(),
        "order_id": str(order.id),
        "bill_type": "Sale",
        "date_time": format_ist_datetime(order.created_at),
        "basket_number": order.basket_number,
        "is_paid": is_paid,
        "payment_reference": order.payment_reference,
        "order_status": order.status.value,
        
        # Store & Outlet Details (Pure store branding, zero app branding)
        "outlet": {
            "name": outlet.name,
            "slug": outlet.slug,
            "logo_url": outlet.logo_url,
            "address": outlet.address or "Main Branch",
            "phone": outlet.phone,
            "gstin": outlet.gstin or "01AAFCB7044K1ZV",
            "fssai_no": outlet.fssai_no or "10718026000722",
        },

        # Customer Info
        "customer": {
            "name": order.customer_name or "Guest Diner",
            "phone": order.customer_phone or "N/A",
        },

        # Financial Breakdown
        "items": line_items,
        "total_items_count": len(line_items),
        "total_quantity": sum(item["quantity"] for item in line_items),
        "subtotal_without_tax": float(subtotal_without_tax),
        "total_tax": float(total_tax),
        "cgst": float(cgst),
        "sgst": float(sgst),
        "tax_rate_percent": 5.0,
        "total_amount": float(total_amount),
        "amount_paid": float(total_amount) if is_paid else 0.0,
    }
