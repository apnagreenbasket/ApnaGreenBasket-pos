import React from "react";
import type { AovAnalyticsResponse } from "@/types";

export function AovReport({ data }: { data: AovAnalyticsResponse | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No AOV data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center shadow-xs">
        <p className="text-sm text-[var(--text-muted)] font-bold uppercase">Overall Average Order Value</p>
        <p className="text-4xl font-black text-[var(--accent-brand)] mt-2">₹{data.overall_aov.toFixed(2)}</p>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <h3 className="font-bold mb-4 text-[var(--text-primary)]">By Payment Method</h3>
          <div className="divide-y divide-[var(--border-subtle)]">
            {data.by_payment_method.map(pm => (
              <div key={pm.payment_method} className="py-3 flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{pm.payment_method}</span>
                    {(() => {
                      const badgeText = pm.tenders_present && pm.tenders_present.length > 1
                        ? (pm.tenders_present.length <= 3 
                            ? pm.tenders_present.join(" + ") 
                            : `${pm.tenders_present.slice(0, 2).join(" + ")} + ${pm.tenders_present.length - 2} more`)
                        : (pm.payment_method.toUpperCase() === "SPLIT" ? "Multi-Tender" : null);
                      if (!badgeText) return null;
                      return (
                        <span 
                          title={pm.tenders_present?.join(" + ")}
                          className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30"
                        >
                          {badgeText}
                        </span>
                      );
                    })()}
                    <span className="text-xs text-[var(--text-muted)] font-mono">
                      ({pm.orders_count} {pm.orders_count === 1 ? "order" : "orders"})
                    </span>
                  </div>
                  {pm.breakdown_description && (
                    <div className="text-[11px] font-mono text-[var(--text-muted)] flex items-center gap-1.5">
                      <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] font-sans uppercase font-bold text-sky-400/90">
                        Share
                      </span>
                      <span>{pm.breakdown_description}</span>
                    </div>
                  )}
                  {(() => {
                    const avgParts: string[] = [];
                    if (pm.avg_cash != null && pm.avg_cash > 0) avgParts.push(`Cash ₹${pm.avg_cash.toFixed(2)}`);
                    if (pm.avg_upi != null && pm.avg_upi > 0) avgParts.push(`UPI ₹${pm.avg_upi.toFixed(2)}`);
                    if (pm.avg_credit != null && pm.avg_credit > 0) avgParts.push(`Credit ₹${pm.avg_credit.toFixed(2)}`);
                    if (pm.avg_debit != null && pm.avg_debit > 0) avgParts.push(`Udhaar ₹${pm.avg_debit.toFixed(2)}`);
                    if (avgParts.length > 1) {
                      return (
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          Avg / order: {avgParts.join(" | ")}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-base text-[var(--accent-brand)]">
                    ₹{pm.avg_order_value.toFixed(2)}
                  </span>
                  {pm.total_revenue != null && (
                    <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                      Total: ₹{pm.total_revenue.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
