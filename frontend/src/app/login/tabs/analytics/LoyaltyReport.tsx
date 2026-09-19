import React from "react";
import { Award, Percent } from "lucide-react";
import { LoyaltyReportResponse } from "@/types";

type Props = {
  data: LoyaltyReportResponse | null;
  isLoading: boolean;
};

export function LoyaltyReport({ data, isLoading }: Props) {
  if (isLoading) {
    return <div className="p-4 text-[var(--text-secondary)]">Loading loyalty data...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
          <Award className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Loyalty & Rewards</h2>
          <p className="text-sm text-[var(--text-secondary)]">Customer points earned, redeemed and outstanding</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Points Earned</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-500">+{data.total_points_earned}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Points Redeemed</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-500">-{data.total_points_redeemed}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 shadow-sm">
          <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Net Outstanding Points</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">{data.net_outstanding_points}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Redemption Rate</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--text-primary)]">{data.redemption_rate_pct.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] mb-4">
            <Award className="h-8 w-8" />
          </div>
          <h3 className="text-4xl font-bold text-[var(--text-primary)] mb-2">{data.total_customers_with_points}</h3>
          <p className="font-medium text-[var(--text-secondary)]">Customers with Active Points</p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 text-blue-500 mb-4">
            <Percent className="h-8 w-8" />
          </div>
          <h3 className="text-4xl font-bold text-[var(--text-primary)] mb-2">{data.avg_points_per_customer.toFixed(1)}</h3>
          <p className="font-medium text-[var(--text-secondary)]">Average Points per Customer</p>
        </div>
      </div>
    </div>
  );
}