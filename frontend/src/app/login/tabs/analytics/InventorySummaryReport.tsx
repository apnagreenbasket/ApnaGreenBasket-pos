import React from "react";
import {
  Boxes,
  TrendingUp,
  Trash2,
  Undo2,
  PackageCheck,
  CircleDollarSign,
  Layers,
  ArrowRight,
  CheckCircle2,
  Tag,
  Warehouse,
} from "lucide-react";
import type { InventorySummaryReportResponse } from "@/types";

type Props = {
  data: InventorySummaryReportResponse | null;
  isLoading?: boolean;
};

export function InventorySummaryReport({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-6 w-48 bg-[var(--bg-surface-elevated)] rounded-lg" />
        <div className="h-4 w-80 bg-[var(--bg-surface-elevated)] rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-[var(--bg-surface-elevated)] rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-[var(--bg-surface-elevated)] rounded-2xl mt-4" />
      </div>
    );
  }

  if (!data?.reconciliation_bridge) {
    return (
      <div className="p-12 text-center text-[var(--text-muted)] text-sm rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-w-4xl mx-auto">
        <Boxes className="h-10 w-10 mx-auto opacity-40 mb-3" />
        <p className="font-semibold">No inventory summary data available for this date range.</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">Try selecting a different date preset above.</p>
      </div>
    );
  }

  const rb = data.reconciliation_bridge;

  const formatAmt = (num: number | undefined | null) =>
    (num ?? 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const netRev = rb.net_sold_revenue ?? rb.sold_inventory_revenue ?? 0;
  const marginPct =
    netRev > 0
      ? ((rb.realized_net_profit / netRev) * 100).toFixed(1)
      : "0.0";

  const openingVal = rb.opening_stock_value ?? 0;
  const closingVal = rb.closing_stock_value ?? rb.current_holding_value ?? 0;
  const totalGoodsAvailable = openingVal + rb.net_supplier_spend;

  const wastagePctOfAvailable =
    totalGoodsAvailable > 0
      ? ((rb.wastage_cost / totalGoodsAvailable) * 100).toFixed(1)
      : "0.0";

  // Check if Section A balances mathematically
  const calculatedClosing = openingVal + rb.net_supplier_spend - rb.cost_of_goods_sold - rb.wastage_cost + rb.manual_adjustments;
  const bridgeDiscrepancy = Math.abs(calculatedClosing - closingVal);
  const isBridgeBalanced = bridgeDiscrepancy < 0.05;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Top Executive KPI Tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Tile 1: Supplier Spend */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium mb-1">
            <span>Supplier Spend</span>
            <Boxes className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <p className="font-mono text-base sm:text-lg font-bold text-[var(--text-primary)]">
            ₹{formatAmt(rb.gross_inward_spend)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 font-mono">
            ₹{formatAmt(rb.net_supplier_spend)} net
          </span>
        </div>

        {/* Tile 2: Wastage Loss */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium mb-1">
            <span>Wastage Loss</span>
            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <p className="font-mono text-base sm:text-lg font-bold text-rose-400">
            ₹{formatAmt(rb.wastage_cost)}
          </p>
          <span className="text-[10px] text-rose-400/80 block mt-0.5 font-mono">
            {wastagePctOfAvailable}% of stock
          </span>
        </div>

        {/* Tile 3: COGS */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium mb-1">
            <span>Sold Cost (COGS)</span>
            <Layers className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <p className="font-mono text-base sm:text-lg font-bold text-amber-400">
            ₹{formatAmt(rb.cost_of_goods_sold)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">Stock Depleted</span>
        </div>

        {/* Tile 4: Net Sold Revenue */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium mb-1">
            <span>Net Revenue</span>
            <CircleDollarSign className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p className="font-mono text-base sm:text-lg font-bold text-emerald-400">
            ₹{formatAmt(netRev)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 font-mono">
            ₹{formatAmt(rb.sold_inventory_revenue)} gross
          </span>
        </div>

        {/* Tile 5: Realized Merchandise Profit */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-emerald-400 font-medium mb-1">
            <span>Realized Profit</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p
            className={`font-mono text-base sm:text-lg font-bold ${
              rb.realized_net_profit >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            ₹{formatAmt(rb.realized_net_profit)}
          </p>
          <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-mono">
            {marginPct}% margin
          </span>
        </div>

        {/* Tile 6: Closing Stock Asset */}
        <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-purple-300 font-medium mb-1">
            <span>Closing Stock</span>
            <PackageCheck className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <p className="font-mono text-base sm:text-lg font-bold text-purple-300">
            ₹{formatAmt(closingVal)}
          </p>
          <span className="text-[10px] text-purple-300/80 block mt-0.5 font-mono">
            ₹{formatAmt(openingVal)} opening
          </span>
        </div>
      </div>

      {/* ── Main Reconciliation Card ── */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="border-b border-[var(--border-subtle)] pb-4 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold font-display flex items-center gap-2 text-[var(--text-primary)]">
                <Boxes className="h-5 w-5 text-[var(--accent-brand)]" />
                Inventory &amp; Stock Summary
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Full-cycle inventory asset valuation and commercial trading reconciliation.
              </p>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono bg-[var(--bg-surface-elevated)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] self-start sm:self-auto">
              Period: {new Date(data.from_date).toLocaleDateString("en-IN")} →{" "}
              {new Date(data.to_date).toLocaleDateString("en-IN")}
            </div>
          </div>
        </div>

        <div className="space-y-4 font-mono text-sm">
          {/* ════════════════════════════════════════════════════════════════
              SECTION A: INVENTORY ASSET VALUATION & PHYSICAL MOVEMENT BRIDGE
             ════════════════════════════════════════════════════════════════ */}
          <div className="pt-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-sans flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
              Section A: Stock Asset Valuation &amp; Movement Bridge
            </span>
            {isBridgeBalanced && (
              <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />
                Reconciliation Balanced (₹0.00 Variance)
              </span>
            )}
          </div>

          {/* 1. Opening Stock Value */}
          <div className="flex justify-between items-center py-2.5 bg-[var(--bg-surface-elevated)] px-3 rounded-xl border border-[var(--border-subtle)]">
            <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm flex items-center gap-1.5">
              <Warehouse className="h-4 w-4 text-purple-400" />
              Opening Stock Asset Value (On Hand at Period Start)
            </span>
            <span className="font-black text-[var(--text-primary)]">
              ₹{formatAmt(openingVal)}
            </span>
          </div>

          {/* 2. Gross Inward Supplier Spend */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm">
              Plus: Gross Inward Supplier Spend (Stock Intake Batches)
            </span>
            <span className="font-semibold text-[var(--text-primary)]">
              +₹{formatAmt(rb.gross_inward_spend)}
            </span>
          </div>

          {/* 3. Purchase Returns */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-1">
              <Undo2 className="h-3.5 w-3.5 text-rose-400" />
              Less: Purchase Returns to Suppliers (Refunds &amp; Debit Notes)
            </span>
            <span className="font-semibold text-rose-400">
              -₹{formatAmt(rb.purchase_returns)}
            </span>
          </div>

          {/* 4. Net Supplier Spend Subtotal */}
          <div className="flex justify-between items-center py-2 px-3 bg-cyan-500/5 rounded-xl border border-cyan-500/20">
            <span className="text-cyan-300 text-xs sm:text-sm font-semibold">
              Net Supplier Spend (Actual Period Procurement Outlay)
            </span>
            <span className="font-bold text-cyan-300">
              ₹{formatAmt(rb.net_supplier_spend)}
            </span>
          </div>

          {/* 5. Total Available Goods for Sale */}
          <div className="flex justify-between items-center py-2.5 bg-[var(--bg-surface-elevated)] px-3 rounded-xl border border-[var(--border-subtle)]">
            <div>
              <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm block">
                Total Stock Assets Available for Sale
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-sans block mt-0.5">
                Opening Stock (₹{formatAmt(openingVal)}) + Net Supplier Inward (₹{formatAmt(rb.net_supplier_spend)})
              </span>
            </div>
            <span className="font-black text-base text-[var(--text-primary)]">
              ₹{formatAmt(totalGoodsAvailable)}
            </span>
          </div>

          {/* 6. Less COGS */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm">
              Less: Cost of Goods Sold (Procurement Cost of Billed Items)
            </span>
            <span className="font-semibold text-amber-400">
              -₹{formatAmt(rb.cost_of_goods_sold)}
            </span>
          </div>

          {/* 7. Less Wastage */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-1">
              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
              Less: Operational Wastage &amp; Spoilage Loss (Damaged, Expired &amp; Voids)
            </span>
            <span className="font-semibold text-rose-400">
              -₹{formatAmt(rb.wastage_cost)}
            </span>
          </div>

          {/* 8. Physical Stock Audit Adjustments */}
          {rb.manual_adjustments !== 0 && (
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
              <span className="text-[var(--text-muted)] text-xs sm:text-sm">
                Physical Stock Audit Discrepancies (Count Variances)
              </span>
              <span
                className={`font-semibold ${
                  rb.manual_adjustments >= 0 ? "text-sky-400" : "text-amber-400"
                }`}
              >
                {rb.manual_adjustments >= 0 ? "+" : "-"}₹{formatAmt(Math.abs(rb.manual_adjustments))}
              </span>
            </div>
          )}

          {/* 9. Closing Stock Asset Value */}
          <div className="flex justify-between items-center py-3 bg-purple-500/10 px-3.5 rounded-xl border border-purple-500/30">
            <div>
              <span className="font-bold text-purple-300 text-xs sm:text-sm block">
                Closing Stock Asset Value (On Shelves at Period End)
              </span>
              <span className="text-[10px] text-[var(--text-muted)] block font-sans mt-0.5">
                Active commercial assets retained on store shelves at unit intake cost
              </span>
            </div>
            <span className="font-black text-base sm:text-lg text-purple-300">
              ₹{formatAmt(closingVal)}
            </span>
          </div>

          {/* Balanced Bridge Equation Bar */}
          <div className="bg-[var(--bg-surface-elevated)]/70 rounded-xl p-3 border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex flex-wrap items-center justify-between gap-2 font-sans">
            <span className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="font-semibold text-[var(--text-primary)]">Stock Bridge Formula:</span>
            </span>
            <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
              <span>Opening (₹{formatAmt(openingVal)})</span>
              <span>+ Inward (₹{formatAmt(rb.net_supplier_spend)})</span>
              <span>- COGS (₹{formatAmt(rb.cost_of_goods_sold)})</span>
              <span>- Wastage (₹{formatAmt(rb.wastage_cost)})</span>
              {rb.manual_adjustments !== 0 && (
                <span>
                  {rb.manual_adjustments >= 0 ? "+" : "-"} Adj (₹{formatAmt(Math.abs(rb.manual_adjustments))})
                </span>
              )}
              <span className="text-emerald-400 font-bold">= Closing (₹{formatAmt(closingVal)})</span>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              SECTION B: COMMERCIAL RETURN & INVENTORY PROFITABILITY
             ════════════════════════════════════════════════════════════════ */}
          <div className="pt-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-sans flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              Section B: Commercial Return &amp; Inventory Profitability
            </span>
          </div>

          {/* 10. Gross Sold Inventory Revenue */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm">
              Gross Counter Sales (Menu / Sticker Value of Sold Items)
            </span>
            <span className="font-semibold text-[var(--text-primary)]">
              ₹{formatAmt(rb.sold_inventory_revenue)}
            </span>
          </div>

          {/* 11. Less Discounts */}
          {(rb.customer_discounts ?? 0) > 0 && (
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
              <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-amber-400" />
                Less: Customer Bill Discounts &amp; Loyalty Points Redeemed
              </span>
              <span className="font-semibold text-amber-400">
                -₹{formatAmt(rb.customer_discounts)}
              </span>
            </div>
          )}

          {/* 12. Net Realized Sales Revenue */}
          <div className="flex justify-between items-center py-2.5 bg-[var(--bg-surface-elevated)] px-3 rounded-xl border border-[var(--border-subtle)]">
            <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">
              Net Realized Sales Revenue (Actual Billed Cash / Digital Inflow)
            </span>
            <span className="font-black text-[var(--text-primary)]">
              ₹{formatAmt(netRev)}
            </span>
          </div>

          {/* 13. Less COGS */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm">
              Less: Cost of Goods Sold (Direct Procurement Cost of Sold Items)
            </span>
            <span className="font-semibold text-amber-400">
              -₹{formatAmt(rb.cost_of_goods_sold)}
            </span>
          </div>

          {/* 14. Gross Realized Merchandise Margin */}
          <div className="flex justify-between items-center py-2.5 bg-[var(--bg-surface-elevated)] px-3 rounded-xl border border-[var(--border-subtle)]">
            <span className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">
              Gross Realized Merchandise Margin
            </span>
            <span className="font-black text-[var(--text-primary)]">
              ₹{formatAmt(rb.gross_merchandise_margin)}
            </span>
          </div>

          {/* 15. Less Wastage */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-1">
              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
              Less: Direct Operational Wastage &amp; Spoilage Loss
            </span>
            <span className="font-semibold text-rose-400">
              -₹{formatAmt(rb.wastage_cost)}
            </span>
          </div>

          {/* 16. Audit Adjustments */}
          {rb.manual_adjustments !== 0 && (
            <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
              <span className="text-[var(--text-muted)] text-xs sm:text-sm">
                Physical Audit Variance on Cost
              </span>
              <span
                className={`font-semibold ${
                  rb.manual_adjustments >= 0 ? "text-sky-400" : "text-amber-400"
                }`}
              >
                {rb.manual_adjustments >= 0 ? "+" : "-"}₹{formatAmt(Math.abs(rb.manual_adjustments))}
              </span>
            </div>
          )}

          {/* 17. Realized Net Merchandise Profit */}
          <div className="flex justify-between items-center py-3 bg-emerald-500/10 px-3.5 rounded-xl border border-emerald-500/30">
            <div>
              <span className="font-bold text-emerald-400 text-xs sm:text-sm block">
                Realized Net Merchandise Profit
              </span>
              <span className="text-[10px] text-[var(--text-muted)] block font-sans mt-0.5">
                Net trading income realized from inventory movement in this period
              </span>
            </div>
            <span className="font-black text-base sm:text-lg text-emerald-400">
              ₹{formatAmt(rb.realized_net_profit)}
            </span>
          </div>

          {/* 18. Closing Holding Asset Addition */}
          <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]/50">
            <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-1">
              <PackageCheck className="h-3.5 w-3.5 text-purple-400" />
              Plus: Closing Unsold Inventory Asset Value (Retained on Shelves)
            </span>
            <span className="font-semibold text-purple-300">
              +₹{formatAmt(closingVal)}
            </span>
          </div>

          {/* 19. Total Retained & Generated Economic Value */}
          <div className="flex justify-between items-center py-4 bg-gradient-to-r from-emerald-950/40 via-[var(--bg-surface-elevated)] to-purple-950/40 px-4 rounded-2xl border border-emerald-500/40 mt-3">
            <div>
              <span className="font-black uppercase tracking-wider text-emerald-400 text-xs sm:text-sm block">
                Total Retained &amp; Generated Economic Value
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-sans block mt-0.5">
                Realized Net Cash Profit + Active Closing Stock Assets
              </span>
            </div>
            <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
              ₹{formatAmt(rb.total_economic_value)}
            </span>
          </div>
        </div>

        {/* Informational Accounting Footer */}
        <div className="mt-6 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between text-xs text-[var(--text-muted)] gap-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0"></span>
            <span>
              Unsold inventory is maintained as a working capital asset at intake cost price (₹
              <strong className="text-purple-300 font-mono">
                {formatAmt(closingVal)}
              </strong>
              ) until sold at the counter.
            </span>
          </span>
          <span className="text-[11px] text-[var(--text-muted)] italic font-mono">
            GAAP Weighted Inventory Bridge
          </span>
        </div>
      </div>
    </div>
  );
}
