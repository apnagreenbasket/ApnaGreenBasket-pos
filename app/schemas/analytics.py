"""
Analytics schemas — requests and responses for Revenue, Peak Hours, Top Items, Order Funnel, and Profit Margin.
"""

from __future__ import annotations

from typing import Any
from pydantic import Field

from app.schemas.common import BaseResponse, StrictSchema


class KpiSummaryResponse(BaseResponse):
    total_revenue: float
    total_orders: int
    avg_order_value: float
    profit_margin_pct: float
    cogs: float
    net_profit: float
    # Period-over-Period comparisons
    prev_total_revenue: float
    prev_total_orders: int
    prev_avg_order_value: float
    prev_profit_margin_pct: float
    revenue_change_pct: float
    orders_change_pct: float
    aov_change_pct: float
    margin_change_pct: float
    # New fields
    gross_revenue: float = 0.0
    net_revenue: float = 0.0
    new_customers: int = 0
    return_count: int = Field(default=0)
    void_return_count: int = Field(default=0)
    total_return_amount: float = Field(default=0.0)
    void_return_amount: float = Field(default=0.0)
    net_cogs: float = 0.0
    total_discount_given: float = 0.0


class RevenueBucket(StrictSchema):
    bucket: str
    revenue: float
    orders_count: int
    prev_period_revenue: float | None = None


class RevenueAnalyticsResponse(BaseResponse):
    granularity: str
    from_date: str
    to_date: str
    buckets: list[RevenueBucket]


class PeakHourBucket(StrictSchema):
    hour: int
    hour_label: str
    orders_count: int


class PeakHoursResponse(BaseResponse):
    from_date: str
    to_date: str
    buckets: list[PeakHourBucket]


class TopItemResponse(StrictSchema):
    menu_item_id: str | None
    name: str
    category_name: str | None = None
    quantity_sold: float = 0.0
    revenue: float
    revenue_share_pct: float


class TopItemsResponse(BaseResponse):
    from_date: str
    to_date: str
    sort_by: str
    items: list[TopItemResponse]


class FunnelStage(StrictSchema):
    stage: str
    stage_label: str
    count: int
    percentage: float


class OrderFunnelResponse(BaseResponse):
    from_date: str
    to_date: str
    total_orders: int
    stages: list[FunnelStage]
    conversion_rate_pct: float
    cancellation_rate_pct: float


class ProfitBucket(StrictSchema):
    bucket: str
    revenue: float
    cogs: float
    profit: float
    margin_pct: float


class ProfitMarginResponse(BaseResponse):
    granularity: str
    from_date: str
    to_date: str
    total_revenue: float
    total_cogs: float
    total_profit: float
    overall_margin_pct: float
    buckets: list[ProfitBucket]


class CreditDebitCustomerRow(StrictSchema):
    customer_id: str
    customer_name: str
    customer_phone: str
    credit_balance: float
    total_credit_given: float
    total_debit_recorded: float
    last_transaction_date: str | None = None

class CreditDebitTransactionRow(StrictSchema):
    id: str
    created_at: str
    customer_id: str
    customer_name: str
    customer_phone: str
    entry_type: str
    amount: float
    balance_after: float
    note: str | None = None
    order_id: str | None = None
    order_basket_number: str | None = None
    staff_name: str | None = None

class CreditDebitSummary(StrictSchema):
    total_outstanding_credit: float
    total_outstanding_debit: float
    customers_with_credit: int
    customers_with_debit: int
    total_transactions: int

class CreditDebitReportResponse(BaseResponse):
    summary: CreditDebitSummary
    customers: list[CreditDebitCustomerRow]
    transactions: list[CreditDebitTransactionRow] = Field(default_factory=list)
    from_date: str
    to_date: str


class CustomerSpendOrder(StrictSchema):
    order_id: str
    basket_number: str
    created_at: str
    total_amount: float
    subtotal_amount: float | None = 0.0
    tax_amount: float | None = 0.0
    discount_value: float | None = 0.0
    payment_method: str | None = "CASH"
    status: str
    items_count: int = 0


class CustomerSpendReturn(StrictSchema):
    return_id: str
    return_number: str
    order_id: str | None = None
    order_basket_number: str | None = None
    created_at: str
    gross_return_amount: float
    total_refund_amount: float
    refund_payment_method: str = "CASH"
    notes: str | None = None
    returned_items: list[dict] = Field(default_factory=list)


