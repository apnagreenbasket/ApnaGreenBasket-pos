import React, { useMemo, useState } from "react";
import { Trash2, PackageOpen, Loader2, RotateCcw } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { WastageReportResponse, WastageRow } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { apiRequest } from "@/app/login/adminUtils";

type Props = {
  data: WastageReportResponse | null;
  isLoading: boolean;
  onRefresh?: () => void;
};

export function WastageReport({ data, isLoading, onRefresh }: Props) {
  // Defensive filter: Ensure voided batches are never displayed in the wastage report
  const rawItems = data?.items || [];
  const items = useMemo(() => {
    return rawItems.filter((item) => {
      const r = (item.reason || "").toUpperCase();
      const ct = (item.change_type || "").toUpperCase();
      return !r.includes("VOID") && !ct.includes("VOID");
    });
  }, [rawItems]);

  const [pendingUndoItem, setPendingUndoItem] = useState<WastageRow | null>(null);
  const [isRestocking, setIsRestocking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRestock = async () => {
    if (!pendingUndoItem?.id) return;
    setIsRestocking(true);
    setActionError(null);
    try {
      await apiRequest(`/api/admin/inventory/wastage/${pendingUndoItem.id}`, {
        method: "DELETE",
      });
      setPendingUndoItem(null);
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err?.message || "Failed to restock wastage. Please try again.");
    } finally {
      setIsRestocking(false);
    }
  };

  const totalEntries = items.length === rawItems.length ? (data?.total_wastage_entries ?? items.length) : items.length;
  const totalQtyWasted = useMemo(() => {
    if (items.length === rawItems.length && data?.total_quantity_wasted !== undefined) {
      return data.total_quantity_wasted;
    }
    return Number(items.reduce((acc, it) => acc + (Number(it.quantity_wasted) || 0), 0).toFixed(2));
  }, [items, rawItems.length, data?.total_quantity_wasted]);

  const totalLossValue = useMemo(() => {
    if (items.length === rawItems.length && data?.total_wastage_cost !== undefined) {
      return data.total_wastage_cost;
    }
    return items.reduce((acc, it) => acc + (Number(it.wastage_cost) || 0), 0);
  }, [items, rawItems.length, data?.total_wastage_cost]);

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData,
  } = useTableSortAndSearch(items, ["item_name", "reason", "notes", "created_by_name"]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-red-500" />
        <span>Loading wastage data...</span>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Wastage Report</h2>
          <p className="text-sm text-[var(--text-secondary)]">Track spoiled or wasted inventory items</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Wastage Entries</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{totalEntries}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Qty Wasted</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{totalQtyWasted}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Loss Value</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400">₹{totalLossValue.toFixed(2)}</span>
          </div>
          {(data.total_audit_corrections || 0) > 0 && (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              Incl. {data.total_audit_corrections} audit corrections (₹{(data.audit_correction_cost || 0).toFixed(2)})
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">% of Total Intake</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.wastage_pct_of_intake.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search item, reason, or staff..."
        title="Wastage Records"
      />

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Date" columnKey="created_at" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Item Name" columnKey="item_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Reason" columnKey="reason" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Logged By" columnKey="created_by_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Qty" columnKey="quantity_wasted" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Loss Value" columnKey="wastage_cost" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {searchQuery ? "No matching records found." : "No wastage recorded for this period!"}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredData.map((item, idx) => (
                  <tr key={`${item.item_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {parseUTCDate(item.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      <div>{item.item_name}</div>
                      {item.batch_number && (
                        <div className="text-[10px] font-mono text-cyan-400 font-medium">
                          Lot: #{item.batch_number}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        (item.reason || "").toLowerCase().includes("spoil")
                          ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                          : (item.reason || "").toLowerCase().includes("damage")
                          ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                          : (item.reason || "").toLowerCase().includes("theft")
                          ? "bg-red-500/15 text-red-500 ring-red-500/30"
                          : (item.reason || "").toLowerCase().includes("audit")
                          ? "bg-sky-500/10 text-sky-400 ring-sky-500/20"
                          : "bg-red-500/10 text-red-400 ring-red-500/20"
                      }`}>
                        {item.reason || item.change_type}
                      </span>
                      {item.notes && (
                        <p className="mt-1 text-xs text-[var(--text-muted)] italic max-w-xs truncate" title={item.notes}>
                          "{item.notes}"
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">{item.created_by_name || 'System'}</td>
                    <td className="px-6 py-4 text-right font-medium">{item.quantity_wasted}</td>
                    <td className="px-6 py-4 text-right font-bold text-red-500">₹{item.wastage_cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right">
                      {item.id ? (
                        <button
                          type="button"
                          onClick={() => setPendingUndoItem(item)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition shadow-xs cursor-pointer active:scale-95"
                          title="Delete wastage & restock to inventory"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Delete & Restock
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Confirmation Modal */}
      {pendingUndoItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => {
              if (!isRestocking) setPendingUndoItem(null);
            }}
          />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-rose-500/30 shadow-2xl text-left animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Confirm Restock & Delete Wastage
                </h3>
                <p className="text-xs text-rose-400 font-medium">
                  Undo human error & restore inventory
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 text-xs text-[var(--text-secondary)] space-y-2">
              <p>
                Are you sure you want to undo this wastage?{" "}
                <span className="font-bold text-[var(--text-primary)]">
                  {pendingUndoItem.quantity_wasted}
                </span>{" "}
                will be restored back to Batch{" "}
                <span className="font-mono font-bold text-rose-400">
                  #{pendingUndoItem.batch_number || "available stock"}
                </span>{" "}
                and available stock.
              </p>
              <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>Reason: {pendingUndoItem.reason || "Wastage"}</span>
                <span>Loss: ₹{pendingUndoItem.wastage_cost.toFixed(2)}</span>
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-400">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestocking}
                onClick={() => setPendingUndoItem(null)}
                className="rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRestocking}
                onClick={handleRestock}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-500 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                {isRestocking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Restoring Stock...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Confirm Restock
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
