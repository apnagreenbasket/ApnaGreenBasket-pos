import React from "react";
import { 
  TrendingUp, Calendar, Download, FileText, LayoutDashboard, ShoppingBag, 
  Package, Users, DollarSign, BookOpen 
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { 
  generateAnalyticsPdfReport, 
  generateSalesPdfReport, 
  generateCategoryWiseSalesPdfReport,
  generateFlatItemSalesPdfReport,
  generateInventoryPdfReport, 
  generateCustomersPdfReport, 
  generateFinancialPdfReport, 
  generateDayBookPdfReport 
} from "@/lib/pdfGenerator";
import type { RestaurantProfile } from "../adminTypes";

// UI Components
import { DashboardReport } from "./analytics/DashboardReport";
import { CategorySalesReport } from "./analytics/CategorySalesReport";
import { ItemSalesReport } from "./analytics/ItemSalesReport";
import { AovReport } from "./analytics/AovReport";
import { PaymentMixReport } from "./analytics/PaymentMixReport";
import { SalesSummaryReport } from "./analytics/SalesSummaryReport";
import { DiscountReport } from "./analytics/DiscountReport";
import { ProfitMarginReport } from "./analytics/ProfitMarginReport";
import { DayBookReport } from "./analytics/DayBookReport";

import { BillProfitReport } from "./analytics/BillProfitReport";
import { StockIntakeReport } from "./analytics/StockIntakeReport";
import { WastageReport } from "./analytics/WastageReport";
import { StockMovementReport } from "./analytics/StockMovementReport";
import { PurchaseReturnReport } from "./analytics/PurchaseReturnReport";
import { SupplierSpendReport } from "./analytics/SupplierSpendReport";
import { InventorySummaryReport } from "./analytics/InventorySummaryReport";
import { CreditDebitReport } from "./analytics/CreditDebitReport";
import { CustomerSpendsReport } from "./analytics/CustomerSpendsReport";
import { NewCustomerReport } from "./analytics/NewCustomerReport";
import { CustomerReturnReport } from "./analytics/CustomerReturnReport";
import { LoyaltyReport } from "./analytics/LoyaltyReport";
import { AbandonedCartReport } from "./analytics/AbandonedCartReport";
import { CashDenominationReport } from "./analytics/CashDenominationReport";
import { TaxSummaryReport } from "./analytics/TaxSummaryReport";
import { OutletEarningsReport } from "./analytics/OutletEarningsReport";

type AnalyticsTabProps = {
  restaurant: RestaurantProfile | null;
  categories?: { id: string; name: string }[];
  
  // States from hook
  activeTab: string;
  setActiveTab: (v: any) => void;
  activeSalesSubTab: string;
  setActiveSalesSubTab: (v: any) => void;
  activeInventorySubTab: string;
  setActiveInventorySubTab: (v: any) => void;
  activeCustomersSubTab: string;
  setActiveCustomersSubTab: (v: any) => void;
  activeFinancialSubTab: string;
  setActiveFinancialSubTab: (v: any) => void;
  
  datePreset: string;
  setDatePreset: (v: any) => void;
  customFromDate: string;
  setCustomFromDate: (v: any) => void;
  customToDate: string;
  setCustomToDate: (v: any) => void;
  granularity: string;
  setGranularity: (v: any) => void;
  topItemsSortBy: string;
  setTopItemsSortBy: (v: any) => void;
  itemSalesCategoryId: string;
  setItemSalesCategoryId: (v: any) => void;
  billProfitPage: number;
  setBillProfitPage: (v: any) => void;
  dayBookDate: string;
  setDayBookDate: (v: any) => void;
  
  isLoading: boolean;
  loadActiveTabData: () => void;
  
  // Data
  kpiData: any; revenueData: any; peakHoursData: any; topItemsData: any; funnelData: any;
  categorySalesData: any; itemSalesData: any; aovData: any; paymentMixData: any; discountData: any;
  inventorySummaryData?: any;
  stockMovementData: any; stockIntakeData: any; wastageData: any; purchaseReturnData: any; supplierSpendData: any;
  newCustomerData: any; customerReturnData: any; creditDebitData: any; loyaltyData: any; abandonedCartData: any; customerSpendsData?: any;
  profitData: any; billProfitData: any; taxSummaryData: any; gstr1HsnData?: any; cashDenomData: any; outletEarningsData: any;
  dayBookData: any;
};

export function AnalyticsTab(props: AnalyticsTabProps) {
  const [itemViewMode, setItemViewMode] = React.useState<"category_wise" | "flat">("flat");

  const categoryOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    if (props.categories && Array.isArray(props.categories)) {
      props.categories.forEach((c: any) => {
        if (c.id && c.name) map.set(c.id, c.name);
      });
    }
    if (props.categorySalesData?.items && Array.isArray(props.categorySalesData.items)) {
      props.categorySalesData.items.forEach((c: any) => {
        if (c.category_id && c.category_name) map.set(c.category_id, c.category_name);
      });
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [props.categories, props.categorySalesData]);

  React.useEffect(() => {
    props.loadActiveTabData();
  }, [
    props.activeTab, props.activeSalesSubTab, props.activeInventorySubTab, 
    props.activeCustomersSubTab, props.activeFinancialSubTab,
    props.datePreset, props.customFromDate, props.customToDate,
    props.granularity, props.topItemsSortBy, props.itemSalesCategoryId,
    props.billProfitPage, props.dayBookDate
  ]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-[var(--accent-brand)]" />
            Analytics &amp; Reports
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Comprehensive business intelligence for {props.restaurant?.name || "your outlet"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] p-1 text-xs font-bold">
            {(["today", "yesterday", "last_7", "last_30", "this_month", "last_month", "custom"] as const).map((p) => (
              <button
                key={p}
                onClick={() => props.setDatePreset(p)}
                className={`rounded-lg px-2.5 py-1 transition ${props.datePreset === p ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {p.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => {
              if (!props.restaurant) return;
              
              if (props.activeTab === "dashboard") {
                if (props.kpiData && props.topItemsData && props.funnelData) {
                  generateAnalyticsPdfReport(props.restaurant, props.datePreset, props.kpiData, props.topItemsData.items, props.funnelData.stages);
                }
              } else if (props.activeTab === "sales") {
                if (props.activeSalesSubTab === "item" && props.itemSalesData?.items) {
                  const overallStats = {
                    totalRevenue: props.itemSalesData.total_revenue ?? props.itemSalesData.items.reduce((a: number, b: any) => a + (b.revenue || 0), 0),
                    totalCogs: props.itemSalesData.total_cogs ?? props.itemSalesData.items.reduce((a: number, b: any) => a + (b.cogs ?? ((b.cost_per_unit || 0) * (b.quantity_sold || 0))), 0),
                    totalProfit: props.itemSalesData.total_profit ?? 0,
                    overallMargin: props.itemSalesData.overall_margin_pct ?? 0,
                    totalUnits: props.itemSalesData.total_units_sold ?? props.itemSalesData.items.reduce((a: number, b: any) => a + (b.quantity_sold || 0), 0),
                  };

                  const filterCatName = props.itemSalesCategoryId 
                    ? categoryOptions.find(c => c.id === props.itemSalesCategoryId)?.name 
                    : undefined;

                  if (itemViewMode === "flat" || props.itemSalesCategoryId) {
                    const sortedItems = [...props.itemSalesData.items].sort((a: any, b: any) => (b.revenue || 0) - (a.revenue || 0));
                    generateFlatItemSalesPdfReport(
                      props.restaurant,
                      props.datePreset.replace(/_/g, " ").toUpperCase(),
                      sortedItems,
                      overallStats,
                      filterCatName
                    );
                  } else {
                    const groupsMap = new Map<string, any[]>();
                    props.itemSalesData.items.forEach((it: any) => {
                      const catName = it.category_name?.trim() || "Uncategorized";
                      if (!groupsMap.has(catName)) groupsMap.set(catName, []);
                      groupsMap.get(catName)!.push(it);
                    });

                    const categoryGroups = Array.from(groupsMap.entries()).map(([categoryName, items]) => {
                      const totalQty = items.reduce((acc: number, it: any) => acc + (it.quantity_sold || 0), 0);
                      const totalRevenue = items.reduce((acc: number, it: any) => acc + (it.revenue || 0), 0);
                      const totalCogs = items.reduce((acc: number, it: any) => {
                        const c = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
                        return acc + c;
                      }, 0);
                      const totalProfit = items.reduce((acc: number, it: any) => {
                        const c = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
                        const p = it.estimated_profit !== null && it.estimated_profit !== undefined ? it.estimated_profit : (it.revenue || 0) - c;
                        return acc + p;
                      }, 0);
                      const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
                      return { categoryName, items, totalQty, totalRevenue, totalCogs, totalProfit, marginPct };
                    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

                    generateCategoryWiseSalesPdfReport(
                      props.restaurant,
                      props.datePreset.replace(/_/g, " ").toUpperCase(),
                      categoryGroups,
                      overallStats
                    );
                  }
                } else {
                  const isAll = props.activeSalesSubTab === "master_view";
                  generateSalesPdfReport(props.restaurant, props.datePreset, 
                      isAll || props.activeSalesSubTab === "category" ? props.categorySalesData : null, 
                      isAll || props.activeSalesSubTab === "item" ? props.itemSalesData : null, 
                      isAll || props.activeSalesSubTab === "aov" ? props.aovData : null, 
                      isAll || props.activeSalesSubTab === "payment_mix" ? props.paymentMixData : null, 
                      isAll || props.activeSalesSubTab === "discount" ? props.discountData : null
                  );
                }
              } else if (props.activeTab === "inventory") {
                const isAll = props.activeInventorySubTab === "master_view" || props.activeInventorySubTab === "summary";
                generateInventoryPdfReport(
                    props.restaurant, 
                    props.datePreset, 
                    isAll || props.activeInventorySubTab === "summary" ? props.inventorySummaryData : null,
                    isAll || props.activeInventorySubTab === "stock_movement" ? props.stockMovementData : null, 
                    isAll || props.activeInventorySubTab === "intake" ? props.stockIntakeData : null, 
                    isAll || props.activeInventorySubTab === "wastage" ? props.wastageData : null, 
                    isAll || props.activeInventorySubTab === "purchase_returns" ? props.purchaseReturnData : null, 
                    isAll || props.activeInventorySubTab === "supplier_spend" ? props.supplierSpendData : null
                );
              } else if (props.activeTab === "customers") {
                const isAll = props.activeCustomersSubTab === "master_view";
                generateCustomersPdfReport(props.restaurant, props.datePreset, 
                    isAll || props.activeCustomersSubTab === "new_customers" ? props.newCustomerData : null, 
                    isAll || props.activeCustomersSubTab === "returns" ? props.customerReturnData : null, 
                    isAll || props.activeCustomersSubTab === "loyalty" ? props.loyaltyData : null, 
                    isAll || props.activeCustomersSubTab === "abandoned_carts" ? props.abandonedCartData : null
                );
              } else if (props.activeTab === "financial") {
                const isAll = props.activeFinancialSubTab === "master_view";
                generateFinancialPdfReport(props.restaurant, props.datePreset, 
                    isAll || props.activeFinancialSubTab === "profit_margin" ? props.profitData : null, 
                    isAll || props.activeFinancialSubTab === "bill_profit" ? props.billProfitData : null, 
                    isAll || props.activeFinancialSubTab === "tax_summary" ? props.taxSummaryData : null, 
                    isAll || props.activeFinancialSubTab === "cash_denominations" ? props.cashDenomData : null,
                    isAll || props.activeFinancialSubTab === "outlet_earnings" ? props.outletEarningsData : null
                );
              } else if (props.activeTab === "day_book") {
                if (props.dayBookData) {
                  generateDayBookPdfReport(props.restaurant, props.dayBookDate, props.dayBookData);
                }
              }
            }}
            disabled={props.isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-xs disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF Report
          </button>
        </div>
      </div>
      
      {/* CUSTOM DATE */}
      {props.datePreset === "custom" && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs">
          <Calendar className="h-4 w-4 text-[var(--accent-brand)]" />
          <span className="font-bold">Custom Range:</span>
          <input type="date" value={props.customFromDate} onChange={(e) => props.setCustomFromDate(e.target.value)} className="rounded-lg border px-2.5 py-1" />
          <span>to</span>
          <input type="date" value={props.customToDate} onChange={(e) => props.setCustomToDate(e.target.value)} className="rounded-lg border px-2.5 py-1" />
        </div>
      )}

      {/* MAIN NAVIGATION TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[var(--border-subtle)]">
        {[
          { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
          { id: "sales", label: "Sales & Orders", icon: <ShoppingBag className="h-4 w-4" /> },
          { id: "inventory", label: "Inventory & Stock", icon: <Package className="h-4 w-4" /> },
          { id: "customers", label: "Customers", icon: <Users className="h-4 w-4" /> },
          { id: "financial", label: "Financial", icon: <DollarSign className="h-4 w-4" /> },
          { id: "day_book", label: "Day Book", icon: <BookOpen className="h-4 w-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => props.setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
              props.activeTab === tab.id 
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]" 
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {props.isLoading ? (
        <div className="animate-pulse h-64 bg-[var(--bg-surface-elevated)] rounded-2xl border border-[var(--border-subtle)]" />
      ) : (
        <div className="mt-4">
          {/* DASHBOARD */}
          {props.activeTab === "dashboard" && (
            <DashboardReport 
              kpiData={props.kpiData} 
              revenueData={props.revenueData} 
              peakHoursData={props.peakHoursData} 
              topItemsData={props.topItemsData} 
              funnelData={props.funnelData} 
            />
          )}

          {/* SALES */}
          {props.activeTab === "sales" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {["master_view", "summary", "category", "item", "aov", "payment_mix", "discount"].map(sub => (
                  <button
                    key={sub}
                    onClick={() => props.setActiveSalesSubTab(sub)}
                    className={`px-3 py-1 text-xs rounded-full font-bold uppercase ${props.activeSalesSubTab === sub ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                  >
                    {sub.replace("_", " ")}
                  </button>
                ))}
              </div>
              
              {props.activeSalesSubTab === "summary" && (
                <SalesSummaryReport data={props.itemSalesData} />
              )}
              {props.activeSalesSubTab === "master_view" && (
                <div className="space-y-8">
                  <SalesSummaryReport data={props.itemSalesData} />
                  <CategorySalesReport 
                    data={props.categorySalesData} 
                    onSelectCategory={(catId) => {
                      props.setItemSalesCategoryId(catId);
                      props.setActiveSalesSubTab("item");
                    }}
                  />
                  <ItemSalesReport 
                    data={props.itemSalesData} 
                    selectedCategoryId={props.itemSalesCategoryId}
                    onCategoryChange={props.setItemSalesCategoryId}
                    categories={categoryOptions}
                    restaurant={props.restaurant}
                    datePreset={props.datePreset}
                    viewMode={itemViewMode}
                    onViewModeChange={setItemViewMode}
                  />
                  <AovReport data={props.aovData} />
                  <PaymentMixReport data={props.paymentMixData} />
                  <DiscountReport data={props.discountData} restaurant={props.restaurant} />
                </div>
              )}
              {props.activeSalesSubTab === "category" && (
                <CategorySalesReport 
                  data={props.categorySalesData} 
                  onSelectCategory={(catId) => {
                    props.setItemSalesCategoryId(catId);
                    props.setActiveSalesSubTab("item");
                  }}
                />
              )}
              {props.activeSalesSubTab === "item" && (
                <ItemSalesReport 
                  data={props.itemSalesData} 
                  selectedCategoryId={props.itemSalesCategoryId}
                  onCategoryChange={props.setItemSalesCategoryId}
                  categories={categoryOptions}
                  restaurant={props.restaurant}
                  datePreset={props.datePreset}
                  viewMode={itemViewMode}
                  onViewModeChange={setItemViewMode}
                />
              )}
              {props.activeSalesSubTab === "aov" && <AovReport data={props.aovData} />}
              {props.activeSalesSubTab === "payment_mix" && <PaymentMixReport data={props.paymentMixData} />}
              {props.activeSalesSubTab === "discount" && <DiscountReport data={props.discountData} restaurant={props.restaurant} />}
            </div>
          )}
          
          {/* INVENTORY */}
          {props.activeTab === "inventory" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {["master_view", "summary", "stock_movement", "intake", "wastage", "purchase_returns", "supplier_spend"].map(sub => (
                  <button
                    key={sub}
                    onClick={() => props.setActiveInventorySubTab(sub)}
                    className={`px-3 py-1 text-xs rounded-full font-bold uppercase ${props.activeInventorySubTab === sub ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                  >
                    {sub.replace("_", " ")}
                  </button>
                ))}
              </div>
              
              {props.activeInventorySubTab === "summary" && (
                <InventorySummaryReport data={props.inventorySummaryData} isLoading={props.isLoading} />
              )}
              {props.activeInventorySubTab === "master_view" && (
                <div className="space-y-8">
                  <InventorySummaryReport data={props.inventorySummaryData} isLoading={props.isLoading} />
                  <StockMovementReport data={props.stockMovementData} isLoading={props.isLoading} />
                  <StockIntakeReport data={props.stockIntakeData} isLoading={props.isLoading} />
                  <WastageReport data={props.wastageData} isLoading={props.isLoading} />
                  <PurchaseReturnReport data={props.purchaseReturnData} isLoading={props.isLoading} />
                  <SupplierSpendReport data={props.supplierSpendData} isLoading={props.isLoading} />
                </div>
              )}
              {props.activeInventorySubTab === "stock_movement" && <StockMovementReport data={props.stockMovementData} isLoading={props.isLoading} />}
              {props.activeInventorySubTab === "intake" && <StockIntakeReport data={props.stockIntakeData} isLoading={props.isLoading} />}
              {props.activeInventorySubTab === "wastage" && <WastageReport data={props.wastageData} isLoading={props.isLoading} />}
              {props.activeInventorySubTab === "purchase_returns" && <PurchaseReturnReport data={props.purchaseReturnData} isLoading={props.isLoading} />}
              {props.activeInventorySubTab === "supplier_spend" && <SupplierSpendReport data={props.supplierSpendData} isLoading={props.isLoading} />}
            </div>
          )}

          {/* CUSTOMERS */}
          {props.activeTab === "customers" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {["master_view", "customer_spends", "new_customers", "returns", "credit_debit", "loyalty", "abandoned_carts"].map(sub => (
                  <button
                    key={sub}
                    onClick={() => props.setActiveCustomersSubTab(sub)}
                    className={`px-3 py-1 text-xs rounded-full font-bold uppercase transition cursor-pointer ${props.activeCustomersSubTab === sub ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                  >
                    {sub.replace("_", " ")}
                  </button>
                ))}
              </div>
              
              {props.activeCustomersSubTab === "master_view" && (
                <div className="space-y-8">
                  <CustomerSpendsReport data={props.customerSpendsData} isLoading={props.isLoading} restaurant={props.restaurant} />
                  <NewCustomerReport data={props.newCustomerData} isLoading={props.isLoading} />
                  <CustomerReturnReport data={props.customerReturnData} isLoading={props.isLoading} />
                  <CreditDebitReport data={props.creditDebitData} isLoading={props.isLoading} restaurant={props.restaurant} />
                  <LoyaltyReport data={props.loyaltyData} isLoading={props.isLoading} />
                  <AbandonedCartReport data={props.abandonedCartData} isLoading={props.isLoading} />
                </div>
              )}
              {props.activeCustomersSubTab === "customer_spends" && <CustomerSpendsReport data={props.customerSpendsData} isLoading={props.isLoading} restaurant={props.restaurant} />}
              {props.activeCustomersSubTab === "new_customers" && <NewCustomerReport data={props.newCustomerData} isLoading={props.isLoading} />}
              {props.activeCustomersSubTab === "returns" && <CustomerReturnReport data={props.customerReturnData} isLoading={props.isLoading} />}
              {props.activeCustomersSubTab === "credit_debit" && <CreditDebitReport data={props.creditDebitData} isLoading={props.isLoading} restaurant={props.restaurant} />}
              {props.activeCustomersSubTab === "loyalty" && <LoyaltyReport data={props.loyaltyData} isLoading={props.isLoading} />}
              {props.activeCustomersSubTab === "abandoned_carts" && <AbandonedCartReport data={props.abandonedCartData} isLoading={props.isLoading} />}
            </div>
          )}

          {/* FINANCIAL */}
          {props.activeTab === "financial" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {["master_view", "outlet_earnings", "profit_margin", "bill_profit", "tax_summary", "cash_denominations"].map(sub => (
                  <button
                    key={sub}
                    onClick={() => props.setActiveFinancialSubTab(sub)}
                    className={`px-3 py-1 text-xs rounded-full font-bold uppercase ${props.activeFinancialSubTab === sub ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                  >
                    {sub.replace("_", " ")}
                  </button>
                ))}
              </div>
              
              {props.activeFinancialSubTab === "master_view" && (
                <div className="space-y-8">
                  <OutletEarningsReport data={props.outletEarningsData} isLoading={props.isLoading} />
                  <ProfitMarginReport data={props.profitData} />
                  <BillProfitReport data={props.billProfitData} isLoading={props.isLoading} restaurant={props.restaurant} />
                  <TaxSummaryReport data={props.taxSummaryData} gstr1Data={props.gstr1HsnData} isLoading={props.isLoading} fromDate={props.customFromDate} toDate={props.customToDate} restaurant={props.restaurant} />
                  <CashDenominationReport data={props.cashDenomData} isLoading={props.isLoading} />
                </div>
              )}
              {props.activeFinancialSubTab === "outlet_earnings" && <OutletEarningsReport data={props.outletEarningsData} isLoading={props.isLoading} />}
              {props.activeFinancialSubTab === "profit_margin" && <ProfitMarginReport data={props.profitData} />}
              {props.activeFinancialSubTab === "bill_profit" && <BillProfitReport data={props.billProfitData} isLoading={props.isLoading} restaurant={props.restaurant} />}
              {props.activeFinancialSubTab === "tax_summary" && <TaxSummaryReport data={props.taxSummaryData} gstr1Data={props.gstr1HsnData} isLoading={props.isLoading} fromDate={props.customFromDate} toDate={props.customToDate} restaurant={props.restaurant} />}
              {props.activeFinancialSubTab === "cash_denominations" && <CashDenominationReport data={props.cashDenomData} isLoading={props.isLoading} />}
            </div>
          )}

          {/* DAY BOOK */}
          {props.activeTab === "day_book" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border bg-[var(--bg-surface)] p-3 text-xs mb-4">
                <Calendar className="h-4 w-4 text-[var(--accent-brand)]" />
                <span className="font-bold">Select Date:</span>
                <input type="date" value={props.dayBookDate} onChange={(e) => props.setDayBookDate(e.target.value)} className="rounded-lg border px-2.5 py-1" />
              </div>
              <DayBookReport data={props.dayBookData} />
            </div>
          )}

        </div>
      )}
    </div>
  );
}
