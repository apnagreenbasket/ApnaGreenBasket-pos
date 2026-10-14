"use client";

import React, { useState, useEffect } from "react";
import { X, Check, UserCog, AlertCircle } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import type { StaffSalaryItem } from "./PaySalaryModal";
import { COMMON_ROLES } from "./QuickOnboardStaffModal";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  staff: StaffSalaryItem | null;
  authToken?: string;
  onSuccess: () => Promise<void>;
};

export function EditStaffModal({
  isOpen,
  onClose,
  staff,
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

  useEffect(() => {
    if (isOpen && staff) {
      setName(staff.staff_name || "");
      setPhone(staff.phone || "");
      setSalary(staff.base_salary !== null && staff.base_salary !== undefined ? String(staff.base_salary) : "");
      setNotes(staff.notes || staff.description || "");
      setError(null);

      // Determine role
      const staffRole = staff.role || "Helper / Store Boy";
      if (COMMON_ROLES.includes(staffRole)) {
        setSelectedRole(staffRole);
        setCustomRole("");
      } else {
        setSelectedRole("Other");
        setCustomRole(staffRole);
      }
    }
  }, [isOpen, staff]);

  if (!isOpen || !staff) return null;

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
      setError("Please specify the staff member's designation / role.");
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
      const res = await fetch(`${apiBase}/api/admin/expenses/payroll-staff/${staff.staff_id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: trimmedName,
          role: finalRole,
          phone: trimmedPhone,
          base_salary: parsedSalary,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to update staff details" }));
        throw new Error(err.detail || "Failed to update staff details");
      }

      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to update staff details.");
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
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Edit Staff Details</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Update designation, salary, phone, or name for {staff.staff_name}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name & Phone Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
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
              <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
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

          {/* Role / Designation */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
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
            {selectedRole === "Other" && (
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="Type custom job role..."
                required
                className="mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            )}
          </div>

          {/* Monthly Base Salary */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Monthly Base Salary (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-muted)]">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 15000"
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-8 pr-3.5 text-sm font-bold font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
              />
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              This amount pre-fills automatically when you pay monthly salary.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              Notes / Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Working hours 9am-6pm, handles loading..."
              className="w-full resize-none rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]/30"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
