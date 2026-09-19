import React, { useState, useMemo } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  User,
  Receipt,
  ArrowDownRight,
  ArrowUpRight,
  Filter,
  Eye,
  Loader2,
  X,
  Clock,
  CreditCard,
  Package,
  Download,
  Wallet,
  ShoppingBag,
  RotateCcw,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Phone,
  Tag,
} from "lucide-react";
import type {
  CustomerSpendsReportResponse,
  CustomerSpendRow,
  CustomerSpendOrder,
  CustomerSpendReturn,
  ManualBill,
} from "@/types";
import { apiRequest } from "../../adminUtils";
import { parseUTCDate } from "@/lib/api";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { RestaurantProfile } from "../../adminTypes";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader } from "./shared";

type CustomerSpendsReportProps = {
  data: CustomerSpendsReportResponse | null;
  isLoading?: boolean;
  restaurant?: RestaurantProfile | null;
};

export function CustomerSpendsReport({ data, isLoading, restaurant }: CustomerSpendsReportProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "active" | "returns_only">("all");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [expandedCustomerTab, setExpandedCustomerTab] = useState<"all" | "orders" | "returns">("all");

  // Detailed Bill Modal View state
  const [selectedBillForView, setSelectedBillForView] = useState<{
    detail: ManualBill | null;
    loading: boolean;
    error?: string | null;
    orderId: string;
  } | null>(null);
  const [fetchingBillId, setFetchingBillId] = useState<string | null>(null);

  const handleOpenBillView = async (orderId: string) => {
    setFetchingBillId(orderId);
    setSelectedBillForView({
      detail: null,
      loading: true,
      error: null,
      orderId,
    });
    try {
      const detail = await apiRequest<ManualBill>(`/api/billing/bills/${orderId}`);
      setSelectedBillForView({
        detail,
        loading: false,
        error: null,
        orderId,
      });
    } catch (err: any) {
      setSelectedBillForView({
        detail: null,
        loading: false,
        error: err?.message || "Failed to load bill details.",
        orderId,
      });
    } finally {
      setFetchingBillId(null);
    }
  };

  const handleViewReceiptPdf = () => {
    if (!selectedBillForView?.detail) return;
    generateReceiptPDF(
      selectedBillForView.detail as any,
      restaurant?.name || "ApnaGreen Basket",
      undefined,
      restaurant || {},
      "view"
    );
  };

  const handleDownloadReceiptPdf = () => {
    if (!selectedBillForView?.detail) return;
    generateReceiptPDF(
      selectedBillForView.detail as any,
      restaurant?.name || "ApnaGreen Basket",
      undefined,
      restaurant || {},
      "download"
    );
  };

  const handleDownloadInvoicePdf = () => {
    if (!selectedBillForView?.detail) return;
    generateA4InvoicePDF(
      selectedBillForView.detail as any,
      restaurant?.name || "ApnaGreen Basket",
      undefined,
      restaurant || {},
      "download"
    );
  };

  const formatBillLabel = (orderId?: string | null, basketNumber?: string | null) => {
    if (basketNumber && !basketNumber.toUpperCase().includes("WALK")) {
      return `Bill #${basketNumber}`;
    }
    if (orderId) {
      return `Bill #${orderId.slice(0, 8).toUpperCase()}`;
    }
    if (basketNumber) {
      return `Bill #${basketNumber}`;
    }
    return "Direct";
  };

  // Base customer list filtering (All vs Active Spenders vs With Returns)
  const baseCustomers = useMemo(() => {
    if (!data?.customers) return [];
    if (filterMode === "active") {
      return data.customers.filter((c) => c.total_spent > 0 || c.total_orders > 0);
    }
    if (filterMode === "returns_only") {
      return data.customers.filter((c) => c.total_returns_count > 0 || c.total_returned_amount > 0);
    }
    return data.customers;
  }, [data?.customers, filterMode]);

  // Search & Sort on Customers Table
  const {
    searchQuery: tableSearchQuery,
    setSearchQuery: setTableSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData: filteredCustomers,
  } = useTableSortAndSearch(baseCustomers, ["customer_name", "customer_phone"]);

  // Export Summary Table CSV
  const handleExportSummaryCsv = () => {
    if (!filteredCustomers.length) return;
    const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const formatExcelText = (val: string | null | undefined) => {
      if (!val) return '""';
      return `="` + String(val).replace(/"/g, '""') + `"`;
    };

    const headers = [
      "Customer Name",
      "Phone",
      "Total Orders",
      "Total Spent (INR)",
      "Returns Count",
      "Returned Amount (INR)",
      "Net Spent (INR)",
      "Avg Order Value (INR)",
      "Credit Balance (INR)",
      "Loyalty Points",
      "Last Activity Date",
    ];

    const rows = filteredCustomers.map((c) => [
      escapeCsv(c.customer_name),
      formatExcelText(c.customer_phone),
      c.total_orders,
      c.total_spent.toFixed(2),
      c.total_returns_count,
      c.total_returned_amount.toFixed(2),
      c.net_spent.toFixed(2),
      c.avg_order_value.toFixed(2),
      (c.credit_balance || 0).toFixed(2),
      c.loyalty_points || 0,
      escapeCsv(c.last_activity_date ? parseUTCDate(c.last_activity_date).toLocaleString() : "None"),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `customer_spends_report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Individual Customer Statement / History CSV
  const handleExportCustomerHistoryCsv = (customer: CustomerSpendRow) => {
    const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const formatExcelText = (val: string | null | undefined) => {
      if (!val) return '""';
      return `="` + String(val).replace(/"/g, '""') + `"`;
    };

    const headers = [
      "Date & Time",
      "Transaction Type",
      "Reference #",
      "Items Count / Summary",
      "Amount Spent (INR)",
      "Refund Amount (INR)",
      "Payment Method",
      "Status / Notes",
    ];

    const rows: string[][] = [];

    // Orders
    customer.orders.forEach((o) => {
      rows.push([
        escapeCsv(parseUTCDate(o.created_at).toLocaleString()),
        "ORDER / SPEND",
        escapeCsv(o.basket_number || o.order_id.slice(0, 8)),
        `${o.items_count} items`,
        o.total_amount.toFixed(2),
        "0.00",
        escapeCsv(o.payment_method || "CASH"),
        escapeCsv(o.status),
      ]);
    });

    // Returns
    customer.returns.forEach((r) => {
      const itemsList = (r.returned_items || [])
        .map((it: any) => `${it.item_name || "Item"} (${it.quantity || 1} ${it.selected_unit || "pc"})`)
        .join("; ");
      rows.push([
        escapeCsv(parseUTCDate(r.created_at).toLocaleString()),
        "CUSTOMER RETURN",
        escapeCsv(r.return_number),
        escapeCsv(itemsList || "Returned items"),
        "0.00",
        r.total_refund_amount.toFixed(2),
        escapeCsv(r.refund_payment_method || "CASH"),
        escapeCsv(r.notes || "Refunded"),
      ]);
    });

    // Sort descending by date
    rows.sort((a, b) => new Date(b[0].replace(/"/g, "")).getTime() - new Date(a[0].replace(/"/g, "")).getTime());

    const csvContent = [
      escapeCsv(`Customer History: ${customer.customer_name} (${customer.customer_phone})`),
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeName = (customer.customer_name || "Customer").replace(/[^a-zA-Z0-9]/g, "_");
    link.setAttribute("download", `customer_statement_${safeName}_${customer.customer_phone}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-sm font-medium text-[var(--text-secondary)]">Loading customer spends & returns...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 shadow-inner">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              Customer Spends & Returns
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Analytics
              </span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Customer expenditure breakdown, order histories, refund deductions, and individual ledgers
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportSummaryCsv}
          disabled={filteredCustomers.length === 0}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          title="Export customer spends to CSV"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export Spends CSV</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Spends */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Total Customer Spends</div>
            <ShoppingBag className="w-4 h-4 text-emerald-400/50" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 mt-2">
            ₹{data.summary.total_customer_spends.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
            <span>{data.summary.total_orders_count} orders in selected period</span>
          </div>
        </div>

        {/* Total Returns */}
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 relative overflow-hidden group hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Customer Returns</div>
            <RotateCcw className="w-4 h-4 text-rose-400/50" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-400 mt-2">
            ₹{data.summary.total_returns_amount.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">
            Refunds & returns credited back
          </div>
        </div>

        {/* Net Spends */}
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 relative overflow-hidden group hover:border-sky-500/40 transition">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Net Customer Spends</div>
            <ArrowDownRight className="w-4 h-4 text-sky-400/50" />
          </div>
          <div className="text-2xl font-black font-mono text-sky-400 mt-2">
            ₹{data.summary.net_customer_spends.toFixed(2)}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">
            Gross spends minus returns
          </div>
        </div>

        {/* Active Customers */}
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 relative overflow-hidden group hover:border-zinc-500/40 transition">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Customers</div>
            <User className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
          <div className="text-2xl font-black font-mono text-[var(--text-primary)] mt-2">
            {data.summary.total_customers_count}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
            Avg Spend: ₹{data.summary.avg_spend_per_customer.toFixed(2)} / cust
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[var(--bg-surface-elevated)] p-3 rounded-xl border border-[var(--border-strong)]">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by customer name or phone..."
              value={tableSearchQuery}
              onChange={(e) => setTableSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-emerald-500"
            />
            {tableSearchQuery && (
              <button
                type="button"
                onClick={() => setTableSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1 text-xs rounded-full font-bold transition cursor-pointer ${
              filterMode === "all"
                ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]"
            }`}
          >
            All Customers ({data.customers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("active")}
            className={`px-3 py-1 text-xs rounded-full font-bold transition cursor-pointer ${
              filterMode === "active"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-emerald-400 border border-[var(--border-subtle)]"
            }`}
          >
            Spenders Only ({data.customers.filter((c) => c.total_spent > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("returns_only")}
            className={`px-3 py-1 text-xs rounded-full font-bold transition cursor-pointer ${
              filterMode === "returns_only"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-rose-400 border border-[var(--border-subtle)]"
            }`}
          >
            With Returns ({data.customers.filter((c) => c.total_returns_count > 0).length})
          </button>
        </div>
      </div>

      {/* Customer Spends Table */}
      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="p-3 w-8"></th>
                <SortableHeader label="Customer" columnKey="customer_name" sortConfig={sortConfig} handleSort={handleSort} className="!p-3" />
                <SortableHeader label="Orders" columnKey="total_orders" sortConfig={sortConfig} handleSort={handleSort} className="!p-3 text-center" />
                <SortableHeader label="Total Spent" columnKey="total_spent" sortConfig={sortConfig} handleSort={handleSort} className="!p-3 text-right" />
                <SortableHeader label="Returns" columnKey="total_returned_amount" sortConfig={sortConfig} handleSort={handleSort} className="!p-3 text-right" />
                <SortableHeader label="Net Spent" columnKey="net_spent" sortConfig={sortConfig} handleSort={handleSort} className="!p-3 text-right" />
                <SortableHeader label="Avg Order" columnKey="avg_order_value" sortConfig={sortConfig} handleSort={handleSort} className="!p-3 text-right" />
                <SortableHeader label="Last Activity" columnKey="last_activity_date" sortConfig={sortConfig} handleSort={handleSort} className="!p-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[var(--text-muted)]">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <User className="w-8 h-8 opacity-30" />
                      <span>{tableSearchQuery ? "No matching customers found." : "No customer activity found for this period."}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => {
                  const customerKey = c.customer_phone || c.customer_id || c.customer_name;
                  const isExpanded = expandedCustomerId === customerKey;

                  return (
                    <React.Fragment key={customerKey}>
                      <tr
                        onClick={() => setExpandedCustomerId(isExpanded ? null : customerKey)}
                        className={`hover:bg-[var(--bg-surface)] cursor-pointer transition select-none ${
                          isExpanded ? "bg-[var(--bg-surface)]" : ""
                        }`}
                      >
                        <td className="p-3 text-[var(--text-muted)]">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-emerald-400 transition-transform" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] hover:text-emerald-400 transition-transform" />
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                              {c.customer_name?.slice(0, 1).toUpperCase() || <User className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                {c.customer_name}
                                {typeof c.credit_balance === "number" && c.credit_balance !== 0 && (
                                  <span
                                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                                      c.credit_balance > 0
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    }`}
                                    title="Store Balance"
                                  >
                                    Bal: {c.credit_balance > 0 ? `+₹${c.credit_balance.toFixed(0)}` : `-₹${Math.abs(c.credit_balance).toFixed(0)}`}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5" />
                                {c.customer_phone || "Walk-in Customer"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-mono font-bold px-2 py-0.5 rounded-full text-[11px] bg-zinc-500/10 text-[var(--text-primary)] border border-zinc-500/20">
                            {c.total_orders}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">
                          ₹{c.total_spent.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-rose-400">
                          {c.total_returned_amount > 0 ? `-₹${c.total_returned_amount.toFixed(2)}` : "₹0.00"}
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                              c.net_spent > 0
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                : c.net_spent < 0
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "text-[var(--text-muted)]"
                            }`}
                          >
                            ₹{c.net_spent.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                          ₹{c.avg_order_value.toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-[10px] text-[var(--text-muted)] font-mono">
                          {c.last_activity_date ? parseUTCDate(c.last_activity_date).toLocaleString() : "Never"}
                        </td>
                      </tr>

                      {/* Expandable Ledger View */}
                      {isExpanded && (
                        <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-strong)]">
                          <td colSpan={8} className="p-0">
                            <div className="p-4 sm:pl-12 space-y-4">
                              {/* Sub-header inside expansion */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface-elevated)] p-3 rounded-xl border border-[var(--border-subtle)]">
                                <div className="flex items-center gap-3">
                                  <div className="text-xs font-bold text-[var(--text-primary)]">
                                    {c.customer_name} &bull; Activity History
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-bold border border-emerald-500/20">
                                      {c.orders.length} Spends
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono font-bold border border-rose-500/20">
                                      {c.returns.length} Returns
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* Tab toggles */}
                                  <div className="flex items-center rounded-lg bg-[var(--bg-surface)] p-0.5 border border-[var(--border-subtle)] text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedCustomerTab("all")}
                                      className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                                        expandedCustomerTab === "all" ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                      }`}
                                    >
                                      All ({c.orders.length + c.returns.length})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedCustomerTab("orders")}
                                      className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                                        expandedCustomerTab === "orders" ? "bg-emerald-600 text-white" : "text-[var(--text-muted)] hover:text-emerald-400"
                                      }`}
                                    >
                                      Spends ({c.orders.length})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedCustomerTab("returns")}
                                      className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                                        expandedCustomerTab === "returns" ? "bg-rose-600 text-white" : "text-[var(--text-muted)] hover:text-rose-400"
                                      }`}
                                    >
                                      Returns ({c.returns.length})
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleExportCustomerHistoryCsv(c)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition cursor-pointer"
                                    title="Export this customer's activity to CSV"
                                  >
                                    <Download className="w-3.5 h-3.5 text-sky-400" />
                                    <span>Statement CSV</span>
                                  </button>
                                </div>
                              </div>

                              {/* Detailed Table */}
                              <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface-elevated)]">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                                    <tr>
                                      <th className="p-2.5">Date & Time</th>
                                      <th className="p-2.5">Type</th>
                                      <th className="p-2.5">Reference / Bill</th>
                                      <th className="p-2.5">Details</th>
                                      <th className="p-2.5 text-right">Amount (₹)</th>
                                      <th className="p-2.5">Payment</th>
                                      <th className="p-2.5 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border-subtle)] text-[11px]">
                                    {c.orders.length === 0 && c.returns.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="p-6 text-center text-[var(--text-muted)]">
                                          No transactions recorded in this date range.
                                        </td>
                                      </tr>
                                    ) : (
                                      <>
                                        {/* Orders */}
                                        {(expandedCustomerTab === "all" || expandedCustomerTab === "orders") &&
                                          c.orders.map((o) => (
                                            <tr key={o.order_id} className="hover:bg-[var(--bg-surface)] transition">
                                              <td className="p-2.5 font-mono text-[var(--text-muted)]">
                                                {parseUTCDate(o.created_at).toLocaleString()}
                                              </td>
                                              <td className="p-2.5">
                                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                  SPEND
                                                </span>
                                              </td>
                                              <td className="p-2.5 font-mono font-bold text-sky-400">
                                                {formatBillLabel(o.order_id, o.basket_number)}
                                              </td>
                                              <td className="p-2.5 text-[var(--text-secondary)]">
                                                <div className="flex items-center gap-1.5">
                                                  <Package className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                                  <span>{o.items_count} items</span>
                                                  {o.discount_value && o.discount_value > 0 ? (
                                                    <span className="text-[10px] text-amber-400 font-mono">
                                                      (Disc: ₹{o.discount_value.toFixed(2)})
                                                    </span>
                                                  ) : null}
                                                </div>
                                              </td>
                                              <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                                                ₹{o.total_amount.toFixed(2)}
                                              </td>
                                              <td className="p-2.5">
                                                <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                                                  {o.payment_method || "CASH"}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-center">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenBillView(o.order_id);
                                                  }}
                                                  disabled={fetchingBillId === o.order_id}
                                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                                                >
                                                  {fetchingBillId === o.order_id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                  ) : (
                                                    <Eye className="w-3 h-3" />
                                                  )}
                                                  <span>View Bill</span>
                                                </button>
                                              </td>
                                            </tr>
                                          ))}

                                        {/* Returns */}
                                        {(expandedCustomerTab === "all" || expandedCustomerTab === "returns") &&
                                          c.returns.map((r) => {
                                            const itemsCount = (r.returned_items || []).length;
                                            return (
                                              <tr key={r.return_id} className="hover:bg-[var(--bg-surface)] transition">
                                                <td className="p-2.5 font-mono text-[var(--text-muted)]">
                                                  {parseUTCDate(r.created_at).toLocaleString()}
                                                </td>
                                                <td className="p-2.5">
                                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                    RETURN
                                                  </span>
                                                </td>
                                                <td className="p-2.5 font-mono font-bold text-rose-400">
                                                  {r.return_number}
                                                </td>
                                                <td className="p-2.5 text-[var(--text-secondary)]">
                                                  <div className="space-y-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                      <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                                                      <span className="font-semibold text-[var(--text-primary)]">
                                                        {itemsCount > 0 ? `${itemsCount} items returned` : "Return entry"}
                                                      </span>
                                                    </div>
                                                    {r.returned_items && r.returned_items.length > 0 && (
                                                      <div className="text-[10px] text-[var(--text-muted)] truncate max-w-xs">
                                                        {r.returned_items
                                                          .map((it: any) => `${it.item_name || "Item"} (${it.quantity || 1} ${it.selected_unit || "pc"})`)
                                                          .join(", ")}
                                                      </div>
                                                    )}
                                                    {r.notes && (
                                                      <div className="text-[9px] text-amber-400/80 italic">
                                                        Note: {r.notes}
                                                      </div>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="p-2.5 text-right font-mono font-bold text-rose-400">
                                                  -₹{r.total_refund_amount.toFixed(2)}
                                                </td>
                                                <td className="p-2.5">
                                                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                                                    {r.refund_payment_method || "CASH"}
                                                  </span>
                                                </td>
                                                <td className="p-2.5 text-center">
                                                  {r.order_id ? (
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenBillView(r.order_id!);
                                                      }}
                                                      disabled={fetchingBillId === r.order_id}
                                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                                                      title="View Original Bill"
                                                    >
                                                      <Receipt className="w-3 h-3 text-emerald-400" />
                                                      <span>Orig Bill</span>
                                                    </button>
                                                  ) : (
                                                    <span className="text-[10px] text-[var(--text-muted)]">—</span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                      </>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill Details Modal */}
      {selectedBillForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-emerald-400" />
                  <span>Bill Details</span>
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Order ID: <span className="font-mono">{selectedBillForView.orderId}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {selectedBillForView.loading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
                  <span className="text-xs text-[var(--text-muted)]">Loading bill receipt...</span>
                </div>
              )}

              {selectedBillForView.error && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-400">
                  {selectedBillForView.error}
                </div>
              )}

              {selectedBillForView.detail && (
                <div className="space-y-4">
                  {/* Bill Summary Strip */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-subtle)]">
                    <div>
                      <span className="text-[var(--text-muted)]">Bill Number:</span>
                      <span className="ml-1 font-mono font-bold text-[var(--text-primary)]">
                        {selectedBillForView.detail.basket_number}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Status:</span>
                      <span className="ml-1 font-bold text-emerald-400 uppercase">
                        {selectedBillForView.detail.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Payment Mode:</span>
                      <span className="ml-1 font-mono text-[var(--text-primary)]">
                        {selectedBillForView.detail.payment_method || "CASH"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Date:</span>
                      <span className="ml-1 font-mono text-[var(--text-primary)]">
                        {parseUTCDate(selectedBillForView.detail.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--bg-surface)] text-[10px] uppercase font-bold text-[var(--text-muted)]">
                        <tr>
                          <th className="p-2.5 text-left">Item</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Price</th>
                          <th className="p-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {selectedBillForView.detail.items?.map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--bg-surface)]">
                            <td className="p-2.5 font-medium text-[var(--text-primary)]">
                              {it.menu_item_name || it.item_name || "Item"}
                            </td>
                            <td className="p-2.5 text-center font-mono">
                              {it.quantity} {it.selected_unit || "pc"}
                            </td>
                            <td className="p-2.5 text-right font-mono text-[var(--text-muted)]">
                              ₹{(it.unit_price || 0).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-[var(--text-primary)]">
                              ₹{(it.total_price || (it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Total Calculations */}
                  <div className="rounded-xl bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)] space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>Subtotal:</span>
                      <span>₹{(selectedBillForView.detail.subtotal_amount || 0).toFixed(2)}</span>
                    </div>
                    {selectedBillForView.detail.discount_value ? (
                      <div className="flex justify-between text-amber-400">
                        <span>Discount:</span>
                        <span>-₹{selectedBillForView.detail.discount_value.toFixed(2)}</span>
                      </div>
                    ) : null}
                    {selectedBillForView.detail.tax_amount ? (
                      <div className="flex justify-between text-[var(--text-muted)]">
                        <span>Taxes:</span>
                        <span>₹{selectedBillForView.detail.tax_amount.toFixed(2)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-[var(--border-subtle)] text-emerald-400">
                      <span>Total Amount:</span>
                      <span>₹{selectedBillForView.detail.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleViewReceiptPdf}
                disabled={!selectedBillForView.detail}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition cursor-pointer disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Receipt</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadReceiptPdf}
                disabled={!selectedBillForView.detail}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Bill</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadInvoicePdf}
                disabled={!selectedBillForView.detail}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Invoice</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
