"""
Billing Pydantic schemas — requests and responses for manual bill creation, discounts, approvals, and cash/UPI payments.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from app.schemas.common import BaseResponse, StrictSchema


class BillItemInput(StrictSchema):
    menu_item_id: str | None = None
    variant_id: str | None = None
    item_name: str | None = None
    quantity: Decimal = Field(..., gt=0)
    selected_unit: str | None = Field(None, max_length=50)
    selected_batch_id: str | None = None
    allow_oversell: bool = False
    unit_price: Decimal | None = Field(None, ge=0)
    mrp: Decimal | None = Field(None, ge=0)
    base_unit_price: Decimal | None = Field(None, ge=0)
    base_mrp: Decimal | None = Field(None, ge=0)
    is_custom_price: bool = False
    tax_rate: Decimal | None = Field(None, ge=0)
    hsn_code: str | None = None
    pricing_type: str = Field(default="RETAIL", pattern="^(RETAIL|WHOLESALE)$")
    is_complimentary: bool = False


class CreateManualBillRequest(StrictSchema):
    basket_number: str = "WALK-IN"
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_extra_detail: str | None = Field(None, max_length=1000)
    customer_gstin: str | None = Field(None, max_length=15)
    customer_legal_name: str | None = Field(None, max_length=255)
    replaces_bill_id: str | None = None
    is_interstate: bool = False
    place_of_supply: str | None = None
    items: list[BillItemInput] = Field(default_factory=list)


class UpdateManualBillRequest(StrictSchema):
    basket_number: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_extra_detail: str | None = Field(None, max_length=1000)
    customer_gstin: str | None = Field(None, max_length=15)
    customer_legal_name: str | None = Field(None, max_length=255)
    replaces_bill_id: str | None = None
    is_interstate: bool = False
    place_of_supply: str | None = None
    items: list[BillItemInput] = Field(default_factory=list)


class ApplyDiscountRequest(StrictSchema):
    discount_type: str = Field(..., pattern="^(PERCENT|FLAT|COMPLIMENTARY|COMPLIMENTARY_ITEMS)$")
    discount_value: float = Field(0.0, ge=0.0)
    reason_note: str = Field(..., min_length=2, max_length=500)
    item_complimentary_quantities: dict[str, float] | None = None


class ApproveDiscountRequest(StrictSchema):
    approve: bool


class MarkPaidRequest(StrictSchema):
    payment_method: str = Field(..., pattern="^(CASH|UPI|SPLIT)$")
    cash_amount: Decimal | None = None
    upi_amount: Decimal | None = None
    cash_denominations: dict[str, int] | None = None
    change_denominations: dict[str, int] | None = None
    redeem_loyalty_points: int = 0
    delivery_charge: Decimal = Field(default=Decimal("0.00"), ge=0)
    handling_charge: Decimal = Field(default=Decimal("0.00"), ge=0)
    apply_credit: Decimal = Field(default=Decimal("0.00"), ge=0)
    record_debit: Decimal = Field(default=Decimal("0.00"), ge=0)
    record_credit: Decimal = Field(default=Decimal("0.00"), ge=0)
    debt_settled: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_cashed_out: Decimal = Field(default=Decimal("0.00"), ge=0)


class CustomerReturnItemInput(StrictSchema):
    order_item_id: str | None = None
    menu_item_id: str | None = None
    item_name: str | None = None
    quantity: float = Field(..., gt=0)
    selected_unit: str | None = Field(None, max_length=50)
    unit_price: float | None = Field(None, ge=0)
    mrp: float | None = Field(None, ge=0)
    base_unit_price: float | None = Field(None, ge=0)
    base_mrp: float | None = Field(None, ge=0)
    tax_rate: float | None = Field(None, ge=0)
    hsn_code: str | None = Field(None, max_length=50)
    reason: str = Field(default="CUSTOMER_RETURN")


class CustomerReturnRequest(StrictSchema):
    order_id: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    return_items: list[CustomerReturnItemInput]
    exchange_items: list[BillItemInput] = Field(default_factory=list)
    refund_payment_method: str = Field(default="CASH", pattern="^(CASH|UPI|STORE_CREDIT|SPLIT|CARD|CREDIT_CARD|DEBIT_CARD)$")
    refund_cash_denominations: dict[str, int] | None = None
    inward_cash_denominations: dict[str, int] | None = None
    notes: str | None = None
    is_interstate: bool | None = None
    place_of_supply: str | None = None
    
    # Wallet / Ledger integrations
    apply_credit: Decimal = Field(default=Decimal("0.00"), ge=0)
    record_debit: Decimal = Field(default=Decimal("0.00"), ge=0)
    record_credit: Decimal = Field(default=Decimal("0.00"), ge=0)
    debt_settled: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_cashed_out: Decimal = Field(default=Decimal("0.00"), ge=0)
    round_off: Decimal = Field(default=Decimal("0.00"))


class CustomerReturnResponse(BaseResponse):
    id: str
    return_number: str
    order_id: str | None = None
    original_bill_number: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    returned_items: list[dict]
    exchange_items: list[dict] = Field(default_factory=list)
    gross_return_amount: float = 0.0
    total_refund_amount: float
    total_exchange_amount: float = 0.0
    exchange_order_id: str | None = None
    net_balance: float
    round_off: float = 0.0
    refund_payment_method: str
    processed_at: str
    credit_applied: float = 0.0
    debit_applied: float = 0.0
    debt_settled: float = 0.0
    credit_awarded: float = 0.0
    credit_cashed_out: float = 0.0
    customer_balance: float | None = None
    is_interstate: bool = False
    place_of_supply: str | None = None


class BillItemResponse(StrictSchema):
    id: str
    menu_item_id: str | None = None
    variant_id: str | None = None
    selected_batch_id: str | None = None
    selected_batch_number: str | None = None
    item_name: str
    quantity: float
    selected_unit: str | None = None
    returned_quantity: float = 0.0
    unit_price: float
    cost_price: float | None = None
    mrp: float | None = None
    tax_rate: float | None = None
    hsn_code: str | None = None
    is_complimentary: bool
    line_total: float


class BillResponse(BaseResponse):
    id: str
    outlet_id: str
    basket_number: str
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_gstin: str | None = None
    customer_legal_name: str | None = None
    status: str
    is_void: bool = False
    source: str
    subtotal_amount: float
    delivery_charge: float = 0.0
    handling_charge: float = 0.0
    tax_amount: float = 0.0
    total_amount: float
    total_refunded_amount: float = 0.0
    net_amount: float = 0.0
    is_interstate: bool = False
    place_of_supply: str | None = None
    credit_applied: float = 0.0
    debit_applied: float = 0.0
    credit_awarded: float = 0.0
    debt_settled: float = 0.0
    credit_cashed_out: float = 0.0
    customer_balance: float | None = None
    customer_loyalty_points: int | None = None
    discount_type: str | None = None
    discount_value: float | None = None
    discount_reason: str | None = None
    discount_status: str | None = None
    payment_method: str | None = None
    cash_amount: float = 0.0
    upi_amount: float = 0.0
    cash_denominations: dict[str, int] | None = None
    change_denominations: dict[str, int] | None = None
    loyalty_points_earned: int = 0
    loyalty_points_redeemed: int = 0
    loyalty_discount_inr: float = Field(default=0.0)
    created_by_staff_id: str | None = None
    replaces_bill_id: str | None = None
    created_at: str
    finalized_at: str | None = None
    paid_at: str | None = None
    items: list[BillItemResponse] = Field(default_factory=list)



class DiscountApprovalResponse(BaseResponse):
    id: str
    order_id: str
    requested_by_id: str
    requested_by_name: str | None = None
    approved_by_id: str | None = None
    status: str
    discount_type: str
    discount_value: float
    reason_note: str
    created_at: str
    order_basket_number: str
    order_total_amount: float


class ConsolidatedReconciliationResponse(BaseResponse):
    start_date: str | None = None
    end_date: str | None = None

    # POS Counter Billing
    counter_gross_sales: float
    counter_cash_tender: float
    counter_upi_tender: float
    counter_credit_applied: float
    counter_debit_applied: float
    counter_debt_settled: float
    counter_credit_awarded: float
    counter_credit_cashed_out: float
    counter_credit_debit_net: float
    counter_loyalty_redeemed: float
    counter_net_paid: float
    counter_bills_count: int

    # Customer Returns & Exchanges
    returns_gross_amount: float
    returns_exchange_value: float
    returns_net_refund: float
    returns_cash_refund: float
    returns_upi_refund: float
    returns_credit_debit_net: float
    returns_count: int

    # Consolidated Store Totals
    consolidated_net_sales: float
    cash_tender_total: float
    upi_tender_total: float
    total_tender: float
    consolidated_credit_debit_net: float
    consolidated_loyalty_redeemed: float
    consolidated_net_settlement: float


