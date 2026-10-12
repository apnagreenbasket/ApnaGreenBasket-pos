import React, { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, PackageOpen, X, Loader2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { parseUTCDate, formatLocalDate } from "@/lib/api";
import { StockMovementResponse } from "@/types";

type Props = {
  data: StockMovementResponse | null;
  isLoading: boolean;
  datePreset?: string;
  customFromDate?: string;
  customToDate?: string;
};

interface StockLedgerResponse {
  id: string;
  change_type: string;
  quantity_change: number;
  resulting_stock: number;
  created_at: string;
  reason?: string;
  notes?: string;
}

interface StockLedgerPageResponse {
  items: StockLedgerResponse[];
  total?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
}

function computeLedgerDateRange(
  preset?: string,
  customFrom?: string,
  customTo?: string
): { fromStr: string; toStr: string; label: string } {
  const now = new Date();
  let fromStr = "";
  let toStr = "";
  let label = "Today";

  if (!preset || preset === "today") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    fromStr = from.toISOString();
    toStr = to.toISOString();
    label = "Today";
  } else if (preset === "yesterday") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    fromStr = from.toISOString();
    toStr = to.toISOString();
    label = "Yesterday";
  } else if (preset === "last_7") {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    fromStr = from.toISOString();
    toStr = now.toISOString();
    label = "Last 7 Days";
  } else if (preset === "last_30") {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    fromStr = from.toISOString();
    toStr = now.toISOString();
    label = "Last 30 Days";
  } else if (preset === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    fromStr = from.toISOString();
    toStr = now.toISOString();
    label = "This Month";
  } else if (preset === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    fromStr = from.toISOString();
    toStr = to.toISOString();
    label = "Last Month";
  } else if (preset === "custom" && customFrom && customTo) {
    const [fYear, fMonth, fDay] = customFrom.split("-").map(Number);
    fromStr = new Date(fYear, fMonth - 1, fDay, 0, 0, 0).toISOString();

    const [tYear, tMonth, tDay] = customTo.split("-").map(Number);
    toStr = new Date(tYear, tMonth - 1, tDay, 23, 59, 59, 999).toISOString();
    label = `${customFrom} to ${customTo}`;
  }

  return { fromStr, toStr, label };
}

