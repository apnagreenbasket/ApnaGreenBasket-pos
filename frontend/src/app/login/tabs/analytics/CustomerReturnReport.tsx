"use client";

import React, { useState, useMemo } from "react";
import { UserMinus, PackageOpen, Tag, Search, Download, RefreshCw } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { CustomerReturnReportResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";

type Props = {
  data: CustomerReturnReportResponse | null;
  isLoading: boolean;
};

export function CustomerReturnReport({ data, isLoading }: Props) {
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerReason, setLedgerReason] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const {
    searchQuery: txSearchQuery,
    setSearchQuery: setTxSearchQuery,
    sortConfig: txSortConfig,
    handleSort: handleTxSort,
    sortedAndFilteredData: txSortedData
  } = useTableSortAndSearch(data?.returns || [], ["return_number", "customer_name", "customer_phone", "order_id"]);

  // Filter return ledger line items
  const rawLedger = useMemo(() => data?.return_ledger || [], [data?.return_ledger]);

  const filteredLedger = useMemo(() => {
    let list = rawLedger;
    if (ledgerReason !== "ALL") {
      const qReason = ledgerReason.toUpperCase();
      list = list.filter((item) => (item.reason || "").toUpperCase() === qReason);
    }
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.item_name.toLowerCase().includes(q) ||
          (item.return_number && item.return_number.toLowerCase().includes(q)) ||
          (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
          (item.customer_phone && item.customer_phone.includes(q)) ||
          (item.reason && item.reason.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rawLedger, ledgerReason, ledgerSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / pageSize));
  const paginatedLedger = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLedger.slice(start, start + pageSize);
  }, [filteredLedger, currentPage, pageSize]);

  // Ledger summary metrics
  const ledgerSummary = useMemo(() => {
    const totalQty = filteredLedger.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalRefund = filteredLedger.reduce((sum, item) => sum + (item.line_refund || 0), 0);
    return {
      lineItems: filteredLedger.length,
      totalQty: round3(totalQty),
      totalRefund: round2(totalRefund),
    };
  }, [filteredLedger]);

  function round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }
  function round3(val: number): number {
    return Math.round((val + Number.EPSILON) * 1000) / 1000;
  }

  const handleExportCsv = () => {
    if (filteredLedger.length === 0) return;
    const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const formatCsvDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return '""';
      const d = parseUTCDate(dateStr);
      if (isNaN(d.getTime())) return escapeCsv(dateStr);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `"${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}"`;
    };
    const formatExcelText = (val: string | null | undefined) => {
      if (!val) return '""';
      return `="` + String(val).replace(/"/g, '""') + `"`;
    };

    const headers = [
      "Return Number",
      "Date & Time",
      "Customer Name",
      "Customer Phone",
      "Item Name",
      "Quantity",
      "Unit",
      "Unit Price (INR)",
      "Refund Amount (INR)",
      "Reason",
    ];
    const rows = filteredLedger.map((item) => [
      escapeCsv(item.return_number),
      formatCsvDate(item.created_at),
      escapeCsv(item.customer_name || "Walk-in"),
      formatExcelText(item.customer_phone),
      escapeCsv(item.item_name),
      item.quantity,
      escapeCsv(item.selected_unit || "pc"),
      item.unit_price.toFixed(2),
      item.line_refund.toFixed(2),
      escapeCsv(item.reason || ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `customer_return_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading customer returns...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
          <UserMinus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Customer Returns</h2>
          <p className="text-sm text-[var(--text-secondary)]">Track customer refunds and returned items</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Returns</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_returns}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Refund Amount</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400">
              ₹{data.total_refund_amount.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Return Rate % (Order)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">
              {data.return_rate_pct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Return Rate % (Value)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">
              {((data as any).return_rate_value_pct || 0).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {data.top_returned_items.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm p-6">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--accent-brand)]" />
            All Returned Items (Aggregated)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.top_returned_items.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              >
                <p className="font-medium text-[var(--text-primary)] mb-2 truncate">{item.item_name}</p>
                <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                  <span>Return Events:</span>
                  <span className="font-semibold text-[var(--text-primary)]">{item.return_count}</span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                  <span>Qty Returned:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {item.total_quantity_returned}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>Refunded:</span>
                  <span className="font-semibold text-red-500">
                    ₹{item.total_refund_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Bills Summary Table */}
      <TableSearchBar 
        searchQuery={txSearchQuery}
        setSearchQuery={setTxSearchQuery}
        placeholder="Search return #, customer, order ID..."
        title="Customer Return Transactions"
      />
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Date & Time" columnKey="created_at" sortConfig={txSortConfig} handleSort={handleTxSort} />
                <SortableHeader label="Return #" columnKey="return_number" sortConfig={txSortConfig} handleSort={handleTxSort} />
                <SortableHeader label="Customer" columnKey="customer_name" sortConfig={txSortConfig} handleSort={handleTxSort} />
                <SortableHeader label="Order ID" columnKey="order_id" sortConfig={txSortConfig} handleSort={handleTxSort} />
                <SortableHeader label="Items" columnKey="items_returned" sortConfig={txSortConfig} handleSort={handleTxSort} className="text-center" />
                <SortableHeader label="Refund Method" columnKey="refund_payment_method" sortConfig={txSortConfig} handleSort={handleTxSort} className="text-right" />
                <SortableHeader label="Refund Amount" columnKey="total_refund_amount" sortConfig={txSortConfig} handleSort={handleTxSort} className="text-right text-red-500" />
                <SortableHeader label="Exchange Value" columnKey="total_exchange_amount" sortConfig={txSortConfig} handleSort={handleTxSort} className="text-right text-emerald-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {txSortedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {txSearchQuery ? "No matching transactions found." : "No customer returns recorded for this period."}
                  </td>
                </tr>
              ) : (
                txSortedData.map((item, idx) => (
                  <tr key={`${item.return_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {parseUTCDate(item.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-[var(--text-primary)]">
                      <div className="flex flex-col gap-1 items-start">
                        <span>{item.return_number || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.customer_name || "Walk-in"}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{item.customer_phone}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-[var(--text-secondary)]">
                      {item.order_id ? item.order_id.substring(0, 8) + "..." : "Direct Return"}
                    </td>
                    <td className="px-6 py-4 text-center font-medium">{item.items_returned}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {item.refund_payment_method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-red-500">
                      ₹{item.total_refund_amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-500">
                      {(item as any).total_exchange_amount > 0 ? `₹${(item as any).total_exchange_amount.toFixed(2)}` : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item-level Return Ledger (Enhanced Transactional View) */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-emerald-500" />
              Item-Level Return Ledger (Individual Line Items)
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Itemized audit of all returned merchandise with unit economics and reasons
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {filteredLedger.length} line item{filteredLedger.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLedger.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 cursor-pointer transition"
              title="Export filtered return items to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Subbar */}
        <div className="p-4 bg-[var(--bg-surface)]/50 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by item name, customer, return #..."
              value={ledgerSearch}
              onChange={(e) => {
                setLedgerSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] py-1.5 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-sky-400"
            />
          </div>

          <select
            value={ledgerReason}
            onChange={(e) => {
              setLedgerReason(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] py-1.5 px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-sky-400 cursor-pointer"
          >
            <option value="ALL">All Return Reasons</option>
            <option value="DEFECTIVE_PRODUCT">Defective Product</option>
            <option value="EXPIRED">Expired</option>
            <option value="CUSTOMER_CHANGED_MIND">Customer Changed Mind</option>
            <option value="WRONG_ITEM">Wrong Item</option>
            <option value="QUALITY_ISSUE">Quality Issue</option>
            <option value="CUSTOMER_RETURN">General Return</option>
          </select>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 text-xs font-medium text-[var(--text-secondary)] ml-auto">
            <span>
              Total Qty: <strong className="text-[var(--text-primary)] font-mono">{ledgerSummary.totalQty}</strong>
            </span>
            <span>•</span>
            <span>
              Total Refund:{" "}
              <strong className="text-red-500 font-mono">₹{ledgerSummary.totalRefund.toFixed(2)}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-3 font-semibold">Date &amp; Time</th>
                <th className="px-6 py-3 font-semibold">Return #</th>
                <th className="px-6 py-3 font-semibold">Customer</th>
                <th className="px-6 py-3 font-semibold">Item Name</th>
                <th className="px-6 py-3 font-semibold text-center">Qty &amp; Unit</th>
                <th className="px-6 py-3 font-semibold text-right">Unit Price</th>
                <th className="px-6 py-3 font-semibold text-right text-red-500">Refund Amount</th>
                <th className="px-6 py-3 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {paginatedLedger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <Tag className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    No returned items found matching filters.
                  </td>
                </tr>
              ) : (
                paginatedLedger.map((ledgerItem, idx) => {
                  const isDefective = (ledgerItem.reason || "").includes("DEFECTIVE");
                  const isExpired = (ledgerItem.reason || "").includes("EXPIRED");
                  const badgeClass = isDefective
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : isExpired
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    : "bg-sky-500/10 text-sky-400 border-sky-500/20";

                  return (
                    <tr key={`${ledgerItem.return_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap text-xs text-[var(--text-secondary)] font-mono">
                        {parseUTCDate(ledgerItem.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs font-semibold text-sky-400">
                        {ledgerItem.return_number}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-xs text-[var(--text-primary)]">
                          {ledgerItem.customer_name || "Walk-in"}
                        </p>
                        {ledgerItem.customer_phone && (
                          <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                            {ledgerItem.customer_phone}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-[var(--text-primary)]">
                        {ledgerItem.item_name}
                      </td>
                      <td className="px-6 py-3.5 text-center font-mono text-xs font-bold">
                        {ledgerItem.quantity} {ledgerItem.selected_unit || "pc"}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-xs text-[var(--text-secondary)]">
                        ₹{ledgerItem.unit_price.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-xs font-bold text-red-500">
                        ₹{ledgerItem.line_refund.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${badgeClass}`}>
                          {(ledgerItem.reason || "CUSTOMER_RETURN").replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">
              Page {currentPage} of {totalPages} ({filteredLedger.length} total items)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] disabled:opacity-40 hover:border-sky-400 transition cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] disabled:opacity-40 hover:border-sky-400 transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}