import React from "react";
import type { ProfitMarginAnalytics } from "@/types";

export function ProfitMarginReport({ data }: { data: ProfitMarginAnalytics | null }) {
  if (!data) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">No profit data.</div>;
  
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Total Revenue</p>
           <p className="text-2xl font-black mt-1 text-[var(--text-primary)]">₹{data.total_revenue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Total COGS</p>
           <p className="text-2xl font-black mt-1 text-rose-500">₹{data.total_cogs.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Net Profit</p>
           <p className="text-2xl font-black mt-1 text-emerald-600">₹{data.total_profit.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs">
           <p className="text-xs text-[var(--text-muted)] uppercase font-bold">Overall Margin</p>
           <p className="text-2xl font-black mt-1">{data.overall_margin_pct}%</p>
        </div>
      </div>
      
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-[var(--text-muted)] uppercase text-xs">
              <th className="py-2">Bucket</th>
              <th className="py-2 text-right">Revenue</th>
              <th className="py-2 text-right">COGS</th>
              <th className="py-2 text-right">Profit</th>
              <th className="py-2 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b, idx) => (
              <tr key={idx} className="border-b last:border-0">
                <td className="py-2 font-bold">{b.bucket}</td>
                <td className="py-2 text-right">₹{b.revenue.toFixed(2)}</td>
                <td className="py-2 text-right text-rose-500">₹{b.cogs.toFixed(2)}</td>
                <td className="py-2 text-right text-emerald-600 font-bold">₹{b.profit.toFixed(2)}</td>
                <td className="py-2 text-right">{b.margin_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
