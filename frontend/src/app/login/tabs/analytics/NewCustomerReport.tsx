import React from "react";
import { UserPlus, TrendingUp } from "lucide-react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import { NewCustomerReportResponse } from "@/types";
import { parseUTCDate } from "@/lib/api";

type Props = {
  data: NewCustomerReportResponse | null;
  isLoading: boolean;
  page?: number;
  setPage?: (p: number) => void;
  pageSize?: number;
};

export function NewCustomerReport({
  data,
  isLoading,
  page = 1,
  setPage,
  pageSize = 50,
}: Props) {
  const recentCustomers = data?.recent_customers || [];
  const totalNewCustomers = data?.total_new_customers || 0;
  const totalPages = Math.max(1, Math.ceil(totalNewCustomers / pageSize));
  const startItem = totalNewCustomers === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalNewCustomers);

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData,
  } = useTableSortAndSearch(recentCustomers, ["name", "phone", "email"]);

  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading new customer data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">New Customers</h2>
          <p className="text-sm text-[var(--text-secondary)]">Customer acquisition and growth trend</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">New Customers in Period</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_new_customers}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Customers (All Time)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_customers_all_time}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--accent-brand)]" />
            Acquisition Trend
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Period</th>
                <th className="px-6 py-4 font-semibold text-right">New Customers</th>
                <th className="px-6 py-4 font-semibold text-right">Cumulative Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.trend.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    No acquisition data found for this period.
                  </td>
                </tr>
              ) : (
                data.trend.map((bucket, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      {bucket.bucket}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-blue-500">+{bucket.new_count}</td>
                    <td className="px-6 py-4 text-right text-[var(--text-secondary)]">{bucket.cumulative_total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden mt-6">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex justify-between items-center gap-4 flex-wrap">
          <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[var(--accent-brand)]" />
            Recently Boarded Customers
          </h3>
          <div className="w-full sm:w-auto">
            <TableSearchBar 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              placeholder="Search name or contact..."
              title=""
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <tr>
                <SortableHeader label="Join Date" columnKey="created_at" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Name" columnKey="name" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Contact" columnKey="phone" sortConfig={sortConfig} handleSort={handleSort} />
                <SortableHeader label="Total Orders" columnKey="total_orders" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
                <SortableHeader label="Total Spent" columnKey="total_spent" sortConfig={sortConfig} handleSort={handleSort} className="text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {sortedAndFilteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                    {searchQuery ? "No matching customers found." : "No new customers found for this period."}
                  </td>
                </tr>
              ) : (
                sortedAndFilteredData.map((c, idx) => (
                  <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-6 py-4 text-[var(--text-secondary)]">
                      {parseUTCDate(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-[var(--text-primary)]">
                      {c.name || "Unknown"}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">
                      {c.phone || c.email || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.total_orders}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      INR {c.total_spent}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalNewCustomers > 0 && setPage && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3 text-xs text-[var(--text-muted)]">
            <div>
              Showing <span className="font-semibold text-[var(--text-primary)]">{startItem}–{endItem}</span> of{" "}
              <span className="font-semibold text-[var(--text-primary)]">{totalNewCustomers}</span> customers (Page {page} of {totalPages})
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-surface-elevated)] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-[var(--text-primary)]"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pNum: number;
                if (totalPages <= 5) {
                  pNum = i + 1;
                } else if (page <= 3) {
                  pNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pNum = totalPages - 4 + i;
                } else {
                  pNum = page - 2 + i;
                }
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`min-w-[32px] px-2.5 py-1.5 rounded-lg border font-semibold transition text-xs ${
                      page === pNum
                        ? "bg-[var(--accent-brand)] border-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-surface-elevated)] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-[var(--text-primary)]"
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