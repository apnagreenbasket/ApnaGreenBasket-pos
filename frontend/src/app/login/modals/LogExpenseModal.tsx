"use client";

import React, { useState } from "react";
import {
  X,
  Wallet,
  Check,
} from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    category: string;
    custom_category?: string;
    amount: number;
    payment_method: string;
    description?: string;
    expense_date: string;
  }) => Promise<void>;
  isSaving: boolean;
};

const CATEGORIES = [
  { value: "RENT", label: "Rent", emoji: "🏢" },
  { value: "ELECTRICITY", label: "Electricity", emoji: "⚡" },
  { value: "EQUIPMENT", label: "Equipment / Machinery", emoji: "🔧" },
  { value: "MAINTENANCE", label: "Maintenance", emoji: "🛠️" },
  { value: "PACKAGING", label: "Packaging / Plastic", emoji: "📦" },
  { value: "MARKETING", label: "Marketing", emoji: "📣" },
  { value: "OTHER", label: "Other", emoji: "📋" },
];

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

export function LogExpenseModal({ isOpen, onClose, onSave, isSaving }: Props) {
  const [category, setCategory] = useState("RENT");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }
    if (!expenseDate) {
      setError("Please select a date.");
      return;
    }
    if (category === "OTHER" && !customCategory.trim()) {
      setError("Please specify what the expense is for.");
      return;
    }
    try {
      await onSave({
        category,
        custom_category: category === "OTHER" ? customCategory.trim() : undefined,
        amount: amt,
        payment_method: paymentMethod,
        description: description.trim() || undefined,
        expense_date: `${expenseDate}T12:00:00`,
      });
      // Reset form
      setCategory("RENT");
      setCustomCategory("");
      setAmount("");
      setPaymentMethod("CASH");
      setDescription("");
      setExpenseDate(todayStr());
    } catch (err: any) {
      setError(err?.message || "Failed to save expense.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Log Expense</h2>
              <p className="text-xs text-[var(--text-muted)]">Record an operational expense</p>
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Category selector */}
          <div>
            <label className="mb-2 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                    category === cat.value
                      ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] shadow-xs"
                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--accent-brand)]/50 hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="text-lg leading-none">{cat.emoji}</span>
                  <span className="text-center leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom category input (visible when OTHER) */}
          {category === "OTHER" && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                Specify Expense *
              </label>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="e.g., AC repair, water bottles, plastic..."
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
          )}

          {/* Amount + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                Amount (₹) *
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                Date *
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <p className="col-span-2 text-[11px] text-[var(--text-muted)]">
              Calculated inside the month of this date and deducted from that month&apos;s profit.
            </p>
          </div>

          {/* Payment Method */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Payment Method
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

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Notes (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Any additional notes about this expense..."
              className="w-full resize-none rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-500">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition disabled:opacity-60"
            >
              {isSaving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isSaving ? "Saving..." : "Log Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
