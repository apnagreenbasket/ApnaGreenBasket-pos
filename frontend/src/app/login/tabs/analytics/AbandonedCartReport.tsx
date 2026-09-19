import React from "react";
import { ShoppingCart, AlertCircle, RefreshCcw } from "lucide-react";
import { AbandonedCartStatsResponse } from "@/types";

type Props = {
  data: AbandonedCartStatsResponse | null;
  isLoading: boolean;
};

export function AbandonedCartReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading abandoned carts data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Abandoned Carts</h2>
          <p className="text-sm text-[var(--text-secondary)]">Analyze cart abandonment and recovery rates</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Abandoned</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_abandoned}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Total Converted</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.total_converted}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Conversion Rate</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${data.conversion_rate_pct > 10 ? 'text-emerald-500' : 'text-orange-500'}`}>
              {data.conversion_rate_pct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Avg Cart Value</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">₹{data.avg_cart_value.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 mb-4">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="text-4xl font-bold text-orange-600 dark:text-orange-400 mb-2">₹{data.total_abandoned_value.toFixed(2)}</h3>
          <p className="font-medium text-orange-700 dark:text-orange-300">Total Lost Revenue</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-4">
            <RefreshCcw className="h-8 w-8" />
          </div>
          <h3 className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">₹{data.total_converted_value.toFixed(2)}</h3>
          <p className="font-medium text-emerald-700 dark:text-emerald-300">Total Recovered Revenue</p>
        </div>
      </div>
    </div>
  );
}