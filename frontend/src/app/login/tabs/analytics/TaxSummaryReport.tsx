import React, { useState, useEffect } from "react";
import {
  Calculator,
  Landmark,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Layers,
  Receipt,
  Eye,
  Printer,
  X,
  FileText,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  ShoppingBag
} from "lucide-react";
import {
  TaxSummaryResponse,
  Gstr1HsnSummaryResponse,
  Gstr1HsnItem,
  TaxableBillsResponse,
  TaxableBillRow,
  ManualBill
} from "@/types";
import { getApiBaseUrl } from "@/lib/api";
import { apiRequest, parseUTCDate } from "../../adminUtils";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { RestaurantProfile } from "../../adminTypes";

type Props = {
  data: TaxSummaryResponse | null;
  gstr1Data?: Gstr1HsnSummaryResponse | null;
  isLoading: boolean;
  fromDate?: string;
  toDate?: string;
  restaurant?: RestaurantProfile | null;
};

export function TaxSummaryReport({ data, gstr1Data, isLoading, fromDate, toDate, restaurant }: Props) {
  const [isDownloadingCaReport, setIsDownloadingCaReport] = useState(false);

  // ── Taxable Bills Register State ──────────────────────────────────────────
  const [gstFilter, setGstFilter] = useState<"TAXABLE" | "ZERO_GST" | "ALL">("TAXABLE");
  const [taxableBillsData, setTaxableBillsData] = useState<TaxableBillsResponse | null>(null);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [billsPage, setBillsPage] = useState(1);
  const [selectedBillForView, setSelectedBillForView] = useState<{
    summary: TaxableBillRow;
    detail: ManualBill | null;
    loading: boolean;
    error?: string | null;
  } | null>(null);
  const [fetchingOrderId, setFetchingOrderId] = useState<string | null>(null);

  // Load taxable bills register
  useEffect(() => {
    let isCancelled = false;
    const loadBills = async () => {
      setIsLoadingBills(true);
      try {
        const queryParams: string[] = [`gst_filter=${gstFilter}`, `limit=50`, `offset=${(billsPage - 1) * 50}`];
        if (fromDate) queryParams.push(`from_date=${encodeURIComponent(fromDate)}`);
        if (toDate) queryParams.push(`to_date=${encodeURIComponent(toDate)}`);
        const res = await apiRequest<TaxableBillsResponse>(`/api/analytics/taxable-bills-summary?${queryParams.join("&")}`);
        if (!isCancelled) {
          setTaxableBillsData(res);
        }
      } catch (err) {
        console.error("Failed to load taxable bills summary:", err);
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
  }, [fromDate, toDate, gstFilter, billsPage]);

  // Open detailed bill view modal
  const handleOpenBillView = async (bill: TaxableBillRow) => {
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

  const handlePrintReceipt = (billDetail: ManualBill, billSummary: TaxableBillRow) => {
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

  const handleDownloadA4 = (billDetail: ManualBill, billSummary: TaxableBillRow) => {
    try {
      generateA4InvoicePDF(
        billDetail as any,
        restaurant?.name || "ApnaGreen Basket",
        undefined,
        restaurant || {}
      );
    } catch (e) {
      console.error("Download invoice error:", e);
      alert("Failed to download A4 tax invoice.");
    }
  };

  const handleDownloadCaExcel = async () => {
    try {
      setIsDownloadingCaReport(true);
      const apiBase = getApiBaseUrl();
      const token = typeof window !== "undefined"
        ? (localStorage.getItem("agb_access_token") || localStorage.getItem("admin_access_token") || localStorage.getItem("token"))
        : null;
      let url = `${apiBase}/api/analytics/ca-export`;
      const queryParams: string[] = [];
      if (fromDate) queryParams.push(`from_date=${encodeURIComponent(fromDate)}`);
      if (toDate) queryParams.push(`to_date=${encodeURIComponent(toDate)}`);
      if (queryParams.length > 0) url += `?${queryParams.join("&")}`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let errMsg = "Failed to generate CA audit report";
        try {
          const errJson = await res.json();
          errMsg = errJson.detail || errMsg;
        } catch {
          try {
            const errText = await res.text();
            if (errText) errMsg = errText;
          } catch {}
        }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const fNameDate = fromDate ? `${fromDate.slice(0, 10)}_to_${toDate ? toDate.slice(0, 10) : "today"}` : "full_period";
      a.download = `GST_CA_Audit_Report_${fNameDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error("CA export download error:", err);
      alert(err.message || "Failed to download CA audit report.");
    } finally {
      setIsDownloadingCaReport(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-[var(--text-secondary)]">Loading tax summary &amp; GSTR-1 compliance reports...</div>;
  }
  if (!data) return null;

  const hsnItems: Gstr1HsnItem[] = gstr1Data?.items || [];
  const totalHsnTaxable = gstr1Data?.total_taxable_value ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.taxable_value || 0), 0);
  const totalHsnValue = gstr1Data?.total_value ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.total_value || 0), 0);
  const totalHsnIgst = gstr1Data?.total_igst ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.igst_amount || 0), 0);
  const totalHsnCgst = gstr1Data?.total_cgst ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.cgst_amount || 0), 0);
  const totalHsnSgst = gstr1Data?.total_sgst ?? hsnItems.reduce((sum: number, it: Gstr1HsnItem) => sum + (it.sgst_amount || 0), 0);
  const totalHsnTax = totalHsnIgst + totalHsnCgst + totalHsnSgst;

  return (
    <div className="space-y-6">
      {/* Header & 1-Click CA Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              Tax Summary &amp; GST Compliance
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="h-3 w-3" /> GSTR-1 Ready
              </span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Statutory GST collections, Table 12 HSN summaries, and Chartered Accountant audit downloads
            </p>
          </div>
        </div>

        {/* 1-Click CA GST Excel Export */}
        <button
          type="button"
          onClick={handleDownloadCaExcel}
          disabled={isDownloadingCaReport}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
          title="Download multi-sheet GST report formatted for CA and GST Portal upload (Table 12 HSN, GSTR-3B, B2B Register, B2C Summary)"
        >
          {isDownloadingCaReport ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating CA Report...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" />
              <span>Download CA GST Excel Report (.xlsx)</span>
            </>
          )}
        </button>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Taxable Value</p>
          <p className="mt-2 text-2xl font-black font-mono text-[var(--text-primary)]">₹{data.total_taxable_amount.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Tax Collected</p>
          <p className="mt-2 text-2xl font-black font-mono text-purple-400">₹{data.total_tax_collected.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Central + State (CGST + SGST)</p>
          <p className="mt-2 text-2xl font-black font-mono text-cyan-400">
            ₹{(totalHsnCgst + totalHsnSgst > 0 ? (totalHsnCgst + totalHsnSgst) : data.total_tax_collected).toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Inter-State (IGST)</p>
          <p className="mt-2 text-2xl font-black font-mono text-amber-400">₹{totalHsnIgst.toFixed(2)}</p>
        </div>
      </div>

      {/* ── 1. GST Taxable Bills Register (Bills with GST Paid > 0) ─────────── */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                GST Taxable Bills Register
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
                  GST Paid &gt; 0
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Aggregates bills that generated statutory GST liability (FMCG &amp; Packaged Goods) vs. Zero-GST bills (Fresh Produce &amp; Staples)
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold self-start lg:self-auto">
            <button
              type="button"
              onClick={() => { setGstFilter("TAXABLE"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                gstFilter === "TAXABLE"
                  ? "bg-purple-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Taxable Bills (GST &gt; 0)</span>
              {taxableBillsData && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {taxableBillsData.taxable_bills_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setGstFilter("ZERO_GST"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                gstFilter === "ZERO_GST"
                  ? "bg-zinc-700 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>Zero-GST (Exempt)</span>
              {taxableBillsData && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {taxableBillsData.zero_gst_bills_count}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setGstFilter("ALL"); setBillsPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                gstFilter === "ALL"
                  ? "bg-emerald-600 text-white shadow-xs font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>All Settled Bills</span>
              {taxableBillsData && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {taxableBillsData.total_bills}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        {taxableBillsData && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Taxable Bills Count</p>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="text-xl font-black font-mono text-[var(--text-primary)]">
                  {taxableBillsData.taxable_bills_count}
                </p>
                <span className="text-[10px] font-semibold text-purple-400">
                  {taxableBillsData.total_bills > 0
                    ? `${((taxableBillsData.taxable_bills_count / taxableBillsData.total_bills) * 100).toFixed(1)}% of bills`
                    : "0%"}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Taxable Bills Turnover</p>
              <p className="mt-1 text-xl font-black font-mono text-[var(--text-primary)]">
                ₹{taxableBillsData.taxable_bills_turnover.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">Gross Customer Billing</span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Base Taxable Value</p>
              <p className="mt-1 text-xl font-black font-mono text-[var(--text-primary)]">
                ₹{taxableBillsData.taxable_base_value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">Net Base excl. GST</span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs">
              <p className="text-[10px] uppercase font-bold text-purple-400">Total GST Collected</p>
              <p className="mt-1 text-xl font-black font-mono text-purple-400">
                ₹{taxableBillsData.total_gst_collected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">
                CGST ₹{taxableBillsData.total_cgst.toFixed(0)} | SGST ₹{taxableBillsData.total_sgst.toFixed(0)}
              </span>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Zero-GST / Exempt Bills</p>
              <div className="mt-1 flex items-baseline justify-between">
                <p className="text-xl font-black font-mono text-zinc-400">
                  {taxableBillsData.zero_gst_bills_count}
                </p>
                <span className="text-xs font-mono font-bold text-zinc-400">
                  ₹{taxableBillsData.zero_gst_bills_turnover.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">Produce &amp; Unbranded Staples</span>
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
                  <th className="px-4 py-3 text-right">Taxable (₹)</th>
                  <th className="px-3 py-3 text-right text-cyan-400">CGST</th>
                  <th className="px-3 py-3 text-right text-cyan-400">SGST</th>
                  <th className="px-4 py-3 text-right font-bold text-purple-400">Total GST</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Bill Total</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {isLoadingBills ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-50" />
                      Loading bills register...
                    </td>
                  </tr>
                ) : !taxableBillsData || taxableBillsData.bills.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                      <Receipt className="mx-auto h-6 w-6 mb-2 opacity-30" />
                      No bills match the selected filter for this date range.
                    </td>
                  </tr>
                ) : (
                  taxableBillsData.bills.map((b) => (
                    <tr key={b.order_id} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-4 py-3 font-bold text-purple-400">
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
                      <td className="px-4 py-3 text-right">₹{b.taxable_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-cyan-400">₹{b.cgst_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-cyan-400">₹{b.sgst_amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-400">
                        {b.total_gst_amount > 0 ? (
                          <span>₹{b.total_gst_amount.toFixed(2)}</span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] font-normal">Exempt</span>
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-purple-600 hover:text-white border border-[var(--border-subtle)] text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
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
          {taxableBillsData && taxableBillsData.bills.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
              <span>
                Showing page {billsPage} ({taxableBillsData.bills.length} bills)
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
                  disabled={taxableBillsData.bills.length < 50}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] disabled:opacity-40 cursor-pointer font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. GSTR-1 Table 12 HSN Summary ─────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            <h3 className="font-bold text-sm text-[var(--text-primary)]">GSTR-1 Table 12: HSN-Wise Summary of Outward Supplies</h3>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">
            {hsnItems.length} HSN Codes Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] font-semibold">
              <tr>
                <th className="px-4 py-3">HSN/SAC</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-3 py-3 text-center">UQC</th>
                <th className="px-3 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3 text-right">Total Value</th>
                <th className="px-4 py-3 text-right">Taxable Value</th>
                <th className="px-3 py-3 text-right text-amber-400">IGST</th>
                <th className="px-3 py-3 text-right text-cyan-400">CGST</th>
                <th className="px-3 py-3 text-right text-cyan-400">SGST</th>
                <th className="px-4 py-3 text-right font-bold text-purple-400">Total Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
              {hsnItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                    <Calculator className="mx-auto h-6 w-6 mb-2 opacity-30" />
                    No HSN items recorded for this date range. Check that inventory/menu items have HSN codes assigned.
                  </td>
                </tr>
              ) : (
                hsnItems.map((row: Gstr1HsnItem, idx: number) => {
                  const rowTax = (row.igst_amount || 0) + (row.cgst_amount || 0) + (row.sgst_amount || 0);
                  return (
                    <tr key={`${row.hsn_code}-${row.tax_rate}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-4 py-3 font-bold text-amber-400 font-mono">
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 border border-amber-500/20">
                          {row.hsn_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-sans font-medium truncate max-w-[180px]" title={row.description}>
                        {row.description}
                      </td>
                      <td className="px-3 py-3 text-center text-[var(--text-muted)]">{row.uqc}</td>
                      <td className="px-3 py-3 text-right">{row.total_quantity.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₹{row.total_value.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">₹{row.taxable_value.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-amber-400">₹{row.igst_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-cyan-400">₹{row.cgst_amount.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-cyan-400">₹{row.sgst_amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-400">₹{rowTax.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {hsnItems.length > 0 && (
              <tfoot className="border-t-2 border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] font-mono font-bold text-xs">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-sans uppercase">Total Outward Supplies</td>
                  <td className="px-3 py-3 text-right">-</td>
                  <td className="px-4 py-3 text-right">₹{totalHsnValue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[var(--text-primary)]">₹{totalHsnTaxable.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-amber-400">₹{totalHsnIgst.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-cyan-400">₹{totalHsnCgst.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-cyan-400">₹{totalHsnSgst.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-purple-400">₹{totalHsnTax.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── 3. GST Tax Slab Breakdown ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3">
          <h3 className="font-bold text-sm text-[var(--text-primary)]">GST Tax Slab Breakdown</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-3 font-semibold">Tax Category</th>
                <th className="px-6 py-3 font-semibold text-right">Tax Rate %</th>
                <th className="px-6 py-3 font-semibold text-right">Items Count</th>
                <th className="px-6 py-3 font-semibold text-right">Taxable Amount</th>
                <th className="px-6 py-3 font-semibold text-right text-purple-400">Tax Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.slabs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <Calculator className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No tax data found for this period.
                  </td>
                </tr>
              ) : (
                data.slabs.map((slab, idx) => (
                  <tr key={`${slab.tax_category}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-3 font-medium text-[var(--text-primary)]">
                      {slab.tax_category}
                    </td>
                    <td className="px-6 py-3 text-right font-medium">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {slab.tax_rate}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-[var(--text-secondary)] font-mono">{slab.items_count}</td>
                    <td className="px-6 py-3 text-right font-medium font-mono">₹{slab.taxable_amount.toFixed(2)}</td>
                    <td className="px-6 py-3 text-right font-bold text-purple-400 font-mono">₹{slab.tax_collected.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bill Detail & Receipt Modal ────────────────────────────────────── */}
      {selectedBillForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-purple-400" />
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
                  <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2 opacity-60 text-purple-400" />
                  Fetching complete bill items and statutory tax breakdown...
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
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Base Taxable</p>
                      <p className="text-xs font-bold font-mono mt-0.5 text-[var(--text-primary)]">
                        ₹{selectedBillForView.summary.taxable_amount.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <p className="text-[10px] uppercase font-bold text-purple-400">GST Collected</p>
                      <p className="text-xs font-bold font-mono mt-0.5 text-purple-400">
                        ₹{selectedBillForView.summary.total_gst_amount.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="px-4 py-2 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] font-bold text-xs text-[var(--text-secondary)]">
                      Billed Items (Tax Inclusive)
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[var(--border-subtle)] font-semibold text-[var(--text-muted)] bg-[var(--bg-surface)]">
                        <tr>
                          <th className="px-3 py-2 text-center w-8">#</th>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-2 py-2 text-center">HSN</th>
                          <th className="px-2 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Selling Rate</th>
                          <th className="px-2 py-2 text-center">Tax %</th>
                          <th className="px-3 py-2 text-right">Taxable</th>
                          <th className="px-3 py-2 text-right text-purple-400">GST</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {selectedBillForView.detail?.items?.map((it, idx) => {
                          const qty = Number(it.quantity) || 1;
                          const rate = Number(it.unit_price) || 0;
                          const lineTot = Number(it.line_total) || (rate * qty);
                          const taxRate = Number((it as any).tax_rate ?? 0);
                          const taxable = taxRate > 0 ? lineTot / (1 + taxRate / 100) : lineTot;
                          const gstAmt = lineTot - taxable;

                          return (
                            <tr key={it.id || idx} className="hover:bg-[var(--bg-surface-elevated)]/40 transition">
                              <td className="px-3 py-2 text-center text-[var(--text-muted)] font-mono">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                                {it.item_name}
                              </td>
                              <td className="px-2 py-2 text-center font-mono text-[10px] text-[var(--text-muted)]">
                                {(it as any).hsn_code || "—"}
                              </td>
                              <td className="px-2 py-2 text-right font-medium">
                                {qty.toFixed(2)} {it.selected_unit || "pcs"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">₹{rate.toFixed(2)}</td>
                              <td className="px-2 py-2 text-center">
                                <span className="rounded bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 text-[10px] font-mono">
                                  {taxRate}%
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">₹{taxable.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono text-purple-400">
                                {gstAmt > 0 ? `₹${gstAmt.toFixed(2)}` : "0.00"}
                              </td>
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
                        <span>Gross Subtotal:</span>
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
                      {((selectedBillForView.detail?.delivery_charge ?? 0) > 0 || (selectedBillForView.detail?.handling_charge ?? 0) > 0) && (
                        <div className="flex justify-between text-indigo-400">
                          <span>Delivery &amp; Handling:</span>
                          <span>+₹{(Number(selectedBillForView.detail?.delivery_charge || 0) + Number(selectedBillForView.detail?.handling_charge || 0)).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-purple-400 pt-1 border-t border-[var(--border-subtle)]">
                        <span>GST Included:</span>
                        <span>₹{selectedBillForView.summary.total_gst_amount.toFixed(2)}</span>
                      </div>
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
                  Print thermal receipt or export A4 invoice with GST breakup
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
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