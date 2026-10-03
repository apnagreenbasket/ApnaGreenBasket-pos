import React, { useState, useEffect } from "react";
import {
  Truck,
  Package,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Receipt,
  Eye,
  Printer,
  X,
  FileText,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Coins,
  Layers,
  ArrowUpDown
} from "lucide-react";
import {
  ServiceChargesSummaryResponse,
  ServiceChargeBillRow,
  ManualBill
} from "@/types";
import { getApiBaseUrl } from "@/lib/api";
import { apiRequest, parseUTCDate } from "../../adminUtils";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { RestaurantProfile } from "../../adminTypes";

type ChargeFilterType = "ALL_CHARGES" | "HANDLING_ONLY" | "DELIVERY_ONLY" | "BOTH" | "ZERO_CHARGES" | "ALL_BILLS";

type Props = {
  isLoading?: boolean;
  fromDate?: string;
  toDate?: string;
  datePreset?: string;
  restaurant?: RestaurantProfile | null;
};

export function ServiceChargesReport({ isLoading = false, fromDate, toDate, datePreset, restaurant }: Props) {
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // ── Service Charges Register State ──────────────────────────────────────────
  const [chargeFilter, setChargeFilter] = useState<ChargeFilterType>("ALL_CHARGES");
  const [reportData, setReportData] = useState<ServiceChargesSummaryResponse | null>(null);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [billsPage, setBillsPage] = useState(1);
  const [selectedBillForView, setSelectedBillForView] = useState<{
    summary: ServiceChargeBillRow;
    detail: ManualBill | null;
    loading: boolean;
    error?: string | null;
  } | null>(null);
  const [fetchingOrderId, setFetchingOrderId] = useState<string | null>(null);

  // Reset page when dates or preset change
  useEffect(() => {
    setBillsPage(1);
  }, [fromDate, toDate, datePreset]);

  // Load service charges summary & bills register
  useEffect(() => {
    let isCancelled = false;
    const loadBills = async () => {
      setIsLoadingBills(true);
      setLoadError(null);
      try {
        const queryParams: string[] = [
          `charge_filter=${chargeFilter}`,
          `limit=50`,
          `offset=${(billsPage - 1) * 50}`,
        ];
        if (fromDate) queryParams.push(`from_date=${encodeURIComponent(fromDate)}`);
        if (toDate) queryParams.push(`to_date=${encodeURIComponent(toDate)}`);
        const res = await apiRequest<ServiceChargesSummaryResponse>(
          `/api/analytics/service-charges-summary?${queryParams.join("&")}`
        );
        if (!isCancelled) {
          setReportData(res);
        }
      } catch (err: any) {
        console.error("Failed to load service charges summary:", err);
        if (!isCancelled) {
          setLoadError(err.message || "Failed to load service charges summary");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingBills(false);
        }
      }
    };
    loadBills();
    return () => {
      isCancelled = true;
    };
  }, [fromDate, toDate, chargeFilter, billsPage, datePreset]);

  // Open detailed bill view modal
  const handleOpenBillView = async (bill: ServiceChargeBillRow) => {
    setFetchingOrderId(bill.order_id);
    setSelectedBillForView({
      summary: bill,
      detail: null,
      loading: true,
      error: null,
    });
    try {
      const detail = await apiRequest<ManualBill>(`/api/billing/bills/${bill.order_id}`);
      setSelectedBillForView({
        summary: bill,
        detail,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setSelectedBillForView({
        summary: bill,
        detail: null,
        loading: false,
        error: err.message || "Failed to load bill details",
      });
    } finally {
      setFetchingOrderId(null);
    }
  };

  const handlePrintReceipt = (billDetail: ManualBill, billSummary: ServiceChargeBillRow) => {
    try {
      generateReceiptPDF(
        billDetail as any,
        restaurant?.name || "ApnaGreen Basket",
        undefined,
        restaurant || {},
        "view"
      );
    } catch (e) {
      console.error("Print receipt error:", e);
      alert("Failed to generate thermal receipt.");
    }
  };

  const handleDownloadA4 = (billDetail: ManualBill, billSummary: ServiceChargeBillRow) => {
    try {
      generateA4InvoicePDF(
        billDetail as any,
        restaurant?.name || "ApnaGreen Basket",
        undefined,
        restaurant || {}
      );
    } catch (e) {
      console.error("Download invoice error:", e);
      alert("Failed to download A4 invoice.");
    }
  };

  // Export current list to CSV
  const handleExportCsv = async () => {
    try {
      setIsExportingCsv(true);
      // Fetch up to 500 rows for complete export
      const queryParams: string[] = [
        `charge_filter=${chargeFilter}`,
        `limit=500`,
        `offset=0`,
      ];
      if (fromDate) queryParams.push(`from_date=${encodeURIComponent(fromDate)}`);
      if (toDate) queryParams.push(`to_date=${encodeURIComponent(toDate)}`);
      const exportRes = await apiRequest<ServiceChargesSummaryResponse>(
        `/api/analytics/service-charges-summary?${queryParams.join("&")}`
      );

      const rows = [
        [
          "Bill #",
          "Invoice No",
          "Date & Time",
          "Customer Name",
          "Customer Phone",
          "Tender",
          "Items Count",
          "Subtotal (₹)",
          "Delivery/Service Charge (₹)",
          "Handling Charge (₹)",
          "Total Charges (₹)",
          "Discount (₹)",
          "Net Bill Total (₹)",
        ],
        ...exportRes.bills.map((b) => [
          `"${b.basket_number || b.order_id.slice(0, 8)}"`,
          `"${b.invoice_no || ""}"`,
          `"${parseUTCDate(b.created_at).toLocaleString("en-IN")}"`,
          `"${(b.customer_name || "").replace(/"/g, '""')}"`,
          `"${b.customer_phone || ""}"`,
          `"${b.payment_method || "CASH"}"`,
          b.items_count,
          b.subtotal_amount.toFixed(2),
          b.delivery_charge.toFixed(2),
          b.handling_charge.toFixed(2),
          b.total_charges.toFixed(2),
          b.discount_amount.toFixed(2),
          b.total_amount.toFixed(2),
        ]),
      ];

      const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      const dateRangeStr = fromDate ? `${fromDate.slice(0, 10)}_to_${toDate ? toDate.slice(0, 10) : "today"}` : "full_period";
      link.setAttribute("download", `Service_Charges_Audit_${dateRangeStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("CSV export error:", err);
      alert(err.message || "Failed to export CSV report");
    } finally {
      setIsExportingCsv(false);
    }
  };

  if (isLoading && !reportData) {
    return (
      <div className="p-8 text-center text-[var(--text-secondary)]">
        <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2 opacity-50" />
        Loading service &amp; handling charges reports...
      </div>
    );
  }

  const d = reportData;

  return (
    <div className="space-y-6">
      {/* Header & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              Service &amp; Handling Charges
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-400 border border-indigo-500/30">
                <ShieldCheck className="h-3 w-3" /> Audit Ready
              </span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Audit register of delivery fees, packaging &amp; handling surcharges collected across customer orders
            </p>
          </div>
        </div>

        {/* 1-Click CSV Audit Export */}
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isExportingCsv || !reportData || reportData.bills.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
          title="Export service and handling charges register to CSV for audits and accounting"
        >
          {isExportingCsv ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Exporting Audit CSV...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" />
              <span>Download Service Report (.csv)</span>
            </>
          )}
        </button>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Delivery / Service</p>
          <p className="mt-2 text-2xl font-black font-mono text-indigo-400">
            ₹{d ? d.total_delivery_charges.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Handling Charges</p>
          <p className="mt-2 text-2xl font-black font-mono text-cyan-400">
            ₹{d ? d.total_handling_charges.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Combined Surcharges</p>
          <p className="mt-2 text-2xl font-black font-mono text-purple-400">
            ₹{d ? d.total_combined_charges.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Bills With Charges</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-2xl font-black font-mono text-emerald-400">
              {d ? d.bills_with_charges_count : 0}
            </p>
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {d && d.total_bills > 0
                ? `${((d.bills_with_charges_count / d.total_bills) * 100).toFixed(1)}% of bills`
                : "0%"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Service & Handling Bills Register ──────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                Service &amp; Handling Bills Register
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                  Charges Applied &gt; 0
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Aggregates bills where delivery fee, packaging surcharge, or both were billed to the customer
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold self-start lg:self-auto flex-wrap">
            <button
              type="button"
              onClick={() => { setChargeFilter("ALL_CHARGES"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                chargeFilter === "ALL_CHARGES"
                  ? "bg-indigo-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Bills with Charges</span>
              {d && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {d.bills_with_charges_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChargeFilter("HANDLING_ONLY"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                chargeFilter === "HANDLING_ONLY"
                  ? "bg-cyan-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Handling Only</span>
              {d && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {d.handling_only_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChargeFilter("DELIVERY_ONLY"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                chargeFilter === "DELIVERY_ONLY"
                  ? "bg-blue-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Delivery Only</span>
              {d && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {d.delivery_only_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChargeFilter("BOTH"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                chargeFilter === "BOTH"
                  ? "bg-purple-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Both Applied</span>
              {d && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {d.both_charges_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChargeFilter("ZERO_CHARGES"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                chargeFilter === "ZERO_CHARGES"
                  ? "bg-zinc-700 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Zero Charges</span>
              {d && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {d.zero_charges_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChargeFilter("ALL_BILLS"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                chargeFilter === "ALL_BILLS"
                  ? "bg-emerald-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>All Settled Bills</span>
              {d && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {d.total_bills}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        {d && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Charged Bills Count</p>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="text-xl font-black font-mono text-[var(--text-primary)]">
                  {d.bills_with_charges_count}
                </p>
                <span className="text-[10px] font-semibold text-indigo-400">
                  {d.total_bills > 0
                    ? `${((d.bills_with_charges_count / d.total_bills) * 100).toFixed(1)}% of bills`
                    : "0%"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Charged Bills Turnover</p>
              <p className="mt-1 text-xl font-black font-mono text-[var(--text-primary)]">
                ₹{d.bills_with_charges_turnover.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">Gross Customer Billing</span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Base Items Subtotal</p>
              <p className="mt-1 text-xl font-black font-mono text-[var(--text-primary)]">
                ₹{d.bills_with_charges_subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">Net Goods excl. charges</span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-purple-400">Total Surcharges</p>
              <p className="mt-1 text-xl font-black font-mono text-purple-400">
                ₹{d.total_combined_charges.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">
                Delivery ₹{d.total_delivery_charges.toFixed(0)} | Handling ₹{d.total_handling_charges.toFixed(0)}
              </span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Zero-Charge Bills</p>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="text-xl font-black font-mono text-zinc-400">
                  {d.zero_charges_count}
                </p>
                <span className="text-xs font-mono font-bold text-zinc-400">
                  ₹{d.zero_charges_turnover.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">Produce &amp; Store Walk-in</span>
            </div>
          </div>
        )}

        {/* Bills Table */}
        <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
                <tr>
                  <th className="px-4 py-3">Bill #</th>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-3 py-3 text-center">Tender</th>
                  <th className="px-3 py-3 text-center">Items</th>
                  <th className="px-4 py-3 text-right">Subtotal (₹)</th>
                  <th className="px-3 py-3 text-right text-indigo-400">Delivery/Service</th>
                  <th className="px-3 py-3 text-right text-cyan-400">Handling</th>
                  <th className="px-4 py-3 text-right font-bold text-purple-400">Total Charges</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Bill Total</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {isLoadingBills ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-50 text-indigo-400" />
                      Loading service charges register...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-xs text-rose-400 font-sans">
                      <AlertCircle className="mx-auto h-6 w-6 mb-2 opacity-70 text-rose-400" />
                      <p className="font-semibold">{loadError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setBillsPage((p) => p);
                          setIsLoadingBills(true);
                        }}
                        className="mt-2 text-xs text-indigo-400 hover:underline cursor-pointer"
                      >
                        Try again
                      </button>
                    </td>
                  </tr>
                ) : !d || d.bills.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                      <Truck className="mx-auto h-6 w-6 mb-2 opacity-30" />
                      No bills match the selected service charge filter for this date range.
                    </td>
                  </tr>
                ) : (
                  d.bills.map((b) => (
                    <tr key={b.order_id} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-4 py-3 font-bold text-indigo-400">
                        {b.basket_number || b.order_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] font-sans">
                        {parseUTCDate(b.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-sans truncate max-w-[150px]">
                        {b.customer_name || (b.customer_phone ? `+91 ${b.customer_phone}` : "Walk-in Guest")}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-bold border border-[var(--border-subtle)]">
                          {b.payment_method || "CASH"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-[var(--text-muted)]">{b.items_count}</td>
                      <td className="px-4 py-3 text-right">₹{b.subtotal_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-indigo-400 font-semibold">
                        {b.delivery_charge > 0 ? (
                          <span>₹{b.delivery_charge.toFixed(2)}</span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] font-normal">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-cyan-400 font-semibold">
                        {b.handling_charge > 0 ? (
                          <span>₹{b.handling_charge.toFixed(2)}</span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] font-normal">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-purple-400">
                        {b.total_charges > 0 ? (
                          <span>₹{b.total_charges.toFixed(2)}</span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] font-normal">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">
                        ₹{b.total_amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center font-sans">
                        <button
                          type="button"
                          onClick={() => handleOpenBillView(b)}
                          disabled={fetchingOrderId === b.order_id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-indigo-600 hover:text-white border border-[var(--border-subtle)] text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          {fetchingOrderId === b.order_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {d && d.bills.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
              <span>
                Showing page {billsPage} ({d.bills.length} bills)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBillsPage((p) => Math.max(1, p - 1))}
                  disabled={billsPage <= 1}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] disabled:opacity-40 cursor-pointer font-semibold"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setBillsPage((p) => p + 1)}
                  disabled={d.bills.length < 50}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] disabled:opacity-40 cursor-pointer font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bill Detail & Receipt Modal ────────────────────────────────────── */}
      {selectedBillForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                    Bill #{selectedBillForView.summary.basket_number || selectedBillForView.summary.order_id.slice(0, 8)}
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {parseUTCDate(selectedBillForView.summary.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-4 sm:p-5 space-y-4 flex-1">
              {selectedBillForView.loading ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2 opacity-60 text-indigo-400" />
                  Fetching complete bill items and charges breakdown...
                </div>
              ) : selectedBillForView.error ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-400">
                  <AlertCircle className="h-4 w-4 inline mr-1.5" />
                  {selectedBillForView.error}
                </div>
              ) : (
                <>
                  {/* Bill Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Customer</p>
                      <p className="text-xs font-semibold mt-0.5 truncate text-[var(--text-primary)]">
                        {selectedBillForView.summary.customer_name || (selectedBillForView.summary.customer_phone ? `+91 ${selectedBillForView.summary.customer_phone}` : "Guest")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Payment Mode</p>
                      <p className="text-xs font-bold font-mono mt-0.5 text-emerald-400">
                        {selectedBillForView.summary.payment_method || "CASH"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <p className="text-[10px] uppercase font-bold text-indigo-400">Delivery/Service</p>
                      <p className="text-xs font-bold font-mono mt-0.5 text-indigo-400">
                        ₹{selectedBillForView.summary.delivery_charge.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <p className="text-[10px] uppercase font-bold text-cyan-400">Handling Fee</p>
                      <p className="text-xs font-bold font-mono mt-0.5 text-cyan-400">
                        ₹{selectedBillForView.summary.handling_charge.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="px-4 py-2 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] font-bold text-xs text-[var(--text-secondary)]">
                      Billed Items
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[var(--border-subtle)] font-semibold text-[var(--text-muted)] bg-[var(--bg-surface)]">
                        <tr>
                          <th className="px-3 py-2 text-center w-8">#</th>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-2 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {selectedBillForView.detail?.items?.map((it, idx) => {
                          const qty = Number(it.quantity) || 1;
                          const rate = Number(it.unit_price) || 0;
                          const lineTot = Number(it.line_total) || (rate * qty);

                          return (
                            <tr key={it.id || idx} className="hover:bg-[var(--bg-surface-elevated)]/40 transition">
                              <td className="px-3 py-2 text-center text-[var(--text-muted)] font-mono">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                                {it.item_name}
                              </td>
                              <td className="px-2 py-2 text-right font-medium">
                                {qty.toFixed(2)} {it.selected_unit || "pcs"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">₹{rate.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-[var(--text-primary)]">
                                ₹{lineTot.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals Summary */}
                  <div className="flex justify-end p-1">
                    <div className="w-full sm:w-64 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between text-[var(--text-secondary)]">
                        <span>Items Subtotal:</span>
                        <span>₹{Number(selectedBillForView.detail?.subtotal_amount || 0).toFixed(2)}</span>
                      </div>
                      {(selectedBillForView.detail?.discount_value ?? 0) > 0 && (
                        <div className="flex justify-between text-amber-500 font-medium">
                          <span>Bill Discount:</span>
                          <span>-₹{Number(selectedBillForView.detail?.discount_value).toFixed(2)}</span>
                        </div>
                      )}
                      {(selectedBillForView.detail?.loyalty_discount_inr ?? 0) > 0 && (
                        <div className="flex justify-between text-sky-400 font-medium">
                          <span>Loyalty Redeemed:</span>
                          <span>-₹{Number(selectedBillForView.detail?.loyalty_discount_inr).toFixed(2)}</span>
                        </div>
                      )}
                      {(selectedBillForView.summary.delivery_charge > 0) && (
                        <div className="flex justify-between text-indigo-400">
                          <span>Delivery/Service Charge:</span>
                          <span>+₹{selectedBillForView.summary.delivery_charge.toFixed(2)}</span>
                        </div>
                      )}
                      {(selectedBillForView.summary.handling_charge > 0) && (
                        <div className="flex justify-between text-cyan-400">
                          <span>Handling Charge:</span>
                          <span>+₹{selectedBillForView.summary.handling_charge.toFixed(2)}</span>
                        </div>
                      )}
                      {selectedBillForView.summary.total_charges > 0 && (
                        <div className="flex justify-between text-purple-400 pt-1 border-t border-[var(--border-subtle)] font-bold">
                          <span>Total Charges Applied:</span>
                          <span>+₹{selectedBillForView.summary.total_charges.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-[var(--border-strong)] pt-1 text-sm font-bold text-[var(--text-primary)]">
                        <span>Net Paid:</span>
                        <span className="text-emerald-400">₹{Number(selectedBillForView.detail?.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer with Actions */}
            {selectedBillForView.detail && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
                <span className="text-xs text-[var(--text-muted)]">
                  Print thermal receipt or export A4 invoice with applied charges
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintReceipt(selectedBillForView.detail!, selectedBillForView.summary)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-surface-elevated)] text-xs font-bold transition cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print Thermal Receipt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadA4(selectedBillForView.detail!, selectedBillForView.summary)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Download A4 Invoice</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