class CustomerSpendRow(StrictSchema):
    customer_id: str | None = None
    customer_name: str
    customer_phone: str
    total_orders: int = 0
    total_spent: float = 0.0
    total_returns_count: int = 0
    total_returned_amount: float = 0.0
    net_spent: float = 0.0
    avg_order_value: float = 0.0
    credit_balance: float | None = 0.0
    loyalty_points: int | None = 0
    last_activity_date: str | None = None
    orders: list[CustomerSpendOrder] = Field(default_factory=list)
    returns: list[CustomerSpendReturn] = Field(default_factory=list)


class CustomerSpendsSummary(StrictSchema):
    total_customer_spends: float
    total_returns_amount: float
    net_customer_spends: float
    total_customers_count: int
    total_orders_count: int
    avg_spend_per_customer: float


class CustomerSpendsReportResponse(BaseResponse):
    summary: CustomerSpendsSummary
    customers: list[CustomerSpendRow] = Field(default_factory=list)
    from_date: str
    to_date: str




class CategorySalesItem(StrictSchema):
    category_id: str | None
    category_name: str
    items_sold: int
    quantity_sold: float
    revenue: float
    revenue_share_pct: float
    avg_item_price: float


class CategorySalesResponse(BaseResponse):
    from_date: str
    to_date: str
    total_revenue: float
    total_categories: int
    items: list[CategorySalesItem]


class ItemSalesRow(StrictSchema):
    menu_item_id: str | None
    item_name: str
    category_name: str | None
    quantity_sold: float
    revenue: float
    revenue_share_pct: float
    cogs: float = 0.0
    cost_per_unit: float | None = None
    estimated_profit: float | None = None
    margin_pct: float | None = None


class ItemSalesReconciliation(StrictSchema):
    gross_item_sales: float          # SUM(OrderItem.qty × unit_price) — catalog value
    item_returns: float              # SUM(OrderItem.returned_quantity × unit_price) — item-level
    net_item_sales: float            # gross_item_sales − item_returns
    bill_discounts: float            # Approved bill-level discounts
    loyalty_discounts: float         # Loyalty INR redeemed
    taxes_and_charges: float = 0.0
    delivery_and_handling_charges: float = 0.0
    extracted_gst_amount: float = 0.0
    taxable_bills_count: int = 0
    customer_returns: float          # SUM(CustomerReturn.gross_return_amount) - authoritative
    voided_customer_returns: float = 0.0 # Authoritative total of returns generated from voiding bills
    gross_billed_revenue: float = 0.0  # SUM(Order.total_amount) - authoritative billed total
    rounding_adjustment: float = 0.0   # gross_billed - (gross_items + delivery - discounts)
    net_billed_revenue: float          # gross_billed_revenue - customer_returns - voided_customer_returns



class ItemSalesResponse(BaseResponse):
    from_date: str
    to_date: str
    sort_by: str
    category_filter: str | None = None
    total_items: int
    total_units_sold: float = 0.0
    total_revenue: float = 0.0
    total_cogs: float = 0.0
    total_profit: float = 0.0
    overall_margin_pct: float = 0.0
    reconciliation_bridge: ItemSalesReconciliation | None = None
    items: list[ItemSalesRow]


class BillProfitRow(StrictSchema):
    order_id: str
    basket_number: str
    customer_name: str | None
    created_at: str
    payment_method: str | None
    subtotal_amount: float = 0.0
    discount_value: float = 0.0
    total_amount: float
    is_void: bool = False
    items_count: int = 0
    total_refunded_amount: float = 0.0
    refunded_amt: float = 0.0
    net_amount: float = 0.0
    estimated_cogs: float
    estimated_profit: float
    margin_pct: float


class BillProfitResponse(BaseResponse):
    from_date: str
    to_date: str
    total_bills: int
    total_revenue: float
    total_refunded_amount: float = 0.0
    total_cogs: float
    total_profit: float
    overall_margin_pct: float
    bills: list[BillProfitRow]


class AovBucket(StrictSchema):
    bucket: str
    avg_order_value: float
    orders_count: int


