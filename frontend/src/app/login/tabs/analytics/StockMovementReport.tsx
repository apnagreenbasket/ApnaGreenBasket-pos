import React, { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, PackageOpen, X, Loader2 } from "lucide-react";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { parseUTCDate, formatLocalDate } from "@/lib/api";
import { StockMovementResponse } from "@/types";

type Props = {
  data: StockMovementResponse | null;
  isLoading: boolean;
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
}

export function StockMovementReport({ data, isLoading }: Props) {
  const { apiRequest } = useAdminAuth();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<StockLedgerPageResponse | null>(null);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  useEffect(() => {
    if (!selectedItemId) {
      setLedgerData(null);
      return;
    }
    const fetchLedger = async () => {
      setIsLoadingLedger(true);
      try {
        const res = await apiRequest<StockLedgerPageResponse>(
          `/api/admin/inventory/ledger?item_id=${selectedItemId}&page_size=100`
        );
        setLedgerData(res);
      } catch (err) {
        console.error("Failed to load item ledger", err);
      } finally {
        setIsLoadingLedger(false);
      }
    };
    fetchLedger();
  }, [selectedItemId, apiRequest]);

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading stock movement...</div>;
  }
  if (!data) return null;

  const enrichedItems = useMemo(() => {
    if (!data) return [];
    return data.items.map(item => ({
      ...item,
      total_in: item.intake_qty + item.restock_qty,
      total_out: item.sales_deduction_qty + item.purchase_return_qty + item.void_batch_qty
    }));
  }, [data]);

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(enrichedItems, ["item_name"]);

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
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {selectedItemName} Ledger
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">Recent stock movements</p>
              </div>
              <button
                onClick={() => setSelectedItemId(null)}
                className="p-2 rounded-full hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
              {isLoadingLedger ? (
                <div className="flex flex-col items-center justify-center p-12 text-[var(--text-secondary)]">
                  <Loader2 className="h-8 w-8 animate-spin mb-4 text-[var(--accent-brand)]" />
                  <p>Loading ledger entries...</p>
                </div>
              ) : ledgerData?.items.length === 0 ? (
                <div className="p-12 text-center text-[var(--text-secondary)]">
                  No recent ledger entries found.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--bg-surface)] sticky top-0 border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Date & Time</th>
                      <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Type</th>
                      <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Change</th>
                      <th className="px-6 py-3 font-semibold text-right text-[var(--text-secondary)]">Balance</th>
                      <th className="px-6 py-3 font-semibold text-[var(--text-secondary)]">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {ledgerData?.items.map((row) => (
                      <tr key={row.id} className="hover:bg-[var(--bg-surface)]/50">
                        <td className="px-6 py-3">
                          {formatLocalDate(parseUTCDate(row.created_at))} <span className="text-xs text-[var(--text-muted)]">{parseUTCDate(row.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
          </div>
        </div>
      )}
    </div>
  );
}