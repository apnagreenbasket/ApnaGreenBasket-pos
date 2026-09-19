import React from "react";
import { Banknote, WalletCards } from "lucide-react";
import { CashDenominationResponse } from "@/types";

type Props = {
  data: CashDenominationResponse | null;
  isLoading: boolean;
};

export function CashDenominationReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading cash flow data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Cash Denominations</h2>
          <p className="text-sm text-[var(--text-secondary)]">Real-time breakdown of cash drawer notes</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Cash Transactions</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_transactions}</span>
          </div>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${
          data.net_cash_in_drawer >= 0
            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
            : "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400"
        }`}>
          <p className="text-sm font-medium">Net Cash in Drawer</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono">₹{data.net_cash_in_drawer.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overall Denominations */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-[var(--accent-brand)]" />
              Note Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm h-full">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold">Note</th>
                  <th className="px-4 py-4 font-semibold text-right text-emerald-600 dark:text-emerald-400">In</th>
                  <th className="px-4 py-4 font-semibold text-right text-rose-600 dark:text-rose-400">Out</th>
                  <th className="px-4 py-4 font-semibold text-right">Net</th>
                  <th className="px-6 py-4 font-semibold text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.overall_denominations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                      No notes recorded in drawer.
                    </td>
                  </tr>
                ) : (
                  data.overall_denominations.map((denom, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-6 py-4 font-bold text-[var(--text-primary)]">
                        ₹{denom.denomination}
                      </td>
                      <td className="px-4 py-4 text-right text-emerald-600 dark:text-emerald-400 font-mono font-medium">+{denom.notes_in}</td>
                      <td className="px-4 py-4 text-right text-rose-600 dark:text-rose-400 font-mono font-medium">-{denom.notes_out}</td>
                      <td className={`px-4 py-4 text-right font-mono font-bold ${denom.net_notes < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-primary)]'}`}>
                        {denom.net_notes}
                      </td>
                      <td className="px-6 py-4 text-right font-bold font-mono text-[var(--text-primary)]">₹{denom.net_value.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transaction Types */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="font-semibold text-[var(--text-primary)]">Flow by Transaction Type</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm h-full">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs">
                <tr>
                  <th className="px-5 py-4 font-semibold w-1/3">Type</th>
                  <th className="px-3 py-4 font-semibold text-center w-1/6">Tx Count</th>
                  <th className="px-5 py-4 font-semibold text-right w-1/2">Primary Note Flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.by_transaction_type.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-[var(--text-secondary)]">
                      No transaction types found.
                    </td>
                  </tr>
                ) : (
                  data.by_transaction_type.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-bold text-[var(--text-primary)] block text-xs">
                          {tx.transaction_type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center font-mono font-semibold text-[var(--text-secondary)]">
                        {tx.total_transactions}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-full">
                          {tx.denominations.length > 0 ? (
                            tx.denominations.map((d, dIdx) => (
                              <span
                                key={dIdx}
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                                  d.net_notes > 0
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
                                    : d.net_notes < 0
                                    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60"
                                    : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                                }`}
                              >
                                {d.net_notes > 0 ? `+${d.net_notes}` : d.net_notes}×₹{d.denomination}
                              </span>
                            ))
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">None</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}