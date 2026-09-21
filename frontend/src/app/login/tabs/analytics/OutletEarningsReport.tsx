import React from "react";
import { TrendingUp, TrendingDown, DollarSign, Wallet, CreditCard, Gift, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";

type OutletEarningsData = {
  gross_revenue: number;
  total_customer_returns?: number;
  total_voided_returns?: number;
  total_loyalty_discounts: number;
  total_credit_applied: number;
  total_udhaar_given: number;
  total_udhaar_recovered: number;
  total_credit_cashed_out: number;
  total_credit_awarded: number;
  net_drawer_earnings: number;
  chart_data: any[];
};

export function OutletEarningsReport({ data, isLoading }: { data: OutletEarningsData | null; isLoading: boolean }) {
  if (isLoading) {
    return <div className="animate-pulse h-64 bg-[var(--bg-surface-elevated)] rounded-2xl border border-[var(--border-subtle)]" />;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-surface-elevated)] rounded-3xl border border-[var(--border-subtle)] p-6 shadow-sm">
        <h2 className="text-lg font-display font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-500" />
          Outlet Earnings Ledger (Net Cash Flow)
        </h2>

        {/* Ledger Table */}
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-left text-sm text-[var(--text-secondary)]">
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr>
                <td className="py-3 font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> Gross Revenue (Sales Total)
                </td>
                <td className="py-3 text-right font-mono font-bold text-[var(--text-primary)]">
                  ₹{data.gross_revenue.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" /> Customer Returns (Refunds)
                </td>
                <td className="py-3 text-right font-mono text-rose-500">
                  -₹{(data.total_customer_returns || 0).toFixed(2)}
                </td>
              </tr>
              {data.total_voided_returns !== undefined && data.total_voided_returns > 0 && (
                <tr>
                  <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-orange-500" /> Voided Bills (Refunds)
                  </td>
                  <td className="py-3 text-right font-mono text-orange-500">
                    -₹{data.total_voided_returns.toFixed(2)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <Gift className="h-4 w-4" /> Loyalty Value Redeemed
                </td>
                <td className="py-3 text-right font-mono text-[var(--text-muted)]">
                  (₹{data.total_loyalty_discounts.toFixed(2)})
                </td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-rose-500" /> Store Credit Applied
                </td>
                <td className="py-3 text-right font-mono text-rose-500">
                  -₹{data.total_credit_applied.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-rose-500" /> Udhaar Given (Shortfall)
                </td>
                <td className="py-3 text-right font-mono text-rose-500">
                  -₹{data.total_udhaar_given.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sky-500" /> Udhaar Recovered (Debt Settled)
                </td>
                <td className="py-3 text-right font-mono text-sky-500">
                  +₹{data.total_udhaar_recovered.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" /> Credit Cashed Out (Returned Cash)
                </td>
                <td className="py-3 text-right font-mono text-rose-500">
                  -₹{data.total_credit_cashed_out.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td className="py-3 text-[var(--text-muted)] flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sky-500" /> Credit Awarded (Kept Cash)
                </td>
                <td className="py-3 text-right font-mono text-sky-500">
                  +₹{data.total_credit_awarded.toFixed(2)}
                </td>
              </tr>
              <tr className="bg-[var(--bg-surface)]">
                <td className="py-4 font-bold text-[var(--text-primary)] text-base rounded-l-lg px-2">
                  NET DRAWER EARNINGS (Expected Cash/UPI)
                </td>
                <td className="py-4 text-right font-mono font-black text-emerald-500 text-lg rounded-r-lg px-2">
                  ₹{data.net_drawer_earnings.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Day-by-Day Chart */}
        {data.chart_data && data.chart_data.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 uppercase tracking-wider">
              Cash Flow Trends
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chart_data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                  <XAxis dataKey="date" stroke="#888" fontSize={12} tickMargin={10} />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={(val) => `₹${val}`} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-surface-elevated)', borderColor: 'var(--border-strong)', borderRadius: '12px' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  
                  <Line type="monotone" dataKey="udhaar_given" name="Udhaar Given" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="udhaar_recovered" name="Udhaar Recovered" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="customer_returns" name="Customer Returns" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="loyalty_value_redeemed" name="Loyalty Discount" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="credit_cashed_out" name="Credit Cashed Out" stroke="#0d0b33" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
