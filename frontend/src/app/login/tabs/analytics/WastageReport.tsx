import React from "react";
import { Trash2, PackageOpen } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { WastageReportResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";

type Props = {
  data: WastageReportResponse | null;
  isLoading: boolean;
};

export function WastageReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading wastage data...</div>;
  }
  if (!data) return null;

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(data.items, ["item_name", "reason", "notes", "created_by_name"]);

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
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_wastage_entries}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Qty Wasted</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_quantity_wasted}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Total Loss Value</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400">₹{data.total_wastage_cost.toFixed(2)}</span>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
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
                      {item.item_name}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}