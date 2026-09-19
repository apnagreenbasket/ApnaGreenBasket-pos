import React, { useMemo, useState, useRef, useEffect } from "react";
import { 
  IndianRupee, 
  Package, 
  TrendingUp, 
  Percent, 
  Search, 
  Tag, 
  ShoppingBag, 
  ArrowDownRight,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  LayoutList,
} from "lucide-react";
import type { ItemSalesResponse, ItemSalesRow } from "@/types";
import { generateCategoryWiseSalesPdfReport, generateFlatItemSalesPdfReport } from "@/lib/pdfGenerator";
import { SortableHeader } from "./shared";

type SortField = "revenue" | "profit" | "margin" | "qty" | "name";
type SortDirection = "asc" | "desc";
export type ViewMode = "category_wise" | "flat";

export interface ItemSalesReportProps {
  data: ItemSalesResponse | null;
  selectedCategoryId?: string;
  onCategoryChange?: (categoryId: string) => void;
  categories?: { id: string; name: string }[];
  restaurant?: any;
  datePreset?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export function ItemSalesReport({ 
  data,
  selectedCategoryId = "",
  onCategoryChange,
  categories = [],
  restaurant,
  datePreset = "last_30",
  viewMode: controlledViewMode,
  onViewModeChange,
}: ItemSalesReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>("flat");
  const activeViewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: ViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const activeCategoryName = useMemo(() => {
    if (!selectedCategoryId) return "";
    const match = categories.find((c) => c.id === selectedCategoryId);
    if (match) return match.name;
    const itemMatch = data?.items?.find((it) => it.category_name);
    return itemMatch?.category_name || "Category";
  }, [selectedCategoryId, categories, data]);

  // Overall KPIs
  const totalRevenue = useMemo(() => {
    if (data?.total_revenue !== undefined) return data.total_revenue;
    return (data?.items || []).reduce((acc, it) => acc + (it.revenue || 0), 0);
  }, [data]);

  const totalCogs = useMemo(() => {
    if (data?.total_cogs !== undefined) return data.total_cogs;
    return (data?.items || []).reduce((acc, it) => acc + (it.cogs || 0), 0);
  }, [data]);

  const totalProfit = useMemo(() => {
    if (data?.total_profit !== undefined) return data.total_profit;
    return totalRevenue - totalCogs;
  }, [data, totalRevenue, totalCogs]);

  const overallMargin = useMemo(() => {
    if (data?.overall_margin_pct !== undefined) return data.overall_margin_pct;
    return totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  }, [data, totalProfit, totalRevenue]);

  const totalUnitsSold = useMemo(() => {
    if (data?.total_units_sold !== undefined) return data.total_units_sold;
    return (data?.items || []).reduce((acc, it) => acc + (it.quantity_sold || 0), 0);
  }, [data]);

  // Flat filtered and sorted items
  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return [];

    let filtered = data.items.filter((it) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchName = it.item_name.toLowerCase().includes(q);
      const matchCategory = it.category_name?.toLowerCase().includes(q);
      return matchName || matchCategory;
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === "revenue") {
        comparison = (a.revenue || 0) - (b.revenue || 0);
      } else if (sortField === "profit") {
        comparison = (a.estimated_profit || 0) - (b.estimated_profit || 0);
      } else if (sortField === "margin") {
        comparison = (a.margin_pct || 0) - (b.margin_pct || 0);
      } else if (sortField === "qty") {
        comparison = (a.quantity_sold || 0) - (b.quantity_sold || 0);
      } else if (sortField === "name") {
        comparison = a.item_name.localeCompare(b.item_name);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, searchQuery, sortField, sortDirection]);

  // Category-wise grouped items
  const categoryGroups = useMemo(() => {
    if (!data?.items) return [];

    const groupsMap = new Map<string, ItemSalesRow[]>();

    data.items.forEach((it) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = it.item_name.toLowerCase().includes(q);
        const matchCat = it.category_name?.toLowerCase().includes(q);
        if (!matchName && !matchCat) return;
      }

      const catName = it.category_name?.trim() || "Uncategorized";
      if (!groupsMap.has(catName)) {
        groupsMap.set(catName, []);
      }
      groupsMap.get(catName)!.push(it);
    });

