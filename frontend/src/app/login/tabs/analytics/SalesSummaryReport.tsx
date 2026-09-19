import React from "react";
import type { ItemSalesResponse } from "@/types";

type Props = {
  data: ItemSalesResponse | null;
};

export function SalesSummaryReport({ data }: Props) {
  if (!data?.reconciliation_bridge) {
    return <div className="p-12 text-center text-[var(--text-muted)] text-sm">No summary data available.</div>;
  }

  const rb = data.reconciliation_bridge;

  // Section A — Catalog Movement (informational)
  const grossItem = rb.gross_item_sales;
  const delivery = rb.delivery_and_handling_charges ?? rb.taxes_and_charges;
  const grossSalesAndService = grossItem + delivery;
  const billDiscounts = rb.bill_discounts;
  const grossEffective = grossSalesAndService - billDiscounts;

  // Rounding bridge
  const roundingAdj = rb.rounding_adjustment ?? 0;

  // Section B — Authoritative Financial (tied to Dashboard)
  const grossBilled = rb.gross_billed_revenue ?? grossEffective + roundingAdj;
  const customerReturns = rb.customer_returns;
  const netRevenue = grossBilled - customerReturns;
  const loyalty = rb.loyalty_discounts;
  const netRealised = netRevenue - loyalty;

  const formatAmt = (num: number) => num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs max-w-3xl mx-auto">
        <div className="border-b border-[var(--border-subtle)] pb-4 mb-4">
          <h2 className="text-lg font-bold font-display flex items-center gap-2">
            Sales &amp; Revenue Summary
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Line-by-line reconciliation from catalog movement to final net counter revenue.
          </p>
        </div>

        <div className="space-y-3 font-mono text-sm">
          {/* ── SECTION A: Catalog Movement Breakdown ── */}
          <div className="mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-sans">
              Catalog Movement
            </span>
          </div>

          {/* 1. Gross Item Sales */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)]">Gross Item Sales (Catalog Value)</span>
            <span className="font-semibold text-[var(--text-primary)]">₹{formatAmt(grossItem)}</span>
          </div>

          {/* 2. Gross Service Sales */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)]">Gross Service Sales (Delivery &amp; Handling)</span>
            <span className="font-semibold text-indigo-500 dark:text-indigo-400">+₹{formatAmt(delivery)}</span>
          </div>

          {/* 3. Gross Sales and Service */}
          <div className="flex justify-between items-center py-3 bg-[var(--bg-surface-elevated)] px-3 rounded-lg border border-[var(--border-subtle)]">
            <span className="font-bold text-[var(--text-primary)]">Gross Sales and Service</span>
            <span className="font-black text-[var(--text-primary)]">₹{formatAmt(grossSalesAndService)}</span>
          </div>

          {/* 4. Bill Discounts */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)]">Bill Discounts (Coupons &amp; Concessions)</span>
            <span className="font-semibold text-amber-500">-₹{formatAmt(billDiscounts)}</span>
          </div>

          {/* 5. Gross Effective Sales and Service */}
          <div className="flex justify-between items-center py-3 bg-[var(--bg-surface-elevated)] px-3 rounded-lg border border-[var(--border-subtle)]">
            <span className="font-bold text-[var(--text-primary)]">Gross Effective Sales and Service</span>
            <span className="font-black text-[var(--text-primary)]">₹{formatAmt(grossEffective)}</span>
          </div>

          {/* ── ROUNDING BRIDGE ── */}
          {roundingAdj !== 0 && (
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
              <span className="text-[var(--text-muted)]">
                Bill Rounding Adjustments
                <span className="text-[10px] opacity-60 ml-1">(per-bill rounding to nearest ₹)</span>
              </span>
              <span className={`font-semibold ${roundingAdj >= 0 ? "text-sky-500" : "text-amber-500"}`}>
                {roundingAdj >= 0 ? "+" : ""}₹{formatAmt(roundingAdj)}
              </span>
            </div>
          )}

          {/* ── SECTION B: Authoritative Financial Summary ── */}
          <div className="mt-5 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-sans">
              Financial Summary
            </span>
          </div>

          {/* 6. Gross Billed Revenue */}
          <div className="flex justify-between items-center py-3 bg-[var(--bg-surface-elevated)] px-3 rounded-lg border border-[var(--border-subtle)]">
            <span className="font-bold text-[var(--text-primary)]">
              Gross Billed Revenue
              <span className="text-[10px] font-normal opacity-60 ml-1">(Excl. Voided)</span>
            </span>
            <span className="font-black text-[var(--text-primary)]">₹{formatAmt(grossBilled)}</span>
          </div>

          {/* 7. Customer Returns */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)]">Customer Returns (Damaged / Returned)</span>
            <span className="font-semibold text-rose-500">-₹{formatAmt(customerReturns)}</span>
          </div>



          {/* 8. Net Revenue */}
          <div className="flex justify-between items-center py-3 bg-emerald-500/5 px-3 rounded-lg border border-emerald-500/20">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              Net Revenue <span className="text-[10px] font-normal opacity-75">(Tied to Dashboard)</span>
            </span>
            <span className="font-black text-emerald-600 dark:text-emerald-400">₹{formatAmt(netRevenue)}</span>
          </div>

          {/* 9. Loyalty */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)]">Loyalty Point Redemption</span>
            <span className="font-semibold text-sky-500">-₹{formatAmt(loyalty)}</span>
          </div>

          {/* 10. Net Realised Revenue */}
          <div className="flex justify-between items-center py-4 bg-emerald-500/10 px-4 rounded-xl border border-emerald-500/30 mt-4">
            <span className="font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Net Realised Revenue <span className="text-xs font-normal opacity-75">(Cash Realised)</span>
            </span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">₹{formatAmt(netRealised)}</span>
          </div>
        </div>

        {/* Statutory Tax Note */}
        {rb.extracted_gst_amount !== undefined && (
          <div className="mt-6 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between text-xs text-[var(--text-muted)] gap-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-purple-400 shrink-0"></span>
              <span>
                Catalog prices are <strong className="text-[var(--text-primary)]">tax-inclusive</strong>. Gross item sales embed{" "}
                <strong className="text-purple-500 dark:text-purple-400 font-mono">
                  ₹{rb.extracted_gst_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>{" "}
                statutory GST across{" "}
                <strong className="text-[var(--text-primary)] font-mono">
                  {rb.taxable_bills_count ?? 0}
                </strong>{" "}
                taxable bills.
              </span>
            </span>
            <span className="text-[11px] text-[var(--text-muted)] italic">
              Taxable Base = ₹{(grossItem - (rb.extracted_gst_amount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
