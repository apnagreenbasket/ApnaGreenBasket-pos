"""
Schemas for Item-Level Transactional Return Ledger.
"""

from __future__ import annotations
from typing import Optional
from app.schemas.common import BaseResponse, StrictSchema


class ItemReturnLedgerRow(StrictSchema):
    id: str
    return_id: str
    return_number: str
    return_date: str
    order_id: Optional[str] = None
    original_bill_number: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    item_name: str
    menu_item_id: Optional[str] = None
    category_name: Optional[str] = None
    barcode: Optional[str] = None
    quantity: float
    selected_unit: Optional[str] = None
    unit_price: float
    mrp: Optional[float] = None
    line_refund: float
    tax_rate: Optional[float] = 0.0
    tax_category: Optional[str] = "GST 0%"
    hsn_code: Optional[str] = None
    reason: str = "CUSTOMER_RETURN"
    refund_payment_method: str = "CASH"
    staff_name: Optional[str] = None
    is_exchange: bool = False


class ItemReturnLedgerSummary(StrictSchema):
    total_line_items: int = 0
    total_quantity_returned: float = 0.0
    total_refund_amount: float = 0.0
    unique_bills_count: int = 0


class ItemReturnLedgerResponse(BaseResponse):
    summary: ItemReturnLedgerSummary
    items: list[ItemReturnLedgerRow] = []
    total_count: int = 0
    page: int = 1
    page_size: int = 50
