"use client";

import React, { useState } from "react";
import { X, UserPlus, Check, AlertCircle } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  outletId?: string;
  authToken?: string;
  onSuccess: () => Promise<void>;
};

export const COMMON_ROLES = [
  "Manager / Store Manager",
  "Cashier",
  "Helper / Store Boy",
  "Cleaner / Sweeper",
  "Delivery Executive / Boy",
  "Loader / Packer",
  "Store Assistant / Floor Boy",
  "Security / Watchman",
  "Other",
];

export function QuickOnboardStaffModal({
  isOpen,
  onClose,
  outletId,
  authToken,
  onSuccess,
}: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState("Helper / Store Boy");
  const [customRole, setCustomRole] = useState("");
  const [salary, setSalary] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim().replace(/\D/g, "");
    const finalRole = selectedRole === "Other" ? customRole.trim() : selectedRole;

    if (!trimmedName) {
      setError("Please enter the staff member's full name.");
      return;
    }
    if (!trimmedPhone || trimmedPhone.length < 10) {
      setError("Mobile number is required and must be at least 10 digits.");
      return;
    }
    if (!finalRole) {
      setError("Please specify the staff member's job role / designation.");
      return;
    }
    const parsedSalary = parseFloat(salary);
    if (!salary || isNaN(parsedSalary) || parsedSalary < 0) {
      setError("Please enter a valid monthly salary (0 or more).");
      return;
    }

    setIsSubmitting(true);
    const apiBase = getApiBaseUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    try {
      const payload = {
        name: trimmedName,
        phone: trimmedPhone,
        role: finalRole,
        base_salary: parsedSalary,
        notes: notes.trim() || null,
      };

      const res = await fetch(`${apiBase}/api/admin/expenses/payroll-staff`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to onboard staff" }));
        throw new Error(err.detail || "Failed to onboard staff");
      }

      await onSuccess();
      // Reset form
      setName("");
      setPhone("");
      setSelectedRole("Helper / Store Boy");
      setCustomRole("");
      setSalary("");
      setNotes("");
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to onboard staff member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Onboard Store Staff (Payroll)</h3>
              <p className="text-xs text-[var(--text-muted)]">Add ground store worker with monthly salary</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
                Staff Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
                Mobile Number (Unique) *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10 digits"
                required
                minLength={10}
                maxLength={10}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
          </div>

          {/* Role / Designation Selector */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
              Designation / Role *
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
            >
              {COMMON_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Role Input if Other */}
          {selectedRole === "Other" && (
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
                Specify Designation *
              </label>
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="e.g. Dishwasher, Driver, Electrician..."
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
          )}

          {/* Monthly Base Salary */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
              Monthly Base Salary (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 12000"
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-8 pr-3 text-xs font-mono font-bold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Store floor cleaning, vegetable sorting, morning shift..."
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
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
              Onboard Staff
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
