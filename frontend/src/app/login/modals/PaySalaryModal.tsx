"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Wallet,
  Check,
  User,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

export interface StaffSalaryItem {
  staff_id: string;
  staff_name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  base_salary?: number | null;
  is_paid: boolean;
  paid_amount?: number | null;
  paid_date?: string | null;
  payment_method?: string | null;
  expense_id?: string | null;
  description?: string | null;
  notes?: string | null;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  staff: StaffSalaryItem | null;
  currentMonth: string; // "YYYY-MM"
  authToken?: string;
  onSuccess: () => Promise<void>;
};

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatMonthLabel = (mStr: string) => {
  try {
    const [y, m] = mStr.split("-");
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
    return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  } catch {
    return mStr;
  }
};

const getLastDayOfMonth = (mStr: string) => {
  try {
    const [y, m] = mStr.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${mStr}-${String(lastDay).padStart(2, "0")}`;
  } catch {
    return `${mStr}-01`;
  }
};

export function PaySalaryModal({
  isOpen,
  onClose,
  staff,
  currentMonth,
  authToken,
  onSuccess,
}: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [payoutDate, setPayoutDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && staff) {
      const targetMonth = currentMonth || new Date().toISOString().slice(0, 7);
      setMonth(targetMonth);
      setAmount(staff.base_salary ? String(staff.base_salary) : "");
      setPaymentMethod("CASH");

      const today = todayStr();
      const currentCalMonth = today.slice(0, 7);
      if (targetMonth === currentCalMonth) {
        setPayoutDate(today);
      } else {
        setPayoutDate(getLastDayOfMonth(targetMonth));
      }

      setNotes(`Salary payout for ${staff.staff_name} (${formatMonthLabel(targetMonth)})`);
      setError(null);
    }
  }, [isOpen, staff, currentMonth]);

  if (!isOpen || !staff) return null;

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    if (newMonth) {
      const today = todayStr();
      const currentCalMonth = today.slice(0, 7);
      if (newMonth === currentCalMonth) {
        setPayoutDate(today);
      } else {
        setPayoutDate(getLastDayOfMonth(newMonth));
      }
      setNotes(`Salary payout for ${staff.staff_name} (${formatMonthLabel(newMonth)})`);
    }
  };

  const handlePayoutDateChange = (newDate: string) => {
    setPayoutDate(newDate);
    if (newDate && newDate.length >= 7) {
      const derivedMonth = newDate.slice(0, 7);
      setMonth(derivedMonth);
      setNotes(`Salary payout for ${staff.staff_name} (${formatMonthLabel(derivedMonth)})`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid salary amount greater than 0.");
      return;
    }
    if (!payoutDate) {
      setError("Please select the payout date.");
      return;
    }

    setIsSubmitting(true);
    const apiBase = getApiBaseUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    try {
      const effectiveMonth = month || payoutDate.slice(0, 7);
      const payload = {
        category: "SALARY",
        amount: parsedAmount,
        payment_method: paymentMethod,
        recipient_staff_id: staff.staff_id,
        recipient_staff_name: staff.staff_name,
        salary_month: effectiveMonth,
        description: notes.trim() || `Salary payout for ${staff.staff_name} (${formatMonthLabel(effectiveMonth)})`,
        expense_date: `${payoutDate}T12:00:00`,
      };

      const res = await fetch(`${apiBase}/api/admin/expenses`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "Failed to record salary payout" }));
        throw new Error(errData.detail || "Failed to record salary payout");
      }

      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error submitting salary payout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Pay Staff Salary</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Record salary disbursement for {formatMonthLabel(month)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Staff Summary Banner */}
        <div className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold text-sm">
              {staff.staff_name[0]?.toUpperCase() || "S"}
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">{staff.staff_name}</p>
              <p className="text-[11px] font-mono uppercase text-[var(--text-muted)]">
                {staff.role} {staff.phone ? `• ${staff.phone}` : ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block">
              Base Salary
            </span>
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
              {staff.base_salary ? `₹${staff.base_salary.toLocaleString()}` : "Not set"}
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Month & Date Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                Salary Month *
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                Payout Date *
              </label>
              <input
                type="date"
                value={payoutDate}
                onChange={(e) => handlePayoutDateChange(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <div className="col-span-2 rounded-xl bg-[var(--accent-brand)]/5 border border-[var(--accent-brand)]/15 px-3 py-2 text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-[var(--accent-brand)] shrink-0" />
              <span>
                Attributed strictly to <strong className="text-[var(--text-primary)]">{formatMonthLabel(month)}</strong> expenses and deducted from that month&apos;s profit.
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                Disbursement Amount (₹) *
              </label>
              {staff.base_salary && Number(amount) !== staff.base_salary && (
                <button
                  type="button"
                  onClick={() => setAmount(String(staff.base_salary))}
                  className="text-[11px] font-bold text-[var(--accent-brand)] hover:underline"
                >
                  Reset to Base (₹{staff.base_salary.toLocaleString()})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-muted)]">
                ₹
              </span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 pl-8 pr-3.5 text-base font-bold font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              You can adjust this payout if there are advances, bonuses, or deductions.
            </p>
          </div>

          {/* Payment Method Pills */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Payment Method *
            </label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.value}
                  type="button"
                  onClick={() => setPaymentMethod(pm.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                    paymentMethod === pm.value
                      ? "border-[var(--accent-brand)] bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-brand)]/40"
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Remarks / Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Notes / Remarks (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Regular monthly salary, ₹500 overtime added..."
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition disabled:opacity-60"
            >
              {isSubmitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isSubmitting ? "Processing..." : `Pay ₹${amount ? parseFloat(amount).toLocaleString() : "0"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
