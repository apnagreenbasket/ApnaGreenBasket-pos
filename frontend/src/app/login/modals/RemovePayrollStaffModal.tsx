"use client";

import React, { useState } from "react";
import { AlertTriangle, Loader2, Phone, Trash2, UserMinus, X } from "lucide-react";
import type { StaffSalaryItem } from "./PaySalaryModal";

interface RemovePayrollStaffModalProps {
  isOpen: boolean;
  staff: StaffSalaryItem | null;
  onClose: () => void;
  onConfirm: (staffId: string) => Promise<void>;
}

export function RemovePayrollStaffModal({
  isOpen,
  staff,
  onClose,
  onConfirm,
}: RemovePayrollStaffModalProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !staff) return null;

  const handleRemove = async () => {
    setErrorMsg(null);
    setIsRemoving(true);
    try {
      await onConfirm(staff.staff_id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to remove staff from payroll. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleClose = () => {
    if (isRemoving) return;
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[var(--bg-surface)] text-left shadow-2xl transition-all border border-rose-500/20 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-rose-500/10 px-6 py-4 flex items-center gap-3 border-b border-rose-500/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-500">
            <UserMinus className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-rose-500">Remove from Payroll</h3>
            <p className="text-xs text-rose-400/80">Active salary roster deactivation</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isRemoving}
            className="ml-auto rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Are you sure you want to remove <strong className="text-[var(--text-primary)]">{staff.staff_name}</strong> from payroll? Their historical payment entries and expense records will remain preserved in your books.
          </p>

          {/* Staff Details Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-[var(--text-primary)]">{staff.staff_name}</span>
                <span className="block text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  {staff.role}
                </span>
              </div>
              {staff.base_salary !== null && staff.base_salary !== undefined && (
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                    ₹{Number(staff.base_salary).toLocaleString("en-IN")}
                  </span>
                  <span className="block text-[10px] text-[var(--text-muted)]">/month</span>
                </div>
              )}
            </div>

            {staff.phone && (
              <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                <Phone className="h-3.5 w-3.5" />
                <span>{staff.phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[var(--bg-surface-elevated)] px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isRemoving}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-rose-500 transition disabled:opacity-50"
          >
            {isRemoving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>Remove Staff</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