export function StockMovementReport({ data, isLoading, datePreset, customFromDate, customToDate }: Props) {
  const { apiRequest } = useAdminAuth();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [ledgerData, setLedgerData] = useState<StockLedgerPageResponse | null>(null);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  const { fromStr, toStr, label: dateRangeLabel } = useMemo(
    () => computeLedgerDateRange(datePreset, customFromDate, customToDate),
    [datePreset, customFromDate, customToDate]
  );

  // Reset page when date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [datePreset, customFromDate, customToDate]);

  useEffect(() => {
    if (!selectedItemId) {
      setLedgerData(null);
      return;
    }
    const fetchLedger = async () => {
      setIsLoadingLedger(true);
      try {
        const params = new URLSearchParams();
        params.append("item_id", selectedItemId);
        params.append("page", String(currentPage));
        params.append("page_size", "20");
        if (fromStr) params.append("from_date", fromStr);
        if (toStr) params.append("to_date", toStr);

        const res = await apiRequest<StockLedgerPageResponse>(
          `/api/admin/inventory/ledger?${params.toString()}`
        );
        setLedgerData(res);
      } catch (err) {
        console.error("Failed to load item ledger", err);
      } finally {
        setIsLoadingLedger(false);
      }
    };
    fetchLedger();
  }, [selectedItemId, currentPage, fromStr, toStr, apiRequest]);

  const rawItems = data?.items || [];

  const enrichedItems = useMemo(() => {
    return rawItems.map((item) => ({
      ...item,
      total_in: (item.intake_qty || 0) + (item.restock_qty || 0),
      total_out: (item.sales_deduction_qty || 0) + (item.purchase_return_qty || 0) + (item.void_batch_qty || 0),
    }));
  }, [rawItems]);

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData,
  } = useTableSortAndSearch(enrichedItems, ["item_name"]);

  const totalEntries = ledgerData?.total ?? (ledgerData?.items?.length || 0);
  const totalPages = ledgerData?.total_pages ?? Math.max(1, Math.ceil(totalEntries / 20));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startEntry = totalEntries === 0 ? 0 : (safeCurrentPage - 1) * 20 + 1;
  const endEntry = Math.min(safeCurrentPage * 20, totalEntries);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span>Loading stock movement...</span>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
          <ArrowRightLeft className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Stock Movement</h2>
          <p className="text-sm text-[var(--text-secondary)]">Track inventory changes over time</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Items Tracked</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_items}</span>
          </div>
        </div>
      </div>

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search item..."
        title="Movement Records"
      />

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Item Name" columnKey="item_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Opening" columnKey="opening_stock" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="In (+)" columnKey="total_in" sortConfig={sortConfig} handleSort={handleSort} className="text-right text-emerald-500" />
                <SortableHeader label="Out (-)" columnKey="total_out" sortConfig={sortConfig} handleSort={handleSort} className="text-right text-red-500" />
                <SortableHeader label="Adjustments" columnKey="manual_adjustment_qty" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Closing" columnKey="closing_stock" sortConfig={sortConfig} handleSort={handleSort} className="text-right text-[var(--accent-brand)]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {searchQuery ? "No matching records found." : "No stock movement data found for this period."}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredData.map((item) => (
                  <tr 
                    key={item.item_id} 
                    className="hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedItemId(item.item_id);
                      setSelectedItemName(item.item_name);
                      setCurrentPage(1);
                    }}
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-brand)] transition-colors">{item.item_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">Unit: {item.unit}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{item.opening_stock}</td>
                    <td className="px-6 py-4 text-right text-emerald-500">
                      {item.total_in > 0 ? `+${item.total_in}` : "0"}
                    </td>
                    <td className="px-6 py-4 text-right text-red-500">
                      {item.total_out > 0 ? `-${item.total_out}` : "0"}
                    </td>
                    <td className="px-6 py-4 text-right">{item.manual_adjustment_qty}</td>
                    <td className="px-6 py-4 text-right font-bold text-[var(--accent-brand)]">
                      {item.closing_stock}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Ledger Modal */}
      {selectedItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-[var(--border-subtle)]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {selectedItemName} Ledger
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/10 text-sky-500 border border-sky-500/20">
                    <Calendar className="h-3 w-3" />
                    <span>{dateRangeLabel}</span>
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Stock movements filtered by selected date range
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemId(null)}
                className="p-2 rounded-full hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-0">
              {isLoadingLedger ? (
                <div className="flex flex-col items-center justify-center p-12 text-[var(--text-secondary)]">
                  <Loader2 className="h-8 w-8 animate-spin mb-4 text-[var(--accent-brand)]" />
                  <p>Loading ledger entries...</p>
                </div>
              ) : !ledgerData?.items || ledgerData.items.length === 0 ? (
                <div className="p-12 text-center text-[var(--text-secondary)]">
                  <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                  <p>No stock movement entries found for {dateRangeLabel.toLowerCase()}.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--bg-surface)] sticky top-0 border-b border-[var(--border-subtle)] z-10">
                    <tr>
                      <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Date & Time</th>
                      <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Type</th>
                      <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Change</th>
                      <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Balance</th>
                      <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {ledgerData.items.map((row) => (
                      <tr key={row.id} className="hover:bg-[var(--bg-surface)]/50">
                        <td className="px-6 py-3">
                          {formatLocalDate(parseUTCDate(row.created_at))}{" "}
                          <span className="text-xs text-[var(--text-muted)]">
                            {parseUTCDate(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-[var(--border-subtle)] text-[var(--text-primary)]">
                            {row.change_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className={`px-6 py-3 text-right font-bold ${row.quantity_change > 0 ? "text-emerald-500" : row.quantity_change < 0 ? "text-red-500" : "text-[var(--text-primary)]"}`}>
                          {row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change}
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-[var(--accent-brand)]">
                          {row.resulting_stock}
                        </td>
                        <td className="px-6 py-3 text-xs text-[var(--text-secondary)]">
                          {row.notes || row.reason || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer (Pagination) */}
            {totalEntries > 0 && (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3 flex items-center justify-between shrink-0">
                <span className="text-xs text-[var(--text-secondary)]">
                  Showing <span className="font-semibold text-[var(--text-primary)]">{startEntry}–{endEntry}</span> of{" "}
                  <span className="font-semibold text-[var(--text-primary)]">{totalEntries}</span> movement{totalEntries === 1 ? "" : "s"}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1 || isLoadingLedger}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:border-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>

                  <span className="text-xs font-mono px-2 text-[var(--text-secondary)]">
                    Page <span className="font-bold text-[var(--text-primary)]">{safeCurrentPage}</span> of{" "}
                    <span className="font-bold text-[var(--text-primary)]">{totalPages}</span>
                  </span>

                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages || isLoadingLedger}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:border-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
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