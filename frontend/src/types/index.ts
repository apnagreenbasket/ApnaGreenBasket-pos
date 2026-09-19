import { components } from "./schema";


export type PaymentMode = "RAZORPAY_GATEWAY" | "PAY_AT_COUNTER" | "BOTH";

export type OrderStatus =
  | "PENDING"
  | "PENDING_VERIFICATION"
  | "PAID"
  | "PAYMENT_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type Variant = components["schemas"]["VariantResponse"];

export interface ItemBatchSummary {
  id: string;
  batch_number: string;
  remaining_quantity: number | string;
  unit_cost: number | string;
  retail_price?: number | string | null;
  mrp?: number | string | null;
  wholesale_price?: number | string | null;
  expiry_date?: string | null;
  intake_date: string;
  is_oldest: boolean;
}

export type MenuItem = components["schemas"]["MenuItemResponse"] & {
  active_batches?: ItemBatchSummary[];
  current_stock?: number | string | null;
  allow_oversell?: boolean;
  is_out_of_stock?: boolean;
  hsn_code?: string | null;
};

export type Category = components["schemas"]["CategoryResponse"] & {
  items?: MenuItem[];
};

export type OutletInfoResponse = components["schemas"]["OutletInfoResponse"];

export type Outlet = OutletInfoResponse;
export type PricingMode = components["schemas"]["PricingModeEnum"];

export interface PublicMenuResponse {
  outlet_name: string;
  outlet_slug: string;
  payment_mode: PaymentMode;
  logo_url?: string | null;
  evening_price_active?: boolean;
  categories: Category[];
}

export interface CartItem {
  cartItemId: string; // unique ID for item + variant combo
  menuItem: MenuItem;
  selectedVariant?: Variant | null;
  selectedUnit?: string | null; // e.g. "box"
  quantity: number;
  unitPrice: number; // base price + variant delta, or custom overriden price
}

export type OrderItemResponse = components["schemas"]["OrderItemResponse"];

export type OrderResponse = components["schemas"]["OrderResponse"] & {
  cash_amount?: number | null;
  upi_amount?: number | null;
};

