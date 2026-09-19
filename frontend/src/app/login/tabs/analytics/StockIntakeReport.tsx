import React, { useState } from "react";
import { Truck, PackageOpen, X } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { StockIntakeReportResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";

type Props = {
  data: StockIntakeReportResponse | null;
  isLoading: boolean;
};

export function StockIntakeReport({ data, isLoading }: Props) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading stock intakes...</div>;
  }
  if (!data) return null;

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData: sortedAndFilteredItems
  } = useTableSortAndSearch(data.items, ["item_name", "supplier_name", "batch_number"]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Stock Intakes</h2>
          <p className="text-sm text-[var(--text-secondary)]">Inward inventory from suppliers</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Intakes</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_intakes}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Qty Received</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_quantity}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Cost</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_cost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search item, supplier, or batch..."
        title="Intake Records"
      />

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Date" columnKey="intake_date" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Item & Supplier" columnKey="item_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Batch No." columnKey="batch_number" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Qty" columnKey="quantity" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Unit Cost" columnKey="unit_cost" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Total" columnKey="total_cost" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {searchQuery ? "No matching records found." : "No stock intakes recorded for this period."}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredItems.map((item, idx) => (
                  <tr 
                    key={`${item.intake_id}-${idx}`} 
                    className="hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedItemId(item.item_id);
                      setSelectedItemName(item.item_name);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {parseUTCDate(item.intake_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-[var(--text-primary)] group-hover:text-emerald-500 transition-colors">{item.item_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">Supplier: {item.supplier_name || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                        {item.batch_number || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-secondary)]">₹{item.unit_cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-[var(--text-primary)]">₹{item.total_cost.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Intakes Modal */}
      {selectedItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {selectedItemName} Intakes
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">All received batches in this period</p>
              </div>
              <button
                onClick={() => setSelectedItemId(null)}
                className="p-2 rounded-full hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--bg-surface)] sticky top-0 border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Date</th>
                    <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Supplier</th>
                    <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Batch No.</th>
                    <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Qty</th>
                    <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Unit Cost</th>
                    <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {data.items
                    .filter(i => i.item_id === selectedItemId)
                    .map((item, idx) => (
                    <tr key={`${item.intake_id}-${idx}`} className="hover:bg-[var(--bg-surface)]/50">
                      <td className="px-6 py-3 whitespace-nowrap">
                        {parseUTCDate(item.intake_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-[var(--text-primary)]">
                        {item.supplier_name || 'N/A'}
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                          {item.batch_number || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-medium">{item.quantity}</td>
                      <td className="px-6 py-3 text-right text-[var(--text-secondary)]">₹{item.unit_cost.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right font-bold text-[var(--text-primary)]">₹{item.total_cost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}