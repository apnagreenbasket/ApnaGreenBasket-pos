import { useCallback, useState } from "react";
import type {
  AnalyticsKpiSummary,
  RevenueAnalytics,
  PeakHoursAnalytics,
  TopItemsAnalytics,
  FunnelAnalytics,
  ProfitMarginAnalytics,
  CategorySalesResponse,
  ItemSalesResponse,
  BillProfitResponse,
  ProfitMarginResponse,
  AovAnalyticsResponse,
  StockIntakeReportResponse,
  WastageReportResponse,
  StockMovementResponse,
  PurchaseReturnReportResponse,
  NewCustomerReportResponse,
  CustomerReturnReportResponse,

  CashDenominationResponse,
  PaymentMixResponse,
  TaxSummaryResponse,
  DiscountReportResponse,
  DayBookResponse,
  AbandonedCartStatsResponse,
  LoyaltyReportResponse,
  CreditDebitReportResponse,
  CustomerSpendsReportResponse,
  OutletEarningsResponse,
  SupplierSpendResponse,
  InventorySummaryReportResponse,
  AnalyticsMainTab,
  SalesSubTab,
  InventorySubTab,
  CustomersSubTab,
  FinancialSubTab,
  DatePreset
} from "@/types";
import { formatLocalDate } from "@/lib/api";

type UseAnalyticsManagementProps = {
  accessToken: string | null;
  authHeaders: Record<string, string> | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
};