    const groups = Array.from(groupsMap.entries()).map(([categoryName, items]) => {
      const sortedItems = [...items].sort((a, b) => {
        let comparison = 0;
        if (sortField === "revenue") comparison = (a.revenue || 0) - (b.revenue || 0);
        else if (sortField === "profit") comparison = (a.estimated_profit || 0) - (b.estimated_profit || 0);
        else if (sortField === "margin") comparison = (a.margin_pct || 0) - (b.margin_pct || 0);
        else if (sortField === "qty") comparison = (a.quantity_sold || 0) - (b.quantity_sold || 0);
        else if (sortField === "name") comparison = a.item_name.localeCompare(b.item_name);
        return sortDirection === "asc" ? comparison : -comparison;
      });

      const totalQty = items.reduce((acc, it) => acc + (it.quantity_sold || 0), 0);
      const groupRevenue = items.reduce((acc, it) => acc + (it.revenue || 0), 0);
      const groupCogs = items.reduce((acc, it) => {
        const c = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
        return acc + c;
      }, 0);
      const groupProfit = items.reduce((acc, it) => {
        const c = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
        const p = it.estimated_profit !== null && it.estimated_profit !== undefined ? it.estimated_profit : (it.revenue || 0) - c;
        return acc + p;
      }, 0);
      const marginPct = groupRevenue > 0 ? (groupProfit / groupRevenue) * 100 : 0;

      return {
        categoryName,
        items: sortedItems,
        totalQty,
        totalRevenue: groupRevenue,
        totalCogs: groupCogs,
        totalProfit: groupProfit,
        marginPct,
      };
    });

    return groups.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [data, searchQuery, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };

  const expandAllCategories = () => setCollapsedCategories(new Set());
  const collapseAllCategories = () => setCollapsedCategories(new Set(categoryGroups.map((g) => g.categoryName)));

  // Export Category-Wise CSV
  const handleExportCategoryWiseCsv = () => {
    const lines: string[] = [];
    const restName = restaurant?.name || "ApnaGreen Basket";
    const dateLabel = datePreset.replace(/_/g, " ").toUpperCase();

    lines.push(`"CATEGORY-WISE ITEM SALES & MARGIN REPORT"`);
    lines.push(`"Outlet: ${restName.replace(/"/g, '""')}"`);
    lines.push(`"Period: ${dateLabel}"`);
    lines.push(`"Generated At: ${new Date().toLocaleString("en-IN")}"`);
    lines.push("");

    // Summary
    lines.push(`"EXECUTIVE SUMMARY"`);
    lines.push(`"Total Revenue (INR)","Total COGS (INR)","Gross Profit (INR)","Overall Margin %","Total Units Sold","Categories Count"`);
    lines.push(`"${totalRevenue.toFixed(2)}","${totalCogs.toFixed(2)}","${totalProfit.toFixed(2)}","${overallMargin.toFixed(1)}%","${totalUnitsSold.toFixed(2)}","${categoryGroups.length}"`);
    lines.push("");
    lines.push("");

    // Categories
    categoryGroups.forEach((group) => {
      lines.push(`"============================================================"`);
      lines.push(`"CATEGORY: ${group.categoryName.replace(/"/g, '""')} (${group.items.length} items)"`);
      lines.push(`"Category","Item Name","Quantity Sold","Revenue (INR)","Unit Cost (INR)","COGS (INR)","Gross Profit (INR)","Margin %"`);

      group.items.forEach((it) => {
        const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
        const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
          ? it.estimated_profit
          : it.revenue - itemCogs;
        const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
          ? it.margin_pct
          : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
        const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
          ? it.cost_per_unit
          : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);

        lines.push(
          `"${group.categoryName.replace(/"/g, '""')}","${it.item_name.replace(/"/g, '""')}","${it.quantity_sold}","${it.revenue.toFixed(2)}","${unitCost.toFixed(2)}","${itemCogs.toFixed(2)}","${itemProfit.toFixed(2)}","${itemMargin.toFixed(1)}%"`
        );
      });

      // Subtotal
      lines.push(
        `"SUBTOTAL (${group.categoryName.replace(/"/g, '""')})","${group.items.length} items","${group.totalQty}","${group.totalRevenue.toFixed(2)}","—","${group.totalCogs.toFixed(2)}","${group.totalProfit.toFixed(2)}","${group.marginPct.toFixed(1)}%"`
      );
      lines.push("");
    });

