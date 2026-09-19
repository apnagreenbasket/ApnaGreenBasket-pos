import React from "react";
import { ArrowRight, Layers, IndianRupee, MousePointerClick } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import type { CategorySalesResponse } from "@/types";

export function CategorySalesReport({ 
  data, 
  onSelectCategory 
}: { 
  data: CategorySalesResponse | null;
  onSelectCategory?: (categoryId: string, categoryName: string) => void;
}) {
  if (!data || !data.items || data.items.length === 0) {
    return (
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--text-muted)] mb-3">
          <Layers className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-bold">No Category Sales Data</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          No category sales recorded for the selected date range.
        </p>
      </div>
    );
  }

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(data.items, ["category_name"]);

  return (
    <div className="space-y-3">
      {/* Header bar with drill-down tip */}
      {onSelectCategory && (
        <div className="flex items-center justify-between rounded-2xl bg-[var(--accent-brand)]/5 border border-[var(--accent-brand)]/15 px-4 py-2.5 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-[var(--accent-brand)] shrink-0" />
            <span>
              Click any category row below to drill down into its <strong className="text-[var(--text-primary)]">item-level sales, margins &amp; COGS</strong>.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--accent-brand)] hidden sm:inline-block">
            {data.items.length} {data.items.length === 1 ? "Category" : "Categories"}
          </span>
        </div>
      )}

      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search category..."
        title="Categories"
      />

      {/* Main Table */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <SortableHeader label="Category" columnKey="category_name" sortConfig={sortConfig} handleSort={handleSort} className="!py-3.5 !pl-5 !pr-3" />
                <SortableHeader label="Items Sold" columnKey="items_sold" sortConfig={sortConfig} handleSort={handleSort} className="!py-3.5 !px-3 text-right" />
                <SortableHeader label="Units Sold" columnKey="quantity_sold" sortConfig={sortConfig} handleSort={handleSort} className="!py-3.5 !px-3 text-right" />
                <SortableHeader label="Revenue" columnKey="revenue" sortConfig={sortConfig} handleSort={handleSort} className="!py-3.5 !px-3 text-right" />
                <SortableHeader label="Share %" columnKey="revenue_share_pct" sortConfig={sortConfig} handleSort={handleSort} className="!py-3.5 !px-3 text-right" />
                <th className="py-3.5 pl-3 pr-5 text-right font-bold uppercase tracking-wider text-[var(--text-muted)]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.map((c: any) => {
                const isClickable = Boolean(c.category_id && onSelectCategory);
                return (
                  <tr
                    key={c.category_id || c.category_name}
                    onClick={() => {
                      if (c.category_id && onSelectCategory) {
                        onSelectCategory(c.category_id, c.category_name);
                      }
                    }}
                    className={`transition-colors ${
                      isClickable 
                        ? "cursor-pointer hover:bg-[var(--bg-muted)]/50 group" 
                        : ""
                    }`}
                  >
                    {/* Category Name */}
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="font-bold text-[var(--text-main)] group-hover:text-[var(--accent-brand)] transition-colors flex items-center gap-2">
                        <span>{c.category_name}</span>
                      </div>
                      {c.avg_item_price ? (
                        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          Avg item price: ₹{c.avg_item_price.toFixed(2)}
                        </div>
                      ) : null}
                    </td>

                    {/* Unique Items Sold */}
                    <td className="py-3.5 px-3 text-right font-medium">
                      {c.items_sold ?? "—"}
                    </td>

                    {/* Total Quantity */}
                    <td className="py-3.5 px-3 text-right font-medium">
                      {c.quantity_sold % 1 === 0 ? c.quantity_sold : c.quantity_sold.toFixed(2)}
                    </td>

                    {/* Revenue */}
                    <td className="py-3.5 px-3 text-right font-bold text-[var(--text-main)]">
                      ₹{c.revenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Share % with mini bar */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 rounded-full bg-[var(--bg-muted)] overflow-hidden hidden sm:block">
                          <div 
                            className="h-full bg-[var(--accent-brand)] rounded-full" 
                            style={{ width: `${Math.min(100, Math.max(0, c.revenue_share_pct || 0))}%` }}
                          />
                        </div>
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          {(c.revenue_share_pct || 0).toFixed(1)}%
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 pl-3 pr-5 text-right">
                      {isClickable ? (
                        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-[var(--accent-brand)] bg-[var(--accent-brand)]/10 group-hover:bg-[var(--accent-brand)] group-hover:text-[var(--text-on-accent)] transition-all">
                          <span>View Items</span>
                          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