export function useAnalyticsManagement({
  accessToken,
  authHeaders,
  apiRequest,
}: UseAnalyticsManagementProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AnalyticsMainTab>("dashboard");
  const [activeSalesSubTab, setActiveSalesSubTab] = useState<SalesSubTab>("category");
  const [activeInventorySubTab, setActiveInventorySubTab] = useState<InventorySubTab>("stock_movement");
  const [activeCustomersSubTab, setActiveCustomersSubTab] = useState<CustomersSubTab>("new_customers");
  const [activeFinancialSubTab, setActiveFinancialSubTab] = useState<FinancialSubTab>("profit_margin");

  // Filter State
  const [datePreset, setDatePreset] = useState<DatePreset>("last_30");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [granularity, setGranularity] = useState<"hourly" | "daily" | "weekly" | "monthly">("daily");
  
  // Specific filters
  const [topItemsSortBy, setTopItemsSortBy] = useState<"quantity" | "revenue">("revenue");
  const [itemSalesCategoryId, setItemSalesCategoryId] = useState<string>("");
  const [billProfitPage, setBillProfitPage] = useState<number>(1);
  const [dayBookDate, setDayBookDate] = useState<string>(formatLocalDate());

  // Loading States
  const [isLoading, setIsLoading] = useState(false);

  // Data States
  const [kpiData, setKpiData] = useState<AnalyticsKpiSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueAnalytics | null>(null);
  const [peakHoursData, setPeakHoursData] = useState<PeakHoursAnalytics | null>(null);
  const [topItemsData, setTopItemsData] = useState<TopItemsAnalytics | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelAnalytics | null>(null);
  const [profitData, setProfitData] = useState<ProfitMarginAnalytics | null>(null);
  
  const [categorySalesData, setCategorySalesData] = useState<CategorySalesResponse | null>(null);
  const [itemSalesData, setItemSalesData] = useState<ItemSalesResponse | null>(null);
  const [billProfitData, setBillProfitData] = useState<BillProfitResponse | null>(null);
  const [aovData, setAovData] = useState<AovAnalyticsResponse | null>(null);
  const [stockIntakeData, setStockIntakeData] = useState<StockIntakeReportResponse | null>(null);
  const [inventorySummaryData, setInventorySummaryData] = useState<InventorySummaryReportResponse | null>(null);
  const [wastageData, setWastageData] = useState<WastageReportResponse | null>(null);
  const [stockMovementData, setStockMovementData] = useState<StockMovementResponse | null>(null);
  const [purchaseReturnData, setPurchaseReturnData] = useState<PurchaseReturnReportResponse | null>(null);
  const [newCustomerData, setNewCustomerData] = useState<NewCustomerReportResponse | null>(null);
  const [customerReturnData, setCustomerReturnData] = useState<CustomerReturnReportResponse | null>(null);
  const [cashDenomData, setCashDenomData] = useState<CashDenominationResponse | null>(null);
  const [paymentMixData, setPaymentMixData] = useState<PaymentMixResponse | null>(null);
  const [taxSummaryData, setTaxSummaryData] = useState<TaxSummaryResponse | null>(null);
  const [gstr1HsnData, setGstr1HsnData] = useState<import("@/types").Gstr1HsnSummaryResponse | null>(null);
  const [discountData, setDiscountData] = useState<DiscountReportResponse | null>(null);
  const [dayBookData, setDayBookData] = useState<DayBookResponse | null>(null);
  const [abandonedCartData, setAbandonedCartData] = useState<AbandonedCartStatsResponse | null>(null);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyReportResponse | null>(null);
  const [supplierSpendData, setSupplierSpendData] = useState<SupplierSpendResponse | null>(null);
  const [creditDebitData, setCreditDebitData] = useState<CreditDebitReportResponse | null>(null);
  const [customerSpendsData, setCustomerSpendsData] = useState<CustomerSpendsReportResponse | null>(null);
  const [outletEarningsData, setOutletEarningsData] = useState<OutletEarningsResponse | null>(null);

  const getDateRangeParams = useCallback(() => {
    let fromStr = "";
    let toStr = "";
    const now = new Date();
    
    if (datePreset === "today") {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      fromStr = from.toISOString();
      toStr = to.toISOString();
    } else if (datePreset === "yesterday") {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      fromStr = from.toISOString();
      toStr = to.toISOString();
    } else if (datePreset === "last_7") {
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      fromStr = from.toISOString();
      toStr = now.toISOString();
    } else if (datePreset === "last_30") {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      fromStr = from.toISOString();
      toStr = now.toISOString();
    } else if (datePreset === "this_month") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      fromStr = from.toISOString();
      toStr = now.toISOString();
    } else if (datePreset === "last_month") {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      fromStr = from.toISOString();
      toStr = to.toISOString();
    } else if (datePreset === "custom" && customFromDate && customToDate) {
      const [fYear, fMonth, fDay] = customFromDate.split('-').map(Number);
      fromStr = new Date(fYear, fMonth - 1, fDay).toISOString();
      
      const [tYear, tMonth, tDay] = customToDate.split('-').map(Number);
      toStr = new Date(tYear, tMonth - 1, tDay, 23, 59, 59, 999).toISOString();
    }

    const params = new URLSearchParams();
    if (fromStr) params.append("from_date", fromStr);
    if (toStr) params.append("to_date", toStr);
    return params;
  }, [datePreset, customFromDate, customToDate]);

  // Load Dashboard Data
  const loadDashboardData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      const params = getDateRangeParams();
      const [kpiRes, revRes, peakRes, topRes, funnelRes] = await Promise.allSettled([
        apiRequest<AnalyticsKpiSummary>(`/api/analytics/kpi-summary?${params.toString()}`),
        apiRequest<RevenueAnalytics>(`/api/analytics/revenue?granularity=${granularity}&${params.toString()}`),
        apiRequest<PeakHoursAnalytics>(`/api/analytics/peak-hours?${params.toString()}`),
        apiRequest<TopItemsAnalytics>(`/api/analytics/top-items?sort_by=revenue&limit=5&${params.toString()}`),
        apiRequest<FunnelAnalytics>(`/api/analytics/funnel?${params.toString()}`),
      ]);

      if (kpiRes.status === "fulfilled") setKpiData(kpiRes.value);
      else console.error("Dashboard KPI summary load error:", kpiRes.reason);

      if (revRes.status === "fulfilled") setRevenueData(revRes.value);
      else console.error("Dashboard revenue load error:", revRes.reason);

      if (peakRes.status === "fulfilled") setPeakHoursData(peakRes.value);
      else console.error("Dashboard peak hours load error:", peakRes.reason);

      if (topRes.status === "fulfilled") setTopItemsData(topRes.value);
      else console.error("Dashboard top items load error:", topRes.reason);

      if (funnelRes.status === "fulfilled") setFunnelData(funnelRes.value);
      else console.error("Dashboard funnel load error:", funnelRes.reason);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, getDateRangeParams, granularity]);

  // Load Sales Data
  const loadSalesData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      const params = getDateRangeParams();
      if (activeSalesSubTab === "master_view") {
        const catFilter = itemSalesCategoryId ? `&category_id=${itemSalesCategoryId}` : "";
        const [cat, item, aov, pay, disc] = await Promise.allSettled([
          apiRequest<CategorySalesResponse>(`/api/analytics/category-sales?${params.toString()}`),
          apiRequest<ItemSalesResponse>(`/api/analytics/item-sales?sort_by=${topItemsSortBy}&limit=1000${catFilter}&${params.toString()}`),
          apiRequest<AovAnalyticsResponse>(`/api/analytics/aov?granularity=${granularity}&${params.toString()}`),
          apiRequest<PaymentMixResponse>(`/api/analytics/payment-mix?${params.toString()}`),
          apiRequest<DiscountReportResponse>(`/api/analytics/discount-report?${params.toString()}`)
        ]);
        if (cat.status === "fulfilled") setCategorySalesData(cat.value);
        if (item.status === "fulfilled") setItemSalesData(item.value);
        if (aov.status === "fulfilled") setAovData(aov.value);
        if (pay.status === "fulfilled") setPaymentMixData(pay.value);
        if (disc.status === "fulfilled") setDiscountData(disc.value);
      } else if (activeSalesSubTab === "summary") {
        setItemSalesData(await apiRequest<ItemSalesResponse>(`/api/analytics/item-sales?sort_by=${topItemsSortBy}&limit=1000&${params.toString()}`));
      } else if (activeSalesSubTab === "category") {
        setCategorySalesData(await apiRequest<CategorySalesResponse>(`/api/analytics/category-sales?${params.toString()}`));
      } else if (activeSalesSubTab === "item") {
        const catFilter = itemSalesCategoryId ? `&category_id=${itemSalesCategoryId}` : "";
        const [itemRes, catRes] = await Promise.allSettled([
          apiRequest<ItemSalesResponse>(`/api/analytics/item-sales?sort_by=${topItemsSortBy}&limit=1000${catFilter}&${params.toString()}`),
          apiRequest<CategorySalesResponse>(`/api/analytics/category-sales?${params.toString()}`),
        ]);
        if (itemRes.status === "fulfilled") setItemSalesData(itemRes.value);
        if (catRes.status === "fulfilled") setCategorySalesData(catRes.value);
      } else if (activeSalesSubTab === "aov") {
        setAovData(await apiRequest<AovAnalyticsResponse>(`/api/analytics/aov?granularity=${granularity}&${params.toString()}`));
      } else if (activeSalesSubTab === "payment_mix") {
        setPaymentMixData(await apiRequest<PaymentMixResponse>(`/api/analytics/payment-mix?${params.toString()}`));
      } else if (activeSalesSubTab === "discount") {
        setDiscountData(await apiRequest<DiscountReportResponse>(`/api/analytics/discount-report?${params.toString()}`));
      }
    } catch (err) {
      console.error("Sales data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, getDateRangeParams, activeSalesSubTab, topItemsSortBy, itemSalesCategoryId, granularity]);

  // Load Inventory Data
  const loadInventoryData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      const params = getDateRangeParams();
      if (activeInventorySubTab === "master_view") {
        const [sum, mov, in_, was, ret, sup] = await Promise.allSettled([
          apiRequest<InventorySummaryReportResponse>(`/api/analytics/inventory-summary?${params.toString()}`),
          apiRequest<StockMovementResponse>(`/api/analytics/stock-movement?${params.toString()}`),
          apiRequest<StockIntakeReportResponse>(`/api/analytics/stock-intake?${params.toString()}`),
          apiRequest<WastageReportResponse>(`/api/analytics/wastage?${params.toString()}`),
          apiRequest<PurchaseReturnReportResponse>(`/api/analytics/purchase-returns?${params.toString()}`),
          apiRequest<SupplierSpendResponse>(`/api/analytics/supplier-spend?${params.toString()}`)
        ]);
        if (sum.status === "fulfilled") setInventorySummaryData(sum.value);
        if (mov.status === "fulfilled") setStockMovementData(mov.value);
        if (in_.status === "fulfilled") setStockIntakeData(in_.value);
        if (was.status === "fulfilled") setWastageData(was.value);
        if (ret.status === "fulfilled") setPurchaseReturnData(ret.value);
        if (sup.status === "fulfilled") setSupplierSpendData(sup.value);
      } else if (activeInventorySubTab === "summary") {
        setInventorySummaryData(await apiRequest<InventorySummaryReportResponse>(`/api/analytics/inventory-summary?${params.toString()}`));
      } else if (activeInventorySubTab === "stock_movement") {
        setStockMovementData(await apiRequest<StockMovementResponse>(`/api/analytics/stock-movement?${params.toString()}`));
      } else if (activeInventorySubTab === "intake") {
        setStockIntakeData(await apiRequest<StockIntakeReportResponse>(`/api/analytics/stock-intake?${params.toString()}`));
      } else if (activeInventorySubTab === "wastage") {
        setWastageData(await apiRequest<WastageReportResponse>(`/api/analytics/wastage?${params.toString()}`));
      } else if (activeInventorySubTab === "purchase_returns") {
        setPurchaseReturnData(await apiRequest<PurchaseReturnReportResponse>(`/api/analytics/purchase-returns?${params.toString()}`));
      } else if (activeInventorySubTab === "supplier_spend") {
        setSupplierSpendData(await apiRequest<SupplierSpendResponse>(`/api/analytics/supplier-spend?${params.toString()}`));
      }
    } catch (err) {
      console.error("Inventory data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, getDateRangeParams, activeInventorySubTab]);

  // Load Customers Data
  const loadCustomersData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      const params = getDateRangeParams();
      const safeFrom = params.get("from_date") || "";
      const safeTo = params.get("to_date") || "";

      if (activeCustomersSubTab === "master_view") {
        const [newC, ret, loy, ab, cd, cs] = await Promise.allSettled([
          apiRequest<any>(`/api/analytics/new-customers?${params.toString()}`),
          apiRequest<CustomerReturnReportResponse>(`/api/analytics/customer-returns?${params.toString()}`),
          apiRequest<LoyaltyReportResponse>(`/api/analytics/loyalty?${params.toString()}`),
          apiRequest<AbandonedCartStatsResponse>(`/api/analytics/abandoned-carts?${params.toString()}`),
          apiRequest<CreditDebitReportResponse>(`/api/analytics/credit-debit-report?${params.toString()}`),
          apiRequest<CustomerSpendsReportResponse>(`/api/analytics/customer-spends?${params.toString()}`)
        ]);
        if (newC.status === "fulfilled") setNewCustomerData(newC.value);
        if (ret.status === "fulfilled") setCustomerReturnData(ret.value);
        if (loy.status === "fulfilled") setLoyaltyData(loy.value);
        if (ab.status === "fulfilled") setAbandonedCartData(ab.value);
        if (cd.status === "fulfilled") setCreditDebitData(cd.value);
        if (cs.status === "fulfilled") setCustomerSpendsData(cs.value);
      } else if (activeCustomersSubTab === "customer_spends") {
        const res = await apiRequest<CustomerSpendsReportResponse>(
          `/api/analytics/customer-spends?${params.toString()}`
        );
        setCustomerSpendsData(res);
      } else if (activeCustomersSubTab === "new_customers") {
        setNewCustomerData(await apiRequest<any>(`/api/analytics/new-customers?${params.toString()}`));
      } else if (activeCustomersSubTab === "returns") {
        setCustomerReturnData(await apiRequest<CustomerReturnReportResponse>(`/api/analytics/customer-returns?${params.toString()}`));
      } else if (activeCustomersSubTab === "loyalty") {
        setLoyaltyData(await apiRequest<LoyaltyReportResponse>(`/api/analytics/loyalty?${params.toString()}`));
      } else if (activeCustomersSubTab === "abandoned_carts") {
        const res = await apiRequest<AbandonedCartStatsResponse>(
          `/api/analytics/abandoned-carts?from_date=${safeFrom}&to_date=${safeTo}`
        );
        setAbandonedCartData(res);
      } else if (activeCustomersSubTab === "credit_debit") {
        const res = await apiRequest<CreditDebitReportResponse>(
          `/api/analytics/credit-debit-report?from_date=${safeFrom}&to_date=${safeTo}`
        );
        setCreditDebitData(res);
      }
    } catch (err) {
      console.error("Customers data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, getDateRangeParams, activeCustomersSubTab, granularity]);

  // Load Financial Data
  const loadFinancialData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      const params = getDateRangeParams();
      if (activeFinancialSubTab === "master_view" || activeFinancialSubTab === "profit_margin") {
        const res = await apiRequest<ProfitMarginAnalytics>(`/api/analytics/profit?${params}`);
        setProfitData(res);
      }
      if (activeFinancialSubTab === "master_view" || activeFinancialSubTab === "bill_profit") {
        const res = await apiRequest<BillProfitResponse>(`/api/analytics/bill-profit?page=${billProfitPage}&limit=15&${params.toString()}`);
        setBillProfitData(res);
      }
      if (activeFinancialSubTab === "master_view" || activeFinancialSubTab === "tax_summary") {
        const [res, hsnRes] = await Promise.all([
          apiRequest<TaxSummaryResponse>(`/api/analytics/tax-summary?${params}`),
          apiRequest<import("@/types").Gstr1HsnSummaryResponse>(`/api/analytics/gstr1-hsn-summary?${params}`).catch(() => null),
        ]);
        setTaxSummaryData(res);
        setGstr1HsnData(hsnRes);
      }
      if (activeFinancialSubTab === "master_view" || activeFinancialSubTab === "cash_denominations") {
        const res = await apiRequest<CashDenominationResponse>(`/api/analytics/cash-denominations?${params}`);
        setCashDenomData(res);
      }
      if (activeFinancialSubTab === "master_view" || activeFinancialSubTab === "outlet_earnings") {
        const res = await apiRequest<OutletEarningsResponse>(`/api/analytics/outlet-earnings?${params}`);
        setOutletEarningsData(res);
      }
    } catch (err) {
      console.error("Financial data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, getDateRangeParams, activeFinancialSubTab, granularity, billProfitPage]);

  // Load Day Book Data
  const loadDayBookData = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoading(true);
    try {
      setDayBookData(await apiRequest<DayBookResponse>(`/api/analytics/day-book?date=${dayBookDate}`));
    } catch (err) {
      console.error("Day Book data load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, authHeaders, dayBookDate]);

  // Master Loader
  const loadActiveTabData = useCallback(() => {
    if (activeTab === "dashboard") loadDashboardData();
    else if (activeTab === "sales") loadSalesData();
    else if (activeTab === "inventory") loadInventoryData();
    else if (activeTab === "customers") loadCustomersData();
    else if (activeTab === "financial") loadFinancialData();
    else if (activeTab === "day_book") loadDayBookData();
  }, [
    activeTab,
    loadDashboardData,
    loadSalesData,
    loadInventoryData,
    loadCustomersData,
    loadFinancialData,
    loadDayBookData
  ]);

  return {
    activeTab, setActiveTab,
    activeSalesSubTab, setActiveSalesSubTab,
    activeInventorySubTab, setActiveInventorySubTab,
    activeCustomersSubTab, setActiveCustomersSubTab,
    activeFinancialSubTab, setActiveFinancialSubTab,
    datePreset, setDatePreset,
    customFromDate, setCustomFromDate,
    customToDate, setCustomToDate,
    granularity, setGranularity,
    topItemsSortBy, setTopItemsSortBy,
    itemSalesCategoryId, setItemSalesCategoryId,
    billProfitPage, setBillProfitPage,
    dayBookDate, setDayBookDate,
    
    isLoading,
    loadActiveTabData,
    
    // Dashboard
    kpiData, revenueData, peakHoursData, topItemsData, funnelData,
    // Sales
    categorySalesData, itemSalesData, aovData, paymentMixData, discountData,
    // Inventory
    inventorySummaryData, setInventorySummaryData,
    stockMovementData, stockIntakeData, wastageData, purchaseReturnData, supplierSpendData,
    // Customers
    newCustomerData,
    customerReturnData,
    loyaltyData,
    abandonedCartData,
    creditDebitData,
    customerSpendsData,
    setCustomerSpendsData,
    // Financial
    profitData, 
    billProfitData, 
    taxSummaryData, 
    gstr1HsnData,
    cashDenomData,
    outletEarningsData,
    // Day Book
    dayBookData,
  };
}