class AovByPaymentMethod(StrictSchema):
    payment_method: str
    avg_order_value: float
    orders_count: int
    total_revenue: float | None = None
    cash_amount: float | None = None
    upi_amount: float | None = None
    credit_amount: float | None = None
    debit_amount: float | None = None
    avg_cash: float | None = None
    avg_upi: float | None = None
    avg_credit: float | None = None
    avg_debit: float | None = None
    cash_share_pct: float | None = None
    upi_share_pct: float | None = None
    credit_share_pct: float | None = None
    debit_share_pct: float | None = None
    tenders_present: list[str] | None = None
    breakdown_description: str | None = None


class AovAnalyticsResponse(BaseResponse):
    from_date: str
    to_date: str
    overall_aov: float
    trend: list[AovBucket]
    by_payment_method: list[AovByPaymentMethod]


class StockIntakeRow(StrictSchema):
    intake_id: str
    item_name: str
    item_id: str
    supplier_name: str | None
    batch_number: str | None
    quantity: float
    unit_cost: float
    total_cost: float
    intake_date: str
    expiry_date: str | None


class StockIntakeReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_intakes: int
    total_quantity: float
    total_cost: float
    items: list[StockIntakeRow]


class WastageRow(StrictSchema):
    item_name: str
    item_id: str
    change_type: str
    reason: str | None = None
    notes: str | None = None
    quantity_wasted: float
    unit_cost: float | None
    wastage_cost: float
    created_at: str
    created_by_name: str | None


class WastageReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_wastage_entries: int
    total_quantity_wasted: float
    total_wastage_cost: float
    wastage_pct_of_intake: float
    total_audit_corrections: int = 0
    audit_correction_cost: float = 0.0
    items: list[WastageRow]


class StockMovementRow(StrictSchema):
    item_id: str
    item_name: str
    unit: str
    opening_stock: float
    intake_qty: float
    sales_deduction_qty: float
    manual_adjustment_qty: float
    restock_qty: float
    purchase_return_qty: float
    void_batch_qty: float
    closing_stock: float


class StockMovementResponse(BaseResponse):
    from_date: str
    to_date: str
    total_items: int
    items: list[StockMovementRow]


class PurchaseReturnRow(StrictSchema):
    return_id: str
    return_number: str
    item_name: str
    supplier_name: str
    batch_number: str | None
    quantity: float
    unit_cost: float
    total_refund_amount: float
    reason: str
    created_at: str


class PurchaseReturnReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_returns: int
    total_refund_amount: float
    items: list[PurchaseReturnRow]


class NewCustomerBucket(StrictSchema):
    bucket: str
    new_count: int
    cumulative_total: int


class NewCustomerDetail(StrictSchema):
    customer_id: str
    name: str | None
    phone: str | None
    email: str | None
    created_at: str
    total_orders: int
    total_spent: float


class NewCustomerReportResponse(BaseResponse):
    from_date: str
    to_date: str
    granularity: str
    total_new_customers: int
    total_customers_all_time: int
    trend: list[NewCustomerBucket]
    recent_customers: list[NewCustomerDetail] = []


class CustomerReturnRow(StrictSchema):
    return_id: str
    return_number: str
    order_id: str | None
    customer_name: str | None
    customer_phone: str | None
    items_returned: int
    gross_return_amount: float = 0.0
    total_exchange_amount: float = 0.0
    total_refund_amount: float
    refund_payment_method: str
    created_at: str
    is_void_return: bool = False


class TopReturnedItem(StrictSchema):
    item_name: str
    return_count: int
    total_quantity_returned: float
    total_refund_amount: float


class ReturnLedgerEntry(StrictSchema):
    return_number: str
    return_id: str
    order_id: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    item_name: str
    menu_item_id: str | None = None
    quantity: float
    selected_unit: str | None = None
    unit_price: float
    line_refund: float
    reason: str = ""
    created_at: str


class CustomerReturnReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_returns: int
    total_refund_amount: float
    return_rate_pct: float
    return_rate_value_pct: float = 0.0
    top_returned_items: list[TopReturnedItem]
    returns: list[CustomerReturnRow]
    return_ledger: list[ReturnLedgerEntry] = []


class DenominationBreakdown(StrictSchema):
    denomination: str
    notes_in: int
    notes_out: int
    net_notes: int
    net_value: float


class CashFlowByType(StrictSchema):
    transaction_type: str
    total_transactions: int
    denominations: list[DenominationBreakdown]


class CashDenominationResponse(BaseResponse):
    from_date: str
    to_date: str
    total_transactions: int
    net_cash_in_drawer: float
    by_transaction_type: list[CashFlowByType]
    overall_denominations: list[DenominationBreakdown]


class PaymentMixRow(StrictSchema):
    payment_method: str
    orders_count: int
    total_revenue: float
    gross_revenue: float = 0.0
    total_refunded: float = 0.0
    revenue_share_pct: float
    avg_order_value: float
    cash_amount: float | None = None
    upi_amount: float | None = None
    cash_share_pct: float | None = None
    upi_share_pct: float | None = None
    breakdown_description: str | None = None
    tender_type: str = "DIRECT"


class PaymentMixResponse(BaseResponse):
    from_date: str
    to_date: str
    total_orders: int
    total_revenue: float
    gross_revenue: float = 0.0
    total_refunded: float = 0.0
    methods: list[PaymentMixRow]


class TaxSlabRow(StrictSchema):
    tax_category: str
    tax_rate: float
    taxable_amount: float
    tax_collected: float
    items_count: int


class TaxSummaryResponse(BaseResponse):
    from_date: str
    to_date: str
    total_taxable_amount: float
    total_tax_collected: float
    slabs: list[TaxSlabRow]


class TaxableBillRow(StrictSchema):
    order_id: str
    basket_number: str
    created_at: str
    customer_name: str | None = None
    customer_phone: str | None = None
    payment_method: str | None = None
    total_amount: float
    taxable_amount: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_gst_amount: float
    items_count: int


class TaxableBillsResponse(BaseResponse):
    from_date: str
    to_date: str
    taxable_bills_count: int
    taxable_bills_turnover: float
    taxable_base_value: float
    total_gst_collected: float
    total_cgst: float
    total_sgst: float
    total_igst: float
    avg_gst_per_taxable_bill: float
    zero_gst_bills_count: int
    zero_gst_bills_turnover: float
    total_bills: int
    bills: list[TaxableBillRow]


class ServiceChargeBillRow(BaseResponse):
    order_id: str
    basket_number: str
    invoice_no: str | None = None
    created_at: str
    customer_name: str | None = None
    customer_phone: str | None = None
    payment_method: str | None = None
    items_count: int = 0
    subtotal_amount: float = 0.0
    delivery_charge: float = 0.0
    handling_charge: float = 0.0
    total_charges: float = 0.0
    discount_amount: float = 0.0
    total_amount: float = 0.0


class ServiceChargesSummaryResponse(BaseResponse):
    from_date: str
    to_date: str
    bills_with_charges_count: int
    bills_with_charges_turnover: float
    bills_with_charges_subtotal: float
    total_delivery_charges: float
    total_handling_charges: float
    total_combined_charges: float
    handling_only_count: int
    delivery_only_count: int
    both_charges_count: int
    zero_charges_count: int
    zero_charges_turnover: float
    total_bills: int
    bills: list[ServiceChargeBillRow]


class Gstr1HsnItem(BaseResponse):
    hsn_code: str
    description: str
    uqc: str
    total_quantity: float
    total_value: float
    taxable_value: float
    tax_rate: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    cess_amount: float = 0.0


class Gstr1HsnSummaryResponse(BaseResponse):
    from_date: str
    to_date: str
    total_value: float
    total_taxable_value: float
    total_cgst: float
    total_sgst: float
    total_igst: float
    items: list[Gstr1HsnItem]


class DiscountSummary(StrictSchema):
    total_orders_with_discount: int
    total_discount_amount: float
    avg_discount_per_order: float
    discount_pct_of_revenue: float


class DiscountByType(StrictSchema):
    discount_type: str
    count: int
    total_amount: float


class DiscountApprovalStats(StrictSchema):
    total_requests: int
    approved: int
    rejected: int
    pending: int
    approval_rate_pct: float


class TopDiscountReason(StrictSchema):
    reason: str
    count: int
    total_amount: float


class DiscountedBillDetail(StrictSchema):
    order_id: str
    bill_number: str
    created_at: str
    subtotal: float
    total_amount: float
    discount_type: str | None = None
    discount_value: float = 0.0
    discount_amount: float = 0.0
    discount_reason: str | None = None
    discount_status: str | None = None
    cashier_name: str | None = None
    cashier_id: str | None = None
    approved_by_name: str | None = None
    payment_method: str | None = None


class DiscountReportResponse(BaseResponse):
    from_date: str
    to_date: str
    summary: DiscountSummary
    by_type: list[DiscountByType]
    approval_stats: DiscountApprovalStats
    top_reasons: list[TopDiscountReason]
    total_complimentary_items: int
    total_complimentary_value: float
    discounted_bills: list[DiscountedBillDetail] = Field(default_factory=list)


class DayBookEntry(StrictSchema):
    timestamp: str
    entry_type: str
    reference_number: str
    description: str
    debit: float
    credit: float
    running_balance: float
    entity_name: str | None = None
    entity_phone: str | None = None
    entity_type: str | None = None


class DayBookResponse(BaseResponse):
    date: str
    opening_cash: float
    cash_sales: float = 0.0
    cash_refunds: float = 0.0
    closing_cash: float = 0.0
    total_sales: float
    total_returns: float
    total_cash_in: float
    total_cash_out: float
    total_stock_intake_cost: float
    total_purchase_returns: float = 0.0
    closing_balance: float
    entries: list[DayBookEntry]


class AbandonedCartStatsResponse(BaseResponse):
    from_date: str
    to_date: str
    total_abandoned: int
    total_converted: int
    conversion_rate_pct: float
    total_abandoned_value: float
    total_converted_value: float
    avg_cart_value: float


class LoyaltyReportResponse(BaseResponse):
    from_date: str
    to_date: str
    total_points_earned: int
    total_points_redeemed: int
    net_outstanding_points: int
    total_customers_with_points: int
    avg_points_per_customer: float
    redemption_rate_pct: float



class SupplierBatchRow(StrictSchema):
    intake_id: str
    batch_number: str | None = None
    item_id: str
    item_name: str
    intake_date: str
    expiry_date: str | None = None
    quantity: float
    remaining_quantity: float
    unit_cost: float
    total_cost: float


class SupplierSpendRow(StrictSchema):
    supplier_id: str | None
    supplier_name: str
    total_intakes: int
    total_quantity: float
    total_spend: float
    avg_unit_cost: float
    share_pct: float
    batches: list[SupplierBatchRow] = Field(default_factory=list)


class SupplierSpendResponse(BaseResponse):
    from_date: str
    to_date: str
    total_spend: float
    total_suppliers: int
    suppliers: list[SupplierSpendRow]


class OutletEarningsResponse(StrictSchema):
    gross_revenue: float
    total_customer_returns: float
    total_voided_returns: float = 0.0
    total_loyalty_discounts: float
    total_credit_applied: float
    total_udhaar_given: float
    total_udhaar_recovered: float
    total_credit_cashed_out: float
    total_credit_awarded: float
    net_drawer_earnings: float
    chart_data: list[dict[str, Any]]


class InventoryReconciliationBridge(StrictSchema):
    gross_inward_spend: float
    purchase_returns: float
    net_supplier_spend: float
    wastage_cost: float
    manual_adjustments: float
    effective_inward_stock: float
    cost_of_goods_sold: float
    current_holding_value: float
    opening_stock_value: float = 0.0
    closing_stock_value: float = 0.0
    sold_inventory_revenue: float
    customer_discounts: float = 0.0
    net_sold_revenue: float = 0.0
    gross_merchandise_margin: float
    realized_net_profit: float
    total_economic_value: float


class InventorySummaryReportResponse(BaseResponse):
    from_date: str
    to_date: str
    gross_inward_spend: float
    purchase_returns: float
    net_supplier_spend: float
    wastage_cost: float
    manual_adjustments: float
    effective_inward_stock: float
    cost_of_goods_sold: float
    current_holding_value: float
    opening_stock_value: float = 0.0
    closing_stock_value: float = 0.0
    sold_inventory_revenue: float
    customer_discounts: float = 0.0
    net_sold_revenue: float = 0.0
    gross_merchandise_margin: float
    realized_net_profit: float
    total_economic_value: float
    reconciliation_bridge: InventoryReconciliationBridge