    // Grand Total
    lines.push(`"============================================================"`);
    lines.push(
      `"GRAND TOTAL","All ${categoryGroups.length} Categories","${totalUnitsSold.toFixed(2)}","${totalRevenue.toFixed(2)}","—","${totalCogs.toFixed(2)}","${totalProfit.toFixed(2)}","${overallMargin.toFixed(1)}%"`
    );

    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Category_Wise_Sales_${restName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  // Export Flat CSV
  const handleExportFlatCsv = () => {
    const lines: string[] = [];
    const restName = restaurant?.name || "ApnaGreen Basket";
    const dateLabel = datePreset.replace(/_/g, " ").toUpperCase();

    lines.push(`"ITEM SALES REPORT"`);
    lines.push(`"Outlet: ${restName.replace(/"/g, '""')}"`);
    lines.push(`"Period: ${dateLabel}"`);
    lines.push("");
    lines.push(`"Item Name","Category","Quantity Sold","Revenue (INR)","Unit Cost (INR)","COGS (INR)","Gross Profit (INR)","Margin %"`);

    filteredAndSortedItems.forEach((it) => {
      const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
      const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
        ? it.estimated_profit
        : it.revenue - itemCogs;
      const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
        ? it.margin_pct
        : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
      const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
        ? it.cost_per_unit
        : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);

      lines.push(
        `"${it.item_name.replace(/"/g, '""')}","${(it.category_name || "Uncategorized").replace(/"/g, '""')}","${it.quantity_sold}","${it.revenue.toFixed(2)}","${unitCost.toFixed(2)}","${itemCogs.toFixed(2)}","${itemProfit.toFixed(2)}","${itemMargin.toFixed(1)}%"`
      );
    });

    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Item_Sales_${restName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  // Export Category-Wise PDF
  const handleExportCategoryWisePdf = () => {
    const overallStats = {
      totalRevenue,
      totalCogs,
      totalProfit,
      overallMargin,
      totalUnits: totalUnitsSold,
    };
    generateCategoryWiseSalesPdfReport(
      restaurant,
      datePreset.replace(/_/g, " ").toUpperCase(),
      categoryGroups,
      overallStats
    );
    setExportMenuOpen(false);
  };

  // Export Flat PDF
  const handleExportFlatPdf = () => {
    const overallStats = {
      totalRevenue,
      totalCogs,
      totalProfit,
      overallMargin,
      totalUnits: totalUnitsSold,
    };
    generateFlatItemSalesPdfReport(
      restaurant,
      datePreset.replace(/_/g, " ").toUpperCase(),
      filteredAndSortedItems,
      overallStats,
      selectedCategoryId ? activeCategoryName : undefined
    );
    setExportMenuOpen(false);
  };

  // Export PDF (Category-Wise or Flat depending on activeViewMode)
  const handleExportPdf = () => {
    if (activeViewMode === "flat" || selectedCategoryId) {
      handleExportFlatPdf();
    } else {
      handleExportCategoryWisePdf();
    }
  };

  if (!data || !data.items || data.items.length === 0) {
    return (
      <div className="space-y-4">
        {onCategoryChange && (sortedCategories.length > 0 || selectedCategoryId) && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
              <select
                value={selectedCategoryId || (activeViewMode === "category_wise" ? "__ALL_CATEGORY_WISE__" : "")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__ALL_CATEGORY_WISE__") {
                    setViewMode("category_wise");
                    onCategoryChange("");
                  } else if (v === "") {
                    setViewMode("flat");
                    onCategoryChange("");
                  } else {
                    onCategoryChange(v);
                  }
                }}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 pl-8.5 pr-8 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none transition-colors cursor-pointer appearance-none shadow-xs"
              >
                <option value="">📋 All Categories (Flat Table)</option>
                <option value="__ALL_CATEGORY_WISE__">📂 All (Category-Wise)</option>
                <optgroup label="Filter by Category">
                  {sortedCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
            </div>

            {selectedCategoryId && (
              <button
                onClick={() => onCategoryChange("")}
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--accent-brand)]/10 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-brand)] border border-[var(--accent-brand)]/20 hover:bg-[var(--accent-brand)]/20 transition-colors"
                title="Clear category filter"
              >
                <span>Category: {activeCategoryName}</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--text-muted)] mb-3">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold">
            {selectedCategoryId ? `No Sales in "${activeCategoryName}"` : "No Item Sales Recorded"}
          </h3>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
            {selectedCategoryId
              ? "No items in this category had settled sales during the selected date range."
              : "No settled sales found for this date range or filter selection."}
          </p>
          {selectedCategoryId && onCategoryChange && (
            <button
              onClick={() => onCategoryChange("")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-xs transition-opacity hover:opacity-90"
            >
              <X className="h-3.5 w-3.5" />
              Clear Category Filter
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Category Filter Banner */}
      {selectedCategoryId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--accent-brand)]/5 border border-[var(--accent-brand)]/20 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--accent-brand)] shrink-0" />
            <span>
              Showing item performance within category:{" "}
              <strong className="text-[var(--text-primary)] font-bold text-sm">
                {activeCategoryName}
              </strong>
            </span>
          </div>
          {onCategoryChange && (
            <button
              onClick={() => onCategoryChange("")}
              className="inline-flex items-center gap-1 font-bold text-xs text-[var(--accent-brand)] hover:underline rounded-lg px-2 py-1 hover:bg-[var(--accent-brand)]/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Show All Categories
            </button>
          )}
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Total Revenue</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-black tracking-tight">
              ₹{totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {data.total_items && data.items.length < data.total_items
                ? `${data.items.length} of ${data.total_items} items`
                : `${data.total_items ?? data.items.length} items`}
            </span>
          </div>
          {data?.reconciliation_bridge && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
              <span>Gross: ₹{data.reconciliation_bridge.gross_item_sales.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-rose-400">Returns: -₹{data.reconciliation_bridge.item_returns.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        {/* COGS Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Total COGS</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
              ₹{totalCogs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {totalUnitsSold.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units
            </span>
          </div>
        </div>

        {/* Gross Profit Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Gross Profit</span>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              totalProfit >= 0
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
            }`}>
              {totalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className={`text-2xl font-black tracking-tight ${
              totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}>
              ₹{totalProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
              {totalProfit >= 0 ? "Gain" : "Loss"}
            </span>
          </div>
        </div>

        {/* Profit Margin Card */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            <span>Overall Margin</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-2xl font-black tracking-tight">
              {overallMargin.toFixed(1)}%
            </p>
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
              overallMargin >= 25
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                : overallMargin >= 10
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
            }`}>
              {overallMargin >= 25 ? "Healthy" : overallMargin >= 10 ? "Moderate" : "Low"}
            </span>
          </div>
        </div>
      </div>



      {/* Main Table Container */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search items or categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 py-2 pl-9 pr-4 text-xs focus:border-[var(--accent-brand)] focus:outline-none transition-colors"
              />
            </div>

            {/* Category Dropdown */}
            {onCategoryChange && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
                <select
                  value={selectedCategoryId || (activeViewMode === "category_wise" ? "__ALL_CATEGORY_WISE__" : "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__ALL_CATEGORY_WISE__") {
                      setViewMode("category_wise");
                      onCategoryChange("");
                    } else if (v === "") {
                      setViewMode("flat");
                      onCategoryChange("");
                    } else {
                      onCategoryChange(v);
                    }
                  }}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 py-2 pl-8.5 pr-8 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none transition-colors cursor-pointer appearance-none"
                >
                  <option value="">📋 All Categories (Flat Table)</option>
                  <option value="__ALL_CATEGORY_WISE__">📂 All (Category-Wise)</option>
                  <optgroup label="Filter by Category">
                    {sortedCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
              </div>
            )}

            {/* View Mode Toggle (Flat vs Category-Wise) */}
            {!selectedCategoryId && (
              <div className="flex items-center rounded-xl bg-[var(--bg-muted)] p-0.5 border border-[var(--border-subtle)] text-xs font-bold">
                <button
                  onClick={() => setViewMode("flat")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                    activeViewMode === "flat"
                      ? "bg-[var(--bg-surface)] text-[var(--accent-brand)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                  title="Single Flat Table"
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  <span>Flat Table</span>
                </button>
                <button
                  onClick={() => setViewMode("category_wise")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                    activeViewMode === "category_wise"
                      ? "bg-[var(--bg-surface)] text-[var(--accent-brand)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                  title="Group items by Category"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Category-Wise</span>
                </button>
              </div>
            )}

            {/* Clear Filter Pill */}
            {selectedCategoryId && onCategoryChange && (
              <button
                onClick={() => onCategoryChange("")}
                className="inline-flex items-center gap-1 rounded-xl bg-[var(--accent-brand)]/10 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-brand)] border border-[var(--accent-brand)]/20 hover:bg-[var(--accent-brand)]/20 transition-colors"
                title="Clear category filter"
              >
                <span>{activeCategoryName}</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] shrink-0 justify-between xl:justify-end">
            <span className="font-semibold">
              Showing {filteredAndSortedItems.length} of {data.items.length} items
              {activeViewMode === "category_wise" && !selectedCategoryId && (
                <span className="ml-1 text-[var(--accent-brand)] font-bold">
                  ({categoryGroups.length} categories)
                </span>
              )}
            </span>

            {/* Export Menu Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition-opacity"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Report</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-xl z-30">
                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Category-Wise Exports
                  </div>
                  <button
                    onClick={handleExportCategoryWiseCsv}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors text-left"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    <div>
                      <div className="font-bold">Export Category-Wise CSV</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Grouped with subtotals (Excel/Sheets)</div>
                    </div>
                  </button>
                  <button
                    onClick={handleExportCategoryWisePdf}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-rose-500" />
                    <div>
                      <div className="font-bold">Export Category-Wise PDF</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Print-ready publication report</div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-[var(--border-subtle)]" />

                  <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    Raw Table Export
                  </div>
                  <button
                    onClick={handleExportFlatCsv}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors text-left"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-sky-500" />
                    <div>
                      <div className="font-bold">Export Flat CSV</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Single continuous table</div>
                    </div>
                  </button>
                  <button
                    onClick={handleExportFlatPdf}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-rose-500" />
                    <div>
                      <div className="font-bold">Export Flat PDF</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Continuous table report</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="font-bold text-[var(--accent-brand)] hover:underline ml-1"
              >
                Clear Search
              </button>
            )}
          </div>
        </div>

        {/* Category Jump Anchor Bar & Expand/Collapse All (Only in Category-Wise View) */}
        {activeViewMode === "category_wise" && !selectedCategoryId && categoryGroups.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/20 px-4 py-2 text-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] shrink-0 mr-1">
                Quick Jump:
              </span>
              {categoryGroups.map((group) => {
                const isCollapsed = collapsedCategories.has(group.categoryName);
                return (
                  <button
                    key={group.categoryName}
                    onClick={() => {
                      const el = document.getElementById(`cat-section-${group.categoryName.replace(/\s+/g, "-")}`);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold border transition-all ${
                      isCollapsed
                        ? "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        : "border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20"
                    }`}
                  >
                    {group.categoryName} ({group.items.length})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={expandAllCategories}
                className="text-[11px] font-bold text-[var(--accent-brand)] hover:underline"
              >
                Expand All
              </button>
              <span className="text-[var(--border-strong)]">|</span>
              <button
                onClick={collapseAllCategories}
                className="text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
              >
                Collapse All
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: CATEGORY-WISE GROUPED VIEW */}
        {activeViewMode === "category_wise" && !selectedCategoryId ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {categoryGroups.length === 0 ? (
              <div className="p-12 text-center text-sm text-[var(--text-muted)]">
                No items match &quot;{searchQuery}&quot;.
              </div>
            ) : (
              categoryGroups.map((group) => {
                const isCollapsed = collapsedCategories.has(group.categoryName);
                const sectionId = `cat-section-${group.categoryName.replace(/\s+/g, "-")}`;

                return (
                  <div key={group.categoryName} id={sectionId} className="transition-colors">
                    {/* Category Group Header Row */}
                    <div
                      onClick={() => toggleCategoryCollapse(group.categoryName)}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--bg-muted)]/35 cursor-pointer hover:bg-[var(--bg-muted)]/60 transition-colors select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                              {group.categoryName}
                            </h4>
                            <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold border border-[var(--border-subtle)] text-[var(--text-muted)]">
                              {group.items.length} {group.items.length === 1 ? "item" : "items"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Category Subtotal Metric Pills */}
                      <div className="flex items-center gap-3 sm:gap-4 text-xs">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Qty Sold</span>
                          <span className="font-semibold font-mono">
                            {group.totalQty % 1 === 0 ? group.totalQty : group.totalQty.toFixed(2)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Revenue</span>
                          <span className="font-bold font-mono text-[var(--text-primary)]">
                            ₹{group.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="text-right hidden sm:block">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">COGS</span>
                          <span className="font-semibold font-mono text-rose-600 dark:text-rose-400">
                            ₹{group.totalCogs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Profit</span>
                          <span className={`font-bold font-mono ${group.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            ₹{group.totalProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Margin</span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                            group.marginPct >= 25
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                              : group.marginPct >= 10
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                          }`}>
                            {group.marginPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Category Items Table (Expandable) */}
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/15 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                              <SortableHeader label="Item Name" columnKey="name" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-2.5 !pl-8 !pr-3" />
                              <SortableHeader label="Qty Sold" columnKey="qty" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-2.5 !px-3 text-right" />
                              <SortableHeader label="Revenue" columnKey="revenue" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-2.5 !px-3 text-right" />
                              <th className="py-2.5 px-3 text-right">
                                <span>COGS (Total / Unit)</span>
                              </th>
                              <SortableHeader label="Profit" columnKey="profit" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-2.5 !px-3 text-right" />
                              <SortableHeader label="Margin %" columnKey="margin" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-2.5 !pl-3 !pr-5 text-right" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {group.items.map((it, idx) => {
                              const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
                              const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
                                ? it.estimated_profit
                                : it.revenue - itemCogs;
                              const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
                                ? it.margin_pct
                                : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
                              const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
                                ? it.cost_per_unit
                                : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);
                              const isProfitable = itemProfit >= 0;

                              return (
                                <tr key={it.menu_item_id || `${it.item_name}-${idx}`} className="hover:bg-[var(--bg-muted)]/20 transition-colors">
                                  {/* Item Name */}
                                  <td className="py-3 pl-8 pr-3">
                                    <span className="font-semibold text-[var(--text-main)]">{it.item_name}</span>
                                    {group.totalRevenue > 0 && (
                                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                        {((it.revenue / group.totalRevenue) * 100).toFixed(1)}% of category revenue
                                      </div>
                                    )}
                                  </td>

                                  {/* Qty Sold */}
                                  <td className="py-3 px-3 text-right font-medium">
                                    {it.quantity_sold % 1 === 0 ? it.quantity_sold : it.quantity_sold.toFixed(2)}
                                  </td>

                                  {/* Revenue */}
                                  <td className="py-3 px-3 text-right font-bold text-[var(--text-main)]">
                                    ₹{it.revenue.toFixed(2)}
                                  </td>

                                  {/* COGS */}
                                  <td className="py-3 px-3 text-right">
                                    <div className="font-semibold text-rose-600 dark:text-rose-400">
                                      ₹{itemCogs.toFixed(2)}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-muted)]">
                                      ₹{unitCost.toFixed(2)}/u
                                    </div>
                                  </td>

                                  {/* Profit */}
                                  <td className="py-3 px-3 text-right">
                                    <span className={`font-bold ${isProfitable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                      ₹{itemProfit.toFixed(2)}
                                    </span>
                                  </td>

                                  {/* Margin % */}
                                  <td className="py-3 pl-3 pr-5 text-right">
                                    <span className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold border ${
                                      itemMargin >= 30
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : itemMargin >= 15
                                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
                                        : itemMargin >= 0
                                        ? "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300"
                                    }`}>
                                      {itemMargin.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Subtotal Row */}
                            <tr className="bg-[var(--bg-muted)]/40 font-bold border-t border-[var(--border-subtle)] text-xs">
                              <td className="py-2.5 pl-8 pr-3 text-[var(--text-primary)]">
                                <span>Subtotal ({group.categoryName})</span>
                                <span className="text-[10px] text-[var(--text-muted)] font-normal ml-2">
                                  {group.items.length} items
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                {group.totalQty % 1 === 0 ? group.totalQty : group.totalQty.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-[var(--accent-brand)]">
                                ₹{group.totalRevenue.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                                ₹{group.totalCogs.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                ₹{group.totalProfit.toFixed(2)}
                              </td>
                              <td className="py-2.5 pl-3 pr-5 text-right font-mono">
                                {group.marginPct.toFixed(1)}%
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* VIEW 2: FLAT TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <SortableHeader label="Item & Category" columnKey="name" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-3.5 !pl-5 !pr-3" />
                  <SortableHeader label="Qty Sold" columnKey="qty" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-3.5 !px-3 text-right" />
                  <SortableHeader label="Revenue" columnKey="revenue" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-3.5 !px-3 text-right" />
                  <th className="py-3.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>COGS (Total / Unit)</span>
                    </div>
                  </th>
                  <SortableHeader label="Profit" columnKey="profit" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-3.5 !px-3 text-right" />
                  <SortableHeader label="Margin %" columnKey="margin" sortConfig={{key: sortField, direction: sortDirection}} handleSort={(k) => toggleSort(k as SortField)} className="!py-3.5 !pl-3 !pr-5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredAndSortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-[var(--text-muted)]">
                      No items match &quot;{searchQuery}&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedItems.map((it, idx) => {
                    const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
                    const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
                      ? it.estimated_profit
                      : it.revenue - itemCogs;
                    const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
                      ? it.margin_pct
                      : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
                    const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
                      ? it.cost_per_unit
                      : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);

                    const isProfitable = itemProfit >= 0;

                    return (
                      <tr
                        key={it.menu_item_id || `${it.item_name}-${idx}`}
                        className="group transition-colors hover:bg-[var(--bg-muted)]/30"
                      >
                        {/* Item & Category */}
                        <td className="py-3 pl-5 pr-3">
                          <div className="font-semibold text-[var(--text-main)] leading-tight">
                            {it.item_name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {it.category_name ? (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-muted)] text-[var(--text-muted)]">
                                <Tag className="h-2.5 w-2.5" />
                                {it.category_name}
                              </span>
                            ) : null}
                            {it.revenue_share_pct > 0 && (
                              <span className="text-[10px] text-[var(--text-muted)] font-medium">
                                ({it.revenue_share_pct.toFixed(1)}% rev)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Qty Sold */}
                        <td className="py-3 px-3 text-right font-medium">
                          {it.quantity_sold % 1 === 0 ? it.quantity_sold : it.quantity_sold.toFixed(2)}
                        </td>

                        {/* Revenue */}
                        <td className="py-3 px-3 text-right font-bold text-[var(--text-main)]">
                          ₹{it.revenue.toFixed(2)}
                        </td>

                        {/* COGS */}
                        <td className="py-3 px-3 text-right">
                          <div className="font-semibold text-rose-600 dark:text-rose-400">
                            ₹{itemCogs.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            ₹{unitCost.toFixed(2)}/u
                          </div>
                        </td>

                        {/* Profit */}
                        <td className="py-3 px-3 text-right">
                          <span className={`font-bold ${isProfitable ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            ₹{itemProfit.toFixed(2)}
                          </span>
                        </td>

                        {/* Margin % */}
                        <td className="py-3 pl-3 pr-5 text-right">
                          <span className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-bold border ${
                            itemMargin >= 30
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : itemMargin >= 15
                              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
                              : itemMargin >= 0
                              ? "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300"
                          }`}>
                            {itemMargin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
