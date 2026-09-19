import React from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock, DollarSign, Flame, Percent, ShoppingBag, Info } from "lucide-react";
import type { AnalyticsKpiSummary, FunnelAnalytics, PeakHoursAnalytics, RevenueAnalytics, TopItemsAnalytics } from "@/types";

type Props = {
  kpiData: AnalyticsKpiSummary | null;
  revenueData: RevenueAnalytics | null;
  peakHoursData: PeakHoursAnalytics | null;
  topItemsData: TopItemsAnalytics | null;
  funnelData: FunnelAnalytics | null;
};

export function DashboardReport({ kpiData, revenueData, peakHoursData, topItemsData, funnelData }: Props) {
  if (!kpiData) return <div className="p-12 text-center text-[var(--text-muted)] text-sm">No dashboard data available.</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase overflow-visible">
            <span className="relative group/tooltip flex items-center gap-1.5">
              Net Revenue
              <Info className="h-3.5 w-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-help transition-colors" />
              <div className="pointer-events-none absolute left-0 top-full mt-2 w-64 opacity-0 transition-opacity group-hover/tooltip:opacity-100 z-50">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 shadow-xl text-[var(--text-primary)] font-medium normal-case tracking-normal">
                  <p className="mb-2 text-xs"><strong className="text-[var(--text-primary)] font-bold">Calculation:</strong> Gross Billed (Excl. Voided) <span className="text-[10px] opacity-70">(Tax &amp; Service Charge Inclusive, Discounts Pre-Applied)</span> − Customer Returns.</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Note: Loyalty points redeemed are treated as tender/cash and do not reduce Dashboard Net Revenue.</p>
                </div>
              </div>
            </span>
            <DollarSign className="h-4 w-4" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">₹{kpiData.total_revenue.toLocaleString()}</p>
            <span className={`text-[10px] font-bold ${kpiData.revenue_change_pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {kpiData.revenue_change_pct >= 0 ? "+" : ""}{kpiData.revenue_change_pct}%
            </span>
          </div>
          {kpiData.total_return_amount > 0 && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
              <span>Gross Billed: ₹{(kpiData.gross_revenue ?? (kpiData.total_revenue + kpiData.total_return_amount)).toLocaleString()}</span>
              <span className="text-rose-400">Returns: -₹{kpiData.total_return_amount.toLocaleString()}</span>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase"><span>Orders</span><ShoppingBag className="h-4 w-4" /></div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">{kpiData.total_orders}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase"><span>New Customers</span><Activity className="h-4 w-4" /></div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">{kpiData.new_customers}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 shadow-xs">
          <div className="flex justify-between text-xs text-orange-600/70 font-bold uppercase overflow-visible">
            <span className="relative group/tooltip flex items-center gap-1.5">
              Voided Bills (Edited)
              <Info className="h-3.5 w-3.5 text-orange-500/50 hover:text-orange-600 cursor-help transition-colors" />
              <div className="pointer-events-none absolute right-0 top-full mt-2 w-64 opacity-0 transition-opacity group-hover/tooltip:opacity-100 z-50">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 shadow-xl text-[var(--text-primary)] font-medium normal-case tracking-normal">
                  <p className="mb-2 text-xs"><strong className="text-[var(--text-primary)] font-bold">What is this?</strong> Bills that were edited, which voids the original bill.</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Voided bills are structurally returns, but are tracked separately from genuine customer returns.</p>
                </div>
              </div>
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black text-orange-600">₹{(kpiData as any).void_return_amount?.toLocaleString() || "0"}</p>
          </div>
          {Number((kpiData as any).void_return_count || 0) > 0 && (
            <div className="mt-1 flex items-center text-[11px] text-orange-600/70 font-medium">
              <span>{(kpiData as any).void_return_count} voided {(kpiData as any).void_return_count === 1 ? "bill" : "bills"}</span>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase overflow-visible">
            <span className="relative group/tooltip flex items-center gap-1.5">
              Profit Margin
              <Info className="h-3.5 w-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-help transition-colors" />
              <div className="pointer-events-none absolute right-0 top-full mt-2 w-64 opacity-0 transition-opacity group-hover/tooltip:opacity-100 z-50">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 shadow-xl text-[var(--text-primary)] font-medium normal-case tracking-normal">
                  <p className="mb-2 text-xs"><strong className="text-[var(--text-primary)] font-bold">Calculation:</strong> (Net Revenue - Cost of Goods Sold) / Net Revenue</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Reflects the overall percentage of revenue retained as gross profit.</p>
                </div>
              </div>
            </span>
            <Percent className="h-4 w-4" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <p className="text-2xl font-black">{kpiData.profit_margin_pct}%</p>
          </div>
        </div>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-4"><Flame className="h-5 w-5 text-amber-500"/> Top Items</h2>
          {topItemsData?.items.map((it, idx) => (
             <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-[var(--border-subtle)] last:border-0">
               <div>
                 <span className="font-semibold">{it.name}</span>
                 {it.category_name && (
                   <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-muted)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                     {it.category_name}
                   </span>
                 )}
               </div>
               <span className="font-mono font-bold text-[var(--accent-brand)]">₹{it.revenue.toFixed(2)}</span>
             </div>
          ))}
        </div>
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-4"><Clock className="h-5 w-5 text-sky-500"/> Peak Hours</h2>
          <div className="h-40 flex items-end gap-1">
            {(() => {
              const maxOrders = Math.max(1, ...(peakHoursData?.buckets.map(b => b.orders_count) || []));
              return peakHoursData?.buckets.map(b => {
                const heightPct = b.orders_count === 0 ? 10 : Math.max(15, (b.orders_count / maxOrders) * 100);
                return (
                  <div 
                    key={b.hour} 
                    className="flex-1 bg-[var(--accent-brand)] opacity-80 hover:opacity-100 transition-all rounded-t-md" 
                    style={{ height: `${heightPct}%` }} 
                    title={`${b.hour_label}: ${b.orders_count} orders`}
                  ></div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
