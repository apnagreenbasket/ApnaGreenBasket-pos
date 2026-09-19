import React, { useState } from "react";
import { Building2, PackageOpen, ChevronDown, ChevronRight, Layers, Calendar } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { SupplierSpendResponse, SupplierBatchRow } from "@/types";
import { parseUTCDate } from "@/lib/api";

type Props = {
  data: SupplierSpendResponse | null;
  isLoading: boolean;
};

export function SupplierSpendReport({ data, isLoading }: Props) {
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});

  const toggleSupplier = (key: string) => {
    setExpandedSuppliers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading supplier spend...</div>;
  }
  if (!data) return null;

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(data.suppliers, ["supplier_name"]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Supplier Spend</h2>
          <p className="text-sm text-[var(--text-secondary)]">Analyze stock purchases by supplier and inspect received batch lots</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Suppliers Used</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_suppliers}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Spend</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.total_spend.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search supplier..."
        title="Supplier Records"
      />

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Supplier Name" columnKey="supplier_name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Intakes" columnKey="total_intakes" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Total Qty" columnKey="total_quantity" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Avg Unit Cost" columnKey="avg_unit_cost" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Total Spend" columnKey="total_spend" sortConfig={sortConfig} handleSort={handleSort} className="text-right text-indigo-500" />
                <SortableHeader label="Share %" columnKey="share_pct" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-20" />
                    {searchQuery ? "No matching records found." : "No supplier spend data found for this period."}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredData.map((item, idx) => {
                  const sKey = `${item.supplier_id || 'unknown'}-${idx}`;
                  const isExpanded = !!expandedSuppliers[sKey];
                  const batches = item.batches || [];

                  return (
                    <React.Fragment key={sKey}>
                      <tr
                        onClick={() => toggleSupplier(sKey)}
                        className="hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="p-1 rounded-md text-[var(--text-muted)] group-hover:text-indigo-400 transition"
                              title={isExpanded ? "Collapse batches" : "Expand batch breakdown"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-indigo-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <div>
                              <p className="font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                                {item.supplier_name}
                              </p>
                              <span className="text-xs text-[var(--text-muted)]">
                                {batches.length > 0 ? `${batches.length} batch lot${batches.length > 1 ? 's' : ''} received` : 'Click to view batches'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-medium">{item.total_intakes}</td>
                        <td className="px-6 py-4 text-right font-medium">{item.total_quantity}</td>
                        <td className="px-6 py-4 text-right text-[var(--text-secondary)]">₹{item.avg_unit_cost.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right font-bold text-indigo-500">₹{item.total_spend.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center rounded-md bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-subtle)]">
                            {item.share_pct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>

                      {/* Expandable Batch Lots Breakdown */}
                      {isExpanded && (
                        <tr className="bg-[var(--bg-surface)]/60">
                          <td colSpan={6} className="px-6 py-4 border-t border-b border-[var(--border-subtle)]">
                            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-inner space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
                                  <Layers className="h-3.5 w-3.5" />
                                  <span>Received Batch Lots Breakdown ({batches.length})</span>
                                </div>
                                <span className="text-xs text-[var(--text-muted)]">
                                  Supplier: <strong className="text-[var(--text-primary)]">{item.supplier_name}</strong>
                                </span>
                              </div>

                              {batches.length === 0 ? (
                                <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                                  No individual batch lot records found in this date window.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead>
                                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase font-semibold">
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">Batch Lot #</th>
                                        <th className="py-2 px-3">Item Name</th>
                                        <th className="py-2 px-3 text-right">Inward Qty</th>
                                        <th className="py-2 px-3 text-right">Remaining Stock</th>
                                        <th className="py-2 px-3 text-right">Unit Cost</th>
                                        <th className="py-2 px-3 text-right text-indigo-400 font-bold">Total Cost</th>
                                        <th className="py-2 px-3">Expiry Date</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-subtle)]">
                                      {batches.map((b: SupplierBatchRow) => (
                                        <tr key={b.intake_id} className="hover:bg-[var(--bg-surface)] transition">
                                          <td className="py-2 px-3 whitespace-nowrap text-[var(--text-secondary)] font-mono">
                                            {parseUTCDate(b.intake_date).toLocaleDateString()}
                                          </td>
                                          <td className="py-2 px-3">
                                            <span className="inline-flex items-center font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--bg-surface)] text-amber-400 border border-[var(--border-subtle)]">
                                              #{b.batch_number || b.intake_id.slice(0, 8)}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                                            {b.item_name}
                                          </td>
                                          <td className="py-2 px-3 text-right font-medium text-[var(--text-primary)]">
                                            {b.quantity}
                                          </td>
                                          <td className="py-2 px-3 text-right font-medium text-[var(--text-secondary)]">
                                            {b.remaining_quantity}
                                          </td>
                                          <td className="py-2 px-3 text-right text-[var(--text-secondary)]">
                                            ₹{b.unit_cost.toFixed(2)}
                                          </td>
                                          <td className="py-2 px-3 text-right font-bold text-indigo-400">
                                            ₹{b.total_cost.toFixed(2)}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap text-[var(--text-muted)]">
                                            {b.expiry_date ? parseUTCDate(b.expiry_date).toLocaleDateString() : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}