export interface RazorpayCheckoutResponse {
  order_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export interface UPICheckoutResponse {
  order_id: string;
  upi_deep_link: string;
  total_amount: string;
}

// ── Session types ───────────────────────────────────────────────────────

export type SessionStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "TERMINATED";

export type StartSessionResponse = components["schemas"]["StartSessionResponse"];

export type SessionStatusResponse = components["schemas"]["SessionStatusResponse"];

export type ExtendSessionResponse = components["schemas"]["ExtendSessionResponse"];

export interface AbandonCartItem {
  menu_item_id: string;
  variant_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  pricing_mode?: string | null;
  unit_label?: string | null;
}

export type AbandonedCart = components["schemas"]["AbandonedCartResponse"];

export type ActiveSession = components["schemas"]["ActiveSessionResponse"];

export type CustomerHistoryResponse = components["schemas"]["CustomerHistoryResponse"];

// ── Inventory types ─────────────────────────────────────────────────────

export type InventoryUnit = string;
export type StockChangeType =
  | "INTAKE"
  | "AUTO_DEDUCTION"
  | "MANUAL_ADJUSTMENT"
  | "RESTOCK"
  | "PURCHASE_RETURN"
  | "VOID_BATCH"
  | "OVERSOLD"
  | "intake"
  | "auto_deduction"
  | "manual_adjustment"
  | "restock"
  | "purchase_return"
  | "void_batch"
  | "oversold";

export type WastageReason =
  | "SPOILED_EXPIRED"
  | "DAMAGED_TRANSIT"
  | "AUDIT_CORRECTION"
  | "THEFT_LOST"
  | "OTHER";

export type InventoryItem = components["schemas"]["InventoryItemResponse"] & {
  alternate_units?: Array<{ unit_label: string; conversion_factor: number }>;
  allow_oversell?: boolean;
  hsn_code?: string | null;
  latest_batch_date?: string | null;
};

export type Customer = components["schemas"]["CustomerResponse"] & {
  credit_balance?: number;
  gstin?: string | null;
  legal_name?: string | null;
  state_code?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export type StockIntake = components["schemas"]["StockIntakeResponse"];

export type BatchDetail = components["schemas"]["BatchDetailResponse"] & {
  shelf_life_alert_hrs?: number | null;
  supplier_id?: string | null;
  notes?: string | null;
  item_cost_per_unit?: number | string | null;
  item_retail_price?: number | string | null;
  item_mrp?: number | string | null;
  margin_type?: "MARKUP" | "MARGIN" | null;
  retail_margin_pct?: number | string | null;
  mrp_margin_pct?: number | string | null;
  retail_price?: number | string | null;
  mrp?: number | string | null;
  wholesale_price?: number | string | null;
  is_oldest?: boolean;
};

export interface PurchaseReturn {
  id: string;
  return_number: string;
  outlet_id: string;
  intake_id?: string | null;
  item_id: string;
  item_name?: string | null;
  supplier_name: string;
  batch_number?: string | null;
  quantity: number | string;
  unit_cost: number | string;
  total_refund_amount: number | string;
  reason: string;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export type ScanLookupResponse = components["schemas"]["ScanLookupResponse"];

export type BatchExpiryAlert = components["schemas"]["BatchExpiryAlertResponse"];

export type RecipeIngredient = components["schemas"]["RecipeIngredientResponse"];

export type StockLedgerEntry = components["schemas"]["StockLedgerResponse"] & {
  reason?: string | null;
  notes?: string | null;
};

export type StockLedgerPage = components["schemas"]["StockLedgerPageResponse"];

// ── Staff Management types ─────────────────────────────────────────────

export type StaffRole =
  | "SUPERADMIN"
  | "OUTLET_ADMIN"
  | "MANAGER"
  | "FLOOR_STAFF"
  | "CASHIER"
  | "WAITER"
  | "DELIVERY_BOY"
  | "STAFF";

export type StaffMember = components["schemas"]["StaffResponse"];

export type RolePermissions = components["schemas"]["RolePermissions"];

export type StaffAuditEntry = components["schemas"]["StaffAuditLogResponse"];

export type StaffAuditLogPage = components["schemas"]["StaffAuditLogPageResponse"];

// ── Analytics types ────────────────────────────────────────────────────

export type AnalyticsKpiSummary = components["schemas"]["KpiSummaryResponse"];

export type RevenueBucket = components["schemas"]["RevenueBucket"];

export type RevenueAnalytics = components["schemas"]["RevenueAnalyticsResponse"];

export type PeakHourBucket = components["schemas"]["PeakHourBucket"];

export interface PeakHoursAnalytics {
  from_date: string;
  to_date: string;
  buckets: PeakHourBucket[];
}

export interface TopItemAnalytics {
  menu_item_id?: string | null;
  name: string;
  category_name?: string | null;
  quantity_sold: number;
  revenue: number;
  revenue_share_pct: number;
}

export interface TopItemsAnalytics {
  from_date: string;
  to_date: string;
  sort_by: "quantity" | "revenue";
  items: TopItemAnalytics[];
}

export type FunnelStage = components["schemas"]["FunnelStage"];

export interface FunnelAnalytics {
  from_date: string;
  to_date: string;
  total_orders: number;
  stages: FunnelStage[];
  conversion_rate_pct: number;
  cancellation_rate_pct: number;
}

export type ProfitBucket = components["schemas"]["ProfitBucket"];

export interface ProfitMarginAnalytics {
  granularity: string;
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_cogs: number;
  total_profit: number;
  overall_margin_pct: number;
  buckets: ProfitBucket[];
}

// ── Billing & POS types ────────────────────────────────────────────────

export type ManualBillItem = components["schemas"]["BillItemResponse"] & {
  selected_batch_id?: string | null;
  selected_batch_number?: string | null;
  cost_price?: number | null;
  hsn_code?: string | null;
};

export type ManualBill = Omit<components["schemas"]["BillResponse"], "items"> & {
  items: ManualBillItem[];
  credit_applied?: number;
  debit_applied?: number;
  is_interstate?: boolean;
  place_of_supply?: string | null;
  customer_gstin?: string | null;
  customer_legal_name?: string | null;
  replaces_bill_id?: string | null;
};


export type DiscountApproval = components["schemas"]["DiscountApprovalResponse"];

export type StaffAddItemInput = components["schemas"]["StaffAddItemInput"];

export type StaffAddItemsResponse = components["schemas"]["StaffAddItemsResponse"];

export type Supplier = components["schemas"]["SupplierResponse"];

export type CategorySalesItem = components["schemas"]["CategorySalesItem"];
export type CategorySalesResponse = components["schemas"]["CategorySalesResponse"];

export interface ItemSalesReconciliation {
  gross_item_sales: number;
  item_returns: number;
  net_item_sales: number;
  bill_discounts: number;
  loyalty_discounts: number;
  taxes_and_charges: number;
  delivery_and_handling_charges?: number;
  extracted_gst_amount?: number;
  taxable_bills_count?: number;
  customer_returns: number;
  gross_billed_revenue?: number;
  rounding_adjustment?: number;
  net_billed_revenue: number;
}

export type ItemSalesRow = components["schemas"]["ItemSalesRow"];
export type ItemSalesResponse = components["schemas"]["ItemSalesResponse"] & {
  total_units_sold?: number;
  reconciliation_bridge?: ItemSalesReconciliation | null;
};

export type BillProfitRow = components["schemas"]["BillProfitRow"] & {
  total_refunded_amount?: number;
  refunded_amt?: number;
};
export type BillProfitResponse = Omit<components["schemas"]["BillProfitResponse"], "bills"> & {
  bills: BillProfitRow[];
};

export type AovBucket = components["schemas"]["AovBucket"];
export type AovByPaymentMethod = components["schemas"]["AovByPaymentMethod"] & {
  total_revenue?: number;
  cash_amount?: number | null;
  upi_amount?: number | null;
  credit_amount?: number | null;
  debit_amount?: number | null;
  avg_cash?: number | null;
  avg_upi?: number | null;
  avg_credit?: number | null;
  avg_debit?: number | null;
  cash_share_pct?: number | null;
  upi_share_pct?: number | null;
  credit_share_pct?: number | null;
  debit_share_pct?: number | null;
  tenders_present?: string[] | null;
  breakdown_description?: string | null;
};
export type AovAnalyticsResponse = Omit<components["schemas"]["AovAnalyticsResponse"], "by_payment_method"> & {
  by_payment_method: AovByPaymentMethod[];
};

export type StockIntakeRow = components["schemas"]["StockIntakeRow"];
export type StockIntakeReportResponse = components["schemas"]["StockIntakeReportResponse"];

export type WastageRow = components["schemas"]["WastageRow"] & {
  reason?: string | null;
  notes?: string | null;
};
export type WastageReportResponse = Omit<components["schemas"]["WastageReportResponse"], "items"> & {
  items: WastageRow[];
  total_audit_corrections?: number;
  audit_correction_cost?: number;
};

export type StockMovementRow = components["schemas"]["StockMovementRow"];
export type StockMovementResponse = components["schemas"]["StockMovementResponse"];

export type PurchaseReturnRow = components["schemas"]["PurchaseReturnRow"];
export type PurchaseReturnReportResponse = components["schemas"]["PurchaseReturnReportResponse"];

export interface InventoryReconciliationBridge {
  gross_inward_spend: number;
  purchase_returns: number;
  net_supplier_spend: number;
  wastage_cost: number;
  manual_adjustments: number;
  effective_inward_stock: number;
  cost_of_goods_sold: number;
  current_holding_value: number;
  opening_stock_value: number;
  closing_stock_value: number;
  sold_inventory_revenue: number;
  customer_discounts: number;
  net_sold_revenue: number;
  gross_merchandise_margin: number;
  realized_net_profit: number;
  total_economic_value: number;
}

export interface InventorySummaryReportResponse {
  from_date: string;
  to_date: string;
  gross_inward_spend: number;
  purchase_returns: number;
  net_supplier_spend: number;
  wastage_cost: number;
  manual_adjustments: number;
  effective_inward_stock: number;
  cost_of_goods_sold: number;
  current_holding_value: number;
  opening_stock_value: number;
  closing_stock_value: number;
  sold_inventory_revenue: number;
  customer_discounts: number;
  net_sold_revenue: number;
  gross_merchandise_margin: number;
  realized_net_profit: number;
  total_economic_value: number;
  reconciliation_bridge: InventoryReconciliationBridge;
}

export type NewCustomerBucket = components["schemas"]["NewCustomerBucket"];
export type NewCustomerReportResponse = components["schemas"]["NewCustomerReportResponse"];

export interface ReturnLedgerEntry {
  return_number: string;
  return_id: string;
  order_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  item_name: string;
  menu_item_id?: string | null;
  quantity: number;
  selected_unit?: string | null;
  unit_price: number;
  line_refund: number;
  reason: string;
  created_at: string;
}

export type CustomerReturnRow = components["schemas"]["CustomerReturnRow"];
export type TopReturnedItem = components["schemas"]["TopReturnedItem"];
export type CustomerReturnReportResponse = Omit<components["schemas"]["CustomerReturnReportResponse"], "return_ledger"> & {
  return_ledger?: ReturnLedgerEntry[];
};

export interface ItemReturnLedgerRow {
  id: string;
  return_id: string;
  return_number: string;
  return_date: string;
  order_id?: string | null;
  original_bill_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  item_name: string;
  menu_item_id?: string | null;
  category_name?: string | null;
  barcode?: string | null;
  quantity: number;
  selected_unit?: string | null;
  unit_price: number;
  mrp?: number | null;
  line_refund: number;
  tax_rate?: number | null;
  tax_category?: string | null;
  hsn_code?: string | null;
  reason: string;
  refund_payment_method: string;
  staff_name?: string | null;
  is_exchange?: boolean;
}

export interface ItemReturnLedgerSummary {
  total_line_items: number;
  total_quantity_returned: number;
  total_refund_amount: number;
  unique_bills_count: number;
}

export interface ItemReturnLedgerResponse {
  summary: ItemReturnLedgerSummary;
  items: ItemReturnLedgerRow[];
  total_count: number;
  page: number;
  page_size: number;
}

export type DenominationBreakdown = components["schemas"]["DenominationBreakdown"];
export type CashFlowByType = components["schemas"]["CashFlowByType"];
export type CashDenominationResponse = components["schemas"]["CashDenominationResponse"];

export type PaymentMixRow = components["schemas"]["PaymentMixRow"] & {
  cash_amount?: number | null;
  upi_amount?: number | null;
  cash_share_pct?: number | null;
  upi_share_pct?: number | null;
  breakdown_description?: string | null;
  tender_type?: string;
};
export type PaymentMixResponse = Omit<components["schemas"]["PaymentMixResponse"], "methods"> & {
  gross_revenue?: number;
  total_refunded?: number;
  methods: PaymentMixRow[];
};

export type TaxSlabRow = components["schemas"]["TaxSlabRow"];
export type TaxSummaryResponse = components["schemas"]["TaxSummaryResponse"];

export interface Gstr1HsnItem {
  hsn_code: string;
  description: string;
  uqc: string;
  total_quantity: number;
  total_value: number;
  taxable_value: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
}

export interface Gstr1HsnSummaryResponse {
  from_date: string;
  to_date: string;
  total_value: number;
  total_taxable_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  items: Gstr1HsnItem[];
}

export interface TaxableBillRow {
  order_id: string;
  basket_number: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  total_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst_amount: number;
  items_count: number;
}

export interface TaxableBillsResponse {
  from_date: string;
  to_date: string;
  taxable_bills_count: number;
  taxable_bills_turnover: number;
  taxable_base_value: number;
  total_gst_collected: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  avg_gst_per_taxable_bill: number;
  zero_gst_bills_count: number;
  zero_gst_bills_turnover: number;
  total_bills: number;
  bills: TaxableBillRow[];
}

export interface DiscountedBillDetail {
  order_id: string;
  bill_number: string;
  created_at: string;
  subtotal: number;
  total_amount: number;
  discount_type?: string | null;
  discount_value: number;
  discount_amount: number;
  discount_reason?: string | null;
  discount_status?: string | null;
  cashier_name?: string | null;
  cashier_id?: string | null;
  approved_by_name?: string | null;
  payment_method?: string | null;
}

export type DiscountSummary = components["schemas"]["DiscountSummary"];
export type DiscountByType = components["schemas"]["DiscountByType"];
export type DiscountApprovalStats = components["schemas"]["DiscountApprovalStats"];
export type TopDiscountReason = components["schemas"]["TopDiscountReason"];
export type DiscountReportResponse = components["schemas"]["DiscountReportResponse"] & {
  discounted_bills?: DiscountedBillDetail[];
};

export type DayBookEntry = components["schemas"]["DayBookEntry"];
export type DayBookResponse = components["schemas"]["DayBookResponse"] & {
  total_purchase_returns?: number;
  cash_sales?: number;
  cash_refunds?: number;
  closing_cash?: number;
};

export type AbandonedCartStatsResponse = components["schemas"]["AbandonedCartStatsResponse"];

export type LoyaltyReportResponse = components["schemas"]["LoyaltyReportResponse"];

export type SupplierBatchRow = {
  intake_id: string;
  batch_number?: string | null;
  item_id: string;
  item_name: string;
  intake_date: string;
  expiry_date?: string | null;
  quantity: number;
  remaining_quantity: number;
  unit_cost: number;
  total_cost: number;
};

export type SupplierSpendRow = components["schemas"]["SupplierSpendRow"] & {
  batches?: SupplierBatchRow[];
};
export type SupplierSpendResponse = Omit<components["schemas"]["SupplierSpendResponse"], "suppliers"> & {
  suppliers: SupplierSpendRow[];
};
export type OutletEarningsResponse = components["schemas"]["OutletEarningsResponse"] & {
  total_customer_returns?: number;
};

// Enums for UI
export type AnalyticsMainTab =
  | "dashboard"
  | "sales"
  | "inventory"
  | "customers"
  | "financial"
  | "day_book";

export type SalesSubTab =
  | "summary"
  | "master_view"
  | "category"
  | "item"
  | "aov"
  | "payment_mix"
  | "discount";

export type InventorySubTab =
  | "master_view"
  | "summary"
  | "stock_movement"
  | "intake"
  | "wastage"
  | "purchase_returns"
  | "supplier_spend";

export type CustomersSubTab =
  | "master_view"
  | "customer_spends"
  | "new_customers"
  | "returns"
  | "loyalty"
  | "abandoned_carts"
  | "credit_debit";


export type FinancialSubTab =
  | "master_view"
  | "profit_margin"
  | "bill_profit"
  | "tax_summary"
  | "cash_denominations"
  | "outlet_earnings";

export type DatePreset = "today" | "yesterday" | "last_7" | "last_30" | "this_month" | "last_month" | "custom";

export type BillingDateRangeMode =
  | "today"
  | "yesterday"
  | "last2days"
  | "week"
  | "last7"
  | "last_7"
  | "this_month"
  | "thisMonth"
  | "last30"
  | "last_30"
  | "custom";

export type ProfitMarginResponse = components["schemas"]["ProfitMarginResponse"];



export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  order_id: string | null;
  order_basket_number: string | null;
  entry_type: "CREDIT_APPLIED" | "DEBIT_APPLIED" | "CREDIT_ADDED" | "DEBIT_ADDED" | "DEBIT_SETTLED" | "CREDIT_CASHED_OUT" | string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface CreditDebitCustomerRow {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  credit_balance: number;
  total_credit_given: number;
  total_debit_recorded: number;
  last_transaction_date: string | null;
}

export interface CreditDebitSummary {
  total_outstanding_credit: number;
  total_outstanding_debit: number;
  customers_with_credit: number;
  customers_with_debit: number;
  total_transactions: number;
}

export interface CreditDebitTransactionRow {
  id: string;
  created_at: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  note?: string | null;
  order_id?: string | null;
  order_basket_number?: string | null;
  staff_name?: string | null;
}

export interface CreditDebitReportResponse {
  summary: CreditDebitSummary;
  customers: CreditDebitCustomerRow[];
  transactions?: CreditDebitTransactionRow[];
  from_date: string;
  to_date: string;
}

export interface CustomerSpendOrder {
  order_id: string;
  basket_number: string;
  created_at: string;
  total_amount: number;
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  discount_value?: number | null;
  payment_method?: string | null;
  status: string;
  items_count: number;
}

export interface CustomerSpendReturn {
  return_id: string;
  return_number: string;
  order_id?: string | null;
  order_basket_number?: string | null;
  created_at: string;
  gross_return_amount: number;
  total_refund_amount: number;
  refund_payment_method: string;
  notes?: string | null;
  returned_items?: any[];
}

export interface CustomerSpendRow {
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  total_orders: number;
  total_spent: number;
  total_returns_count: number;
  total_returned_amount: number;
  net_spent: number;
  avg_order_value: number;
  credit_balance?: number | null;
  loyalty_points?: number | null;
  last_activity_date?: string | null;
  orders: CustomerSpendOrder[];
  returns: CustomerSpendReturn[];
}

export interface CustomerSpendsSummary {
  total_customer_spends: number;
  total_returns_amount: number;
  net_customer_spends: number;
  total_customers_count: number;
  total_orders_count: number;
  avg_spend_per_customer: number;
}

export interface CustomerSpendsReportResponse {
  summary: CustomerSpendsSummary;
  customers: CustomerSpendRow[];
  from_date: string;
  to_date: string;
}


