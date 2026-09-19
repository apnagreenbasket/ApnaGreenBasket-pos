import React from "react";
import { useTableSortAndSearch } from "../../hooks/useTableSortAndSearch";
import { SortableHeader, TableSearchBar } from "./shared";
import type { PaymentMixResponse, PaymentMixRow } from "@/types";

export function PaymentMixReport({ data }: { data: PaymentMixResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No payment mix data.</div>;
  
  const getMethodBadge = (m: PaymentMixRow) => {
    const pm = m.payment_method.toUpperCase();
    if (pm === "SPLIT") {
      return (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
          Cash + UPI
        </span>
      );
    }
    if (pm === "LOYALTY_POINTS") {
      return (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">
          Loyalty Rewards
        </span>
      );
    }
    if (pm === "STORE_CREDIT") {
      return (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500 dark:text-purple-400 border border-purple-500/30">
          Store Wallet
        </span>
      );
    }
    if (pm === "UDHAAR") {
      return (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30">
          Udhaar (Debit)
        </span>
      );
    }
    if (pm === "CASH") {
      return (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          Physical Cash
        </span>
      );
    }
    if (pm === "UPI") {
      return (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-500 dark:text-sky-400 border border-sky-500/30">
          Digital Online
        </span>
      );
    }
    return null;
  };

  const formatMethodName = (pm: string) => {
    switch (pm.toUpperCase()) {
      case "LOYALTY_POINTS":
        return "Loyalty Points Redeemed";
      case "STORE_CREDIT":
        return "Store Credit Used";
      case "UDHAAR":
        return "Customer Udhaar (Debit)";
      case "UPI":
        return "UPI / Online";
      default:
        return pm;
    }
  };

  const {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  } = useTableSortAndSearch(data.methods, ["payment_method", "breakdown_description"]);

  return (
    <div className="space-y-4">
      <TableSearchBar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        placeholder="Search methods..."
        title="Tender & Payment Mix Breakdown"
      />
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Settled payments across tenders reconciled with Customer Returns
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">Gross Billed:</span>
              <span className="font-bold text-[var(--text-primary)]">
                ₹{(data.gross_revenue != null && data.gross_revenue > 0 ? data.gross_revenue : data.total_revenue).toFixed(2)}
              </span>
            </div>
            {Number(data.total_refunded || 0) > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500">
                <span>Returns:</span>
                <span className="font-bold">-₹{Number(data.total_refunded).toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <span>Net Reconciled:</span>
              <span className="font-bold">₹{data.total_revenue.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
              <SortableHeader label="Method / Tender" columnKey="payment_method" sortConfig={sortConfig} handleSort={handleSort} className="!py-2.5" />
              <SortableHeader label="Orders" columnKey="orders_count" sortConfig={sortConfig} handleSort={handleSort} className="!py-2.5 text-right" />
              <SortableHeader label="Revenue" columnKey="total_revenue" sortConfig={sortConfig} handleSort={handleSort} className="!py-2.5 text-right" />
              <SortableHeader label="Share %" columnKey="revenue_share_pct" sortConfig={sortConfig} handleSort={handleSort} className="!py-2.5 text-right" />
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredData.map((m: PaymentMixRow) => (
              <tr key={m.payment_method} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-surface-elevated)]/50 transition-colors">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">
                      {formatMethodName(m.payment_method)}
                    </span>
                    {getMethodBadge(m)}
                  </div>
                  {m.breakdown_description && (
                    <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
                      <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] font-sans uppercase font-bold text-sky-400/90">Share</span>
                      <span>{m.breakdown_description}</span>
                    </div>
                  )}
                  {m.tender_type === "NON_CASH" && (
                    <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                      Non-cash tender / customer balance adjustment
                    </div>
                  )}
                </td>
                <td className="py-3 text-right font-medium">{m.orders_count}</td>
                <td className="py-3 text-right font-bold text-[var(--accent-brand)]">
                  <div>{m.total_revenue < 0 ? "-" : ""}₹{Math.abs(m.total_revenue).toFixed(2)}</div>
                  {m.payment_method.toUpperCase() === "SPLIT" && m.cash_amount != null && m.upi_amount != null && (
                    <div className="text-[11px] font-mono font-normal text-[var(--text-muted)]">
                      Cash: ₹{Number(m.cash_amount).toFixed(2)} | UPI: ₹{Number(m.upi_amount).toFixed(2)}
                    </div>
                  )}
                  {Number(m.total_refunded || 0) > 0 && (
                    <div className="text-[10px] text-amber-500 font-semibold">-₹{Number(m.total_refunded).toFixed(2)} ref</div>
                  )}
                </td>
                <td className="py-3 text-right font-bold font-mono text-sm">{m.revenue_share_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border-strong)] text-sm font-black text-[var(--text-primary)]">
              <td className="py-3">
                <div>Total Reconciled</div>
                <div className="text-[11px] font-normal text-[var(--text-muted)]">Gross Billed minus Customer Returns</div>
              </td>
              <td className="py-3 text-right">
                <div>{data.total_orders}</div>
                <div className="text-[10px] font-mono font-normal text-[var(--text-muted)]">distinct bills</div>
              </td>
              <td className="py-3 text-right font-mono text-[var(--accent-brand)]">
                <div>₹{data.total_revenue.toFixed(2)}</div>
                <div className="text-[10px] font-mono font-normal text-emerald-600 dark:text-emerald-400">Net Revenue</div>
              </td>
              <td className="py-3 text-right font-mono">100.0%</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
          <span>* Individual method rows indicate tender occurrences across bills. Total Reconciled equals distinct settled orders and matches Dashboard Net Revenue.</span>
        </div>
      </div>
    </div>
  );
}
