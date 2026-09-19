import React from "react";
import { Undo2, PackageOpen } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { PurchaseReturnReportResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";

type Props = {
  data: PurchaseReturnReportResponse | null;
  isLoading: boolean;
};

export function PurchaseReturnReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading purchase returns...</div>;
  }
  if (!data) return null;

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(data.items, ["return_number", "item_name", "supplier_name", "reason"]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
          <Undo2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Purchase Returns</h2>
          <p className="text-sm text-[var(--text-secondary)]">Stock returned to suppliers</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Return Events</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_returns}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Total Refund Expected</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">₹{data.total_refund_amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search return no, item, or supplier..."
        title="Return Records"
      />

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Date" columnKey="created_at" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Return No." columnKey="return_number" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Supplier & Item" columnKey="item_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Qty" columnKey="quantity" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Reason" columnKey="reason" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Refund Val" columnKey="total_refund_amount" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {searchQuery ? "No matching records found." : "No purchase returns for this period."}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredData.map((item, idx) => (
                  <tr key={`${item.return_id}-${idx}`} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                      {parseUTCDate(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      {item.return_number}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)]">{item.item_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">To: {item.supplier_name || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{item.quantity}</td>
                    <td className="px-6 py-4 text-[var(--text-secondary)] text-xs">{item.reason}</td>
                    <td className="px-6 py-4 text-right font-bold text-orange-500">₹{item.total_refund_amount.toFixed(2)}</td>
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