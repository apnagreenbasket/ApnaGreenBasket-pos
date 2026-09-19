import React, { useState, useMemo } from "react";
import {
  Tag,
  Percent,
  IndianRupee,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  Printer,
  Download,
  FileText,
  ArrowUpDown,
  CreditCard,
  Building2,
  FileSpreadsheet,
  Package,
  Layers,
  Sparkles,
  Receipt,
} from "lucide-react";
import type { DiscountReportResponse, DiscountedBillDetail, ManualBill } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { apiRequest } from "../../adminUtils";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { RestaurantProfile } from "../../adminTypes";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";

type Props = {
  data: DiscountReportResponse | null;
  restaurant?: RestaurantProfile | null;
};

export function DiscountReport({ data, restaurant }: Props) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Selected bill for detailed modal inspection
  const [selectedBillForView, setSelectedBillForView] = useState<{
    summary: DiscountedBillDetail;
    detail: ManualBill | null;
    loading: boolean;
    error?: string | null;
  } | null>(null);

  const bills = data?.discounted_bills || [];

  // Filter & Sort Bills
  const typeFilteredBills = useMemo(() => {
    let list = [...bills];
    if (typeFilter !== "ALL") {
      list = list.filter((b) => (b.discount_type || "").toUpperCase() === typeFilter);
    }
    return list;
  }, [bills, typeFilter]);

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData: filteredBills
  } = useTableSortAndSearch(typeFilteredBills, ["bill_number", "cashier_name", "discount_reason", "approved_by_name"]);

  // Aggregate stats for filtered list
  const filteredTotals = useMemo(() => {
    let totalDiscount = 0;
    let totalGross = 0;
    let totalNet = 0;
    filteredBills.forEach((b) => {
      totalDiscount += Number(b.discount_amount || 0);
      totalGross += Number(b.subtotal || 0);
      totalNet += Number(b.total_amount || 0);
    });
    return { totalDiscount, totalGross, totalNet };
  }, [filteredBills]);

  // Open detailed bill view
  const handleOpenBillView = async (bill: DiscountedBillDetail) => {
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
        error: err.message || "Failed to load bill receipt details.",
      });
    }
  };

  const handleDownloadReceiptPdf = () => {
    if (!selectedBillForView?.detail) return;
    try {
      generateReceiptPDF(
        selectedBillForView.detail as any,
        restaurant?.name || "ApnaGreen Basket",
        undefined,
        restaurant || {},
        "download"
      );
    } catch (err) {
      console.error("PDF download failed:", err);
    }
  };

  const handleDownloadInvoicePdf = () => {
    if (!selectedBillForView?.detail) return;
    try {
      generateA4InvoicePDF(
        selectedBillForView.detail as any,
        restaurant?.name || "ApnaGreen Basket",
        undefined,
        restaurant || {},
        "download"
      );
    } catch (err) {
      console.error("A4 invoice download failed:", err);
    }
  };

  if (!data) {
    return (
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center text-sm text-[var(--text-muted)]">
        <Tag className="h-8 w-8 mx-auto mb-2 opacity-30 text-amber-500" />
        <p className="font-semibold text-[var(--text-primary)]">No discount data available for this date range.</p>
        <p className="text-xs mt-1">Adjust your date range filters above to view discount reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Top Executive KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Discount Given */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Total Discount Given</span>
            <IndianRupee className="h-4 w-4 text-amber-400" />
          </div>
          <p className="font-display text-2xl font-black text-amber-400">
            ₹{data.summary.total_discount_amount.toFixed(2)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
            Across {data.summary.total_orders_with_discount} discounted orders
          </span>
        </div>

        {/* Discounted Orders Count */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Discounted Orders</span>
            <Tag className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="font-display text-2xl font-black text-[var(--text-primary)]">
            {data.summary.total_orders_with_discount}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
            Avg: ₹{data.summary.avg_discount_per_order.toFixed(2)} / order
          </span>
        </div>

        {/* % Revenue Discounted */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">% Revenue Discounted</span>
            <Percent className="h-4 w-4 text-rose-400" />
          </div>
          <p className="font-display text-2xl font-black text-rose-400">
            {data.summary.discount_pct_of_revenue.toFixed(2)}%
          </p>
          <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
            Portion of gross sales written off
          </span>
        </div>

        {/* Approvals Summary */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Discount Approvals</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="font-display text-2xl font-black text-emerald-400">
            {data.approval_stats ? `${data.approval_stats.approved}` : "—"}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
            {data.approval_stats
              ? `${data.approval_stats.approval_rate_pct}% approved (${data.approval_stats.pending} pending)`
              : "Direct manager discounts"}
          </span>
        </div>
      </div>

      {/* ── 2. Breakdown Section: By Type & Top Reasons ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Discount By Type */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
            Discount Distribution By Type
          </h4>
          <div className="space-y-2">
            {data.by_type.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic py-2">No discount types recorded.</p>
            ) : (
              data.by_type.map((t, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-surface-elevated)] p-2.5 text-xs border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.discount_type === "PERCENT"
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          : t.discount_type === "FLAT"
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {t.discount_type}
                    </span>
                    <span className="text-[var(--text-secondary)]">{t.count} orders</span>
                  </div>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    ₹{t.total_amount.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Discount Notes / Reasons */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            Top Discount Reasons / Notes
          </h4>
          <div className="space-y-2">
            {data.top_reasons && data.top_reasons.length > 0 ? (
              data.top_reasons.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-surface-elevated)] p-2.5 text-xs border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    <span className="text-[var(--accent-brand)] font-bold shrink-0">#{idx + 1}</span>
                    <span className="text-[var(--text-primary)] font-medium truncate" title={r.reason}>
                      {r.reason}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">({r.count}x)</span>
                  </div>
                  <span className="font-mono font-bold text-amber-400 shrink-0">
                    ₹{r.total_amount.toFixed(2)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic py-2">No discount reasons tracked.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. The Core Discounted Bills & Orders Detailed Table ── */}
      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search Bill #, note, cashier..."
        title="Itemized Discounted Bills & Audit Ledger"
        subtitle="Complete audit trail of every discounted bill, discount notes, and responsible cashier."
      />
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4">

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] mr-1">Filter Type:</span>
          {["ALL", "PERCENT", "FLAT", "COMPLIMENTARY"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                typeFilter === type
                  ? "bg-amber-500 text-black shadow-xs"
                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {type === "ALL" ? `All (${bills.length})` : type}
            </button>
          ))}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
                <SortableHeader label="Bill No & Date" columnKey="created_at" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4" />
                <SortableHeader label="Discount Note / Reason" columnKey="discount_reason" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4" />
                <SortableHeader label="Cashier Responsible" columnKey="cashier_name" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4" />
                <SortableHeader label="Type & Rate" columnKey="discount_type" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4" />
                <SortableHeader label="Discount Given" columnKey="discount_amount" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4 text-right" />
                <SortableHeader label="Gross Total" columnKey="subtotal" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4 text-right" />
                <SortableHeader label="Net Billed" columnKey="total_amount" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4 text-right" />
                <SortableHeader label="Auth / Approver" columnKey="approved_by_name" sortConfig={sortConfig} handleSort={handleSort} className="!py-3 !px-4 text-center" />
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--text-muted)]">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30 text-amber-400" />
                    <p className="font-semibold text-xs text-[var(--text-primary)]">No matching discounted bills found</p>
                    <p className="text-[11px] mt-1">Try clearing your search query or selecting another filter.</p>
                  </td>
                </tr>
              ) : (
                filteredBills.map((b) => {
                  const billDate = b.created_at ? parseUTCDate(b.created_at) : null;
                  return (
                    <tr
                      key={b.order_id}
                      className="hover:bg-[var(--bg-surface)] transition group"
                    >
                      {/* Bill No & Date */}
                      <td className="py-3 px-4 font-mono">
                        <button
                          type="button"
                          onClick={() => handleOpenBillView(b)}
                          className="font-bold text-[var(--accent-brand)] hover:underline flex items-center gap-1 cursor-pointer text-left"
                          title="Click to view full bill details"
                        >
                          {b.bill_number}
                        </button>
                        {billDate && (
                          <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {billDate.toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}{" "}
                            {billDate.toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </td>

                      {/* Discount Note / Reason */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <div className="inline-flex items-start gap-1 rounded-md bg-amber-500/10 px-2 py-1 border border-amber-500/20 text-amber-300 font-medium text-[11px]">
                          <span className="truncate" title={b.discount_reason || "No note recorded"}>
                            {b.discount_reason || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Cashier Responsible */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-strong)] flex items-center justify-center shrink-0">
                            <User className="h-3 w-3 text-cyan-400" />
                          </div>
                          <div>
                            <span className="font-semibold text-[var(--text-primary)] block">
                              {b.cashier_name || "Cashier"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Type & Rate */}
                      <td className="py-3 px-4 font-mono">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.discount_type === "PERCENT"
                              ? "bg-purple-500/15 text-purple-400 border border-purple-500/25"
                              : b.discount_type === "FLAT"
                              ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                          }`}
                        >
                          {b.discount_type === "PERCENT"
                            ? `${b.discount_value}% OFF`
                            : b.discount_type === "FLAT"
                            ? `₹${b.discount_value} FLAT`
                            : b.discount_type || "DISCOUNT"}
                        </span>
                      </td>

                      {/* Discount Amount */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                        -₹{Number(b.discount_amount || 0).toFixed(2)}
                      </td>

                      {/* Gross Total */}
                      <td className="py-3 px-4 text-right font-mono text-[var(--text-muted)]">
                        ₹{Number(b.subtotal || 0).toFixed(2)}
                      </td>

                      {/* Net Billed */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        ₹{Number(b.total_amount || 0).toFixed(2)}
                      </td>

                      {/* Auth / Approver */}
                      <td className="py-3 px-4 text-center">
                        {b.approved_by_name ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20"
                            title={`Approved by manager ${b.approved_by_name}`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {b.approved_by_name}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] italic">
                            Manager Direct
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenBillView(b)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 text-[11px] font-bold transition cursor-pointer"
                          title="Inspect Bill Items & Receipt"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredBills.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--bg-surface)] font-bold text-xs">
                  <td colSpan={4} className="py-3 px-4 text-[var(--text-primary)]">
                    Totals for filtered results ({filteredBills.length} bills):
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-amber-400">
                    -₹{filteredTotals.totalDiscount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-muted)]">
                    ₹{filteredTotals.totalGross.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-400">
                    ₹{filteredTotals.totalNet.toFixed(2)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── 4. Detailed Bill Inspection Modal ── */}
      {selectedBillForView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setSelectedBillForView(null)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>Bill {selectedBillForView.summary.bill_number}</span>
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                      {selectedBillForView.summary.discount_type === "PERCENT"
                        ? `${selectedBillForView.summary.discount_value}% OFF`
                        : `₹${selectedBillForView.summary.discount_value} OFF`}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Order ID: {selectedBillForView.summary.order_id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Metadata Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block mb-0.5">
                    Discount Note / Reason
                  </span>
                  <span className="text-xs font-bold text-amber-400">
                    {selectedBillForView.summary.discount_reason || "—"}
                  </span>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block mb-0.5">
                    Cashier Responsible
                  </span>
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-cyan-400" />
                    {selectedBillForView.summary.cashier_name || "Cashier"}
                  </span>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block mb-0.5">
                    Authorization
                  </span>
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {selectedBillForView.summary.approved_by_name || "Manager Direct"}
                  </span>
                </div>
              </div>

              {selectedBillForView.loading ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  Loading bill line items...
                </div>
              ) : selectedBillForView.error ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400">
                  {selectedBillForView.error}
                </div>
              ) : !selectedBillForView.detail ? (
                <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                  No line items found for this bill.
                </div>
              ) : (
                <>
                  {/* Line Items Table */}
                  <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] uppercase text-[10px]">
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Unit Price</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {selectedBillForView.detail.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-[var(--bg-surface-elevated)] transition">
                            <td className="py-2 px-3">
                              <span className="font-semibold text-[var(--text-primary)] block">
                                {it.item_name}
                              </span>
                              {it.selected_batch_number && (
                                <span className="text-[10px] text-cyan-400 font-mono">
                                  Lot #{it.selected_batch_number}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {Number(it.quantity).toFixed(2)} {it.selected_unit || "pcs"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[var(--text-secondary)]">
                              ₹{Number(it.unit_price).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-[var(--text-primary)]">
                              ₹{Number(it.line_total).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Settlement Breakdown */}
                  <div className="flex justify-end pt-2">
                    <div className="w-full sm:w-72 space-y-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <div className="flex justify-between text-[var(--text-secondary)]">
                        <span>Gross Subtotal:</span>
                        <span className="font-mono">
                          ₹{Number(selectedBillForView.detail.subtotal_amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-400 font-semibold">
                        <span>Discount ({selectedBillForView.summary.discount_type}):</span>
                        <span className="font-mono">
                          -₹{Number(selectedBillForView.summary.discount_amount).toFixed(2)}
                        </span>
                      </div>
                      {Number(selectedBillForView.detail.tax_amount || 0) > 0 && (
                        <div className="flex justify-between text-[var(--text-secondary)]">
                          <span>Tax Amount:</span>
                          <span className="font-mono">
                            ₹{Number(selectedBillForView.detail.tax_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-[var(--border-subtle)] pt-1.5 font-bold text-sm text-[var(--text-primary)]">
                        <span>Net Paid:</span>
                        <span className="font-mono text-emerald-400">
                          ₹{Number(selectedBillForView.detail.total_amount || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadReceiptPdf}
                  disabled={!selectedBillForView.detail}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 text-xs font-bold transition cursor-pointer disabled:opacity-40"
                  title="Download Thermal PDF Receipt"
                >
                  <Printer className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Receipt PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadInvoicePdf}
                  disabled={!selectedBillForView.detail}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1.5 text-xs font-bold transition cursor-pointer disabled:opacity-40"
                  title="Download A4 Tax Invoice PDF"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>A4 Invoice</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-1.5 text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

