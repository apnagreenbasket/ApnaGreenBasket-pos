import React, { useState } from "react";
import { 
  Receipt, 
  IndianRupee, 
  Eye, 
  X, 
  Download, 
  Printer, 
  Clock, 
  User, 
  CreditCard, 
  CheckCircle2, 
  Package, 
  Loader2,
  FileText 
} from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { BillProfitResponse, BillProfitRow, ManualBill } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { apiRequest } from "../../adminUtils";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { RestaurantProfile } from "../../adminTypes";

type Props = {
  data: BillProfitResponse | null;
  isLoading: boolean;
  restaurant?: RestaurantProfile | null;
};

export function BillProfitReport({ data, isLoading, restaurant }: Props) {
  const [selectedBillForView, setSelectedBillForView] = useState<{
    summary: BillProfitRow;
    detail: ManualBill | null;
    loading: boolean;
    error?: string | null;
  } | null>(null);

  const [fetchingOrderId, setFetchingOrderId] = useState<string | null>(null);

  const handleOpenBillView = async (bill: BillProfitRow) => {
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
        error: err?.message || "Failed to load bill details.",
      });
    } finally {
      setFetchingOrderId(null);
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

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading bill profit data...</div>;
  }
  if (!data) return null;

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(data.bills, ["basket_number", "customer_name"]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Bill-wise Profit</h2>
          <p className="text-sm text-[var(--text-secondary)]">Detailed profit margin per transaction</p>
        </div>
      </div>

      {/* TOP STATS */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Bills</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_bills}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Revenue</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_revenue.toFixed(2)}</span>
          </div>
          {(data.total_refunded_amount || 0) > 0 && (
            <p className="text-[11px] text-amber-400 font-medium mt-1">
              Net of -₹{Number(data.total_refunded_amount).toFixed(2)} refunds (Gross: ₹{(data.total_revenue + Number(data.total_refunded_amount)).toFixed(2)})
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total COGS</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-rose-500">₹{data.total_cogs.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Overall Margin</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${data.overall_margin_pct >= 50 ? 'text-emerald-500' : 'text-[var(--text-primary)]'}`}>
              {data.overall_margin_pct.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search bill no or customer..."
        title="Bill Records"
      />

      {/* MAIN BILLS TABLE */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Bill No." columnKey="basket_number" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Date & Customer" columnKey="customer_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Items" columnKey="items_count" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Revenue" columnKey="net_amount" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Est. COGS" columnKey="estimated_cogs" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Est. Profit" columnKey="estimated_profit" sortConfig={sortConfig} handleSort={handleSort} className="text-right text-emerald-500" />
                <SortableHeader label="Margin %" columnKey="margin_pct" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <th className="px-6 py-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <IndianRupee className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {searchQuery ? "No matching bills found." : "No bill profit data found for this period."}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredData.map((bill, idx) => (
                  <tr key={`${bill.order_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)] font-mono">
                      <div className="flex flex-col gap-1 items-start">
                        <span>{bill.basket_number}</span>
                        {bill.is_void && (
                          <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-[9px] font-sans font-bold uppercase tracking-wider">
                            Voided
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{bill.customer_name || 'Walk-in'}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{parseUTCDate(bill.created_at).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{bill.items_count}</td>
                    <td className="px-6 py-4 text-right font-mono">
                      <div className="font-medium text-[var(--text-primary)]">
                        ₹{(bill.net_amount !== undefined ? bill.net_amount : (bill.total_amount - (bill.total_refunded_amount || 0))).toFixed(2)}
                      </div>
                      {(bill.total_refunded_amount || 0) > 0 && (
                        <div className="text-[10px] text-amber-400 font-semibold whitespace-nowrap">
                          -₹{Number(bill.total_refunded_amount).toFixed(2)} refunded
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-rose-500 font-mono">₹{bill.estimated_cogs.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-500 font-mono">₹{bill.estimated_profit.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        bill.margin_pct >= 50 
                          ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20' 
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] ring-[var(--border-subtle)]'
                      }`}>
                        {bill.margin_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleOpenBillView(bill)}
                        disabled={fetchingOrderId === bill.order_id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] hover:border-sky-500 px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:text-sky-400 transition cursor-pointer shadow-xs disabled:opacity-50"
                        title="View Full Bill Details & PDF Receipt"
                      >
                        {fetchingOrderId === bill.order_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-sky-400" />
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
      </div>

      {/* DETAILED BILL VIEW MODAL */}
      {selectedBillForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto" onClick={() => setSelectedBillForView(null)}>
          <div 
            className="relative w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      Bill #{selectedBillForView.summary.basket_number}
                    </h3>
                    {selectedBillForView.summary.is_void ? (
                      <span className="rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-400 uppercase">
                        VOIDED (EDITED)
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                        {selectedBillForView.detail?.status || "COMPLETED"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {parseUTCDate(selectedBillForView.summary.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {selectedBillForView.loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-400 mb-3" />
                  <p className="font-semibold text-[var(--text-primary)]">Loading Bill Details...</p>
                  <p className="mt-1">Fetching order breakdown and line item batches.</p>
                </div>
              ) : selectedBillForView.error ? (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-center">
                  <p className="font-semibold">{selectedBillForView.error}</p>
                </div>
              ) : (
                <>
                  {/* Customer & Payment Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-[var(--text-muted)]" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Customer</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {selectedBillForView.detail?.customer_name || selectedBillForView.summary.customer_name || "Walk-in Customer"}
                        </span>
                        {selectedBillForView.detail?.customer_phone && (
                          <span className="text-[11px] text-[var(--text-secondary)] block font-mono">
                            {selectedBillForView.detail.customer_phone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-[var(--text-muted)]" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Payment Mode</span>
                        <span className="font-bold text-sky-400 uppercase">
                          {selectedBillForView.detail?.payment_method || selectedBillForView.summary.payment_method || "CASH"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-[var(--text-muted)]" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Total Items</span>
                        <span className="font-bold text-[var(--text-primary)]">
                          {selectedBillForView.summary.items_count} items billed
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financial & Profit Metrics Banner */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Net Revenue</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] font-mono mt-0.5">
                        ₹{(selectedBillForView.summary.net_amount !== undefined ? selectedBillForView.summary.net_amount : (selectedBillForView.summary.total_amount - (selectedBillForView.summary.total_refunded_amount || 0))).toFixed(2)}
                      </p>
                      {(selectedBillForView.summary.total_refunded_amount || 0) > 0 && (
                        <p className="text-[10px] text-amber-400 font-semibold mt-0.5">
                          -₹{Number(selectedBillForView.summary.total_refunded_amount).toFixed(2)} refunded
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Est. COGS</p>
                      <p className="text-sm font-bold text-rose-400 font-mono mt-0.5">
                        ₹{selectedBillForView.summary.estimated_cogs.toFixed(2)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Realized Profit</p>
                      <p className={`text-sm font-bold font-mono mt-0.5 ${selectedBillForView.summary.estimated_profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ₹{selectedBillForView.summary.estimated_profit.toFixed(2)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Profit Margin</p>
                      <p className={`text-sm font-bold font-mono mt-0.5 ${selectedBillForView.summary.margin_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {selectedBillForView.summary.margin_pct.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Billed Line Items Table */}
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="px-4 py-2.5 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] font-bold text-xs text-[var(--text-secondary)]">
                      Billed Line Items
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[var(--border-subtle)] font-semibold text-[var(--text-muted)] bg-[var(--bg-surface)]">
                        <tr>
                          <th className="px-4 py-2 text-center w-8">#</th>
                          <th className="px-4 py-2">Item Description</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Rate</th>
                          <th className="px-4 py-2 text-right">Cost Price</th>
                          <th className="px-4 py-2 text-right">MRP</th>
                          <th className="px-4 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
                        {selectedBillForView.detail?.items?.map((it, idx) => (
                          <tr key={it.id || idx} className="hover:bg-[var(--bg-surface-elevated)]/40 transition">
                            <td className="px-4 py-2.5 text-center text-[var(--text-muted)] font-mono">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-medium">
                              <p className="text-[var(--text-primary)] font-semibold">{it.item_name}</p>
                              {it.selected_batch_number && (
                                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded mt-0.5">
                                  Lot #{it.selected_batch_number}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium">
                              {Number(it.quantity).toFixed(2)} {it.selected_unit || "pcs"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-rose-400 font-semibold" title="Unit Cost Price used for COGS">
                              {it.cost_price != null ? `₹${Number(it.cost_price).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-purple-400">
                              {it.mrp ? `₹${Number(it.mrp).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold">
                              ₹{Number(it.line_total).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals Summary */}
                  <div className="flex justify-end p-2">
                    <div className="w-full sm:w-64 space-y-1.5 text-xs">
                      <div className="flex justify-between text-[var(--text-secondary)]">
                        <span>Subtotal:</span>
                        <span className="font-mono">₹{Number(selectedBillForView.detail?.subtotal_amount || 0).toFixed(2)}</span>
                      </div>
                      {(selectedBillForView.detail?.discount_value ?? 0) > 0 && (
                        <div className="flex justify-between text-amber-500 font-medium">
                          <span>Discount Applied:</span>
                          <span className="font-mono">-₹{Number(selectedBillForView.detail?.discount_value).toFixed(2)}</span>
                        </div>
                      )}
                      {(selectedBillForView.detail?.tax_amount ?? 0) > 0 && (
                        <div className="flex justify-between text-[var(--text-secondary)]">
                          <span>Tax Amount:</span>
                          <span className="font-mono">₹{Number(selectedBillForView.detail?.tax_amount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-[var(--border-subtle)] pt-1.5 text-sm font-bold text-[var(--text-primary)]">
                        <span>Total Paid:</span>
                        <span className="font-mono text-emerald-400">₹{Number(selectedBillForView.detail?.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleViewReceiptPdf}
                  disabled={!selectedBillForView.detail}
                  className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 px-3 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-40"
                  title="View / Print Thermal PDF Receipt"
                >
                  <Eye className="h-4 w-4" />
                  <span>View PDF Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadReceiptPdf}
                  disabled={!selectedBillForView.detail}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-40"
                  title="Download Thermal PDF Bill"
                >
                  <Download className="h-4 w-4 text-[var(--accent-brand)]" />
                  <span>Download Bill</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadInvoicePdf}
                  disabled={!selectedBillForView.detail}
                  className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-2 text-xs font-bold transition cursor-pointer disabled:opacity-40"
                  title="Download A4 Tax Invoice PDF"
                >
                  <FileText className="h-4 w-4 text-purple-400" />
                  <span>A4 Invoice</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBillForView(null)}
                className="rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 text-xs font-bold transition cursor-pointer"
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