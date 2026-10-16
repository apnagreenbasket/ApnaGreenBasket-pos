"use client";

import React, { useState } from "react";
import { AlertCircle, Calendar, Loader2, User, X, XCircle } from "lucide-react";
import type { ExpenseItemSummary } from "./DeleteExpenseModal";

interface RejectExpenseModalProps {
  isOpen: boolean;
  expense: ExpenseItemSummary | null;
  onClose: () => void;
  onConfirm: (expenseId: string, reason?: string) => Promise<void>;
}

export function RejectExpenseModal({
  isOpen,
  expense,
  onClose,
  onConfirm,
}: RejectExpenseModalProps) {
  const [reason, setReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  const handleReject = async () => {
    setErrorMsg(null);
    setIsRejecting(true);
    try {
      await onConfirm(expense.id, reason.trim() || undefined);
      setReason("");
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to reject expense. Please try again.");
    } finally {
      setIsRejecting(false);
    }
  };

  const handleClose = () => {
    if (isRejecting) return;
    setReason("");
    setErrorMsg(null);
    onClose();
  };

  const formattedDate = (() => {
    try {
      return new Date(expense.expense_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return expense.expense_date;
    }
  })();

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
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-rose-500">Reject Expense Submission</h3>
            <p className="text-xs text-rose-400/80">Declining pending expense log</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isRejecting}
            className="ml-auto rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-500 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Expense Detail Summary */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {expense.category.replace(/_/g, " ")}
              </span>
              <span className="font-mono text-base font-black text-rose-500">
                ₹{Number(expense.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {expense.description && (
              <p className="text-xs text-[var(--text-primary)] italic bg-[var(--bg-surface)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                &ldquo;{expense.description}&rdquo;
              </p>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                <span>{formattedDate}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                <span>Submitted by: <strong className="text-[var(--text-primary)]">{expense.logged_by_staff_name || "Manager"}</strong></span>
              </div>
            </div>
          </div>

          {/* Rejection Reason Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">
              Reason for Rejection <span className="font-normal text-[var(--text-muted)]">(Optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Exceeds store budget, duplicate entry, receipt missing..."
              rows={3}
              disabled={isRejecting}
              className="w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-rose-500 focus:outline-hidden transition"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[var(--bg-surface-elevated)] px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isRejecting}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={isRejecting}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-rose-500 transition disabled:opacity-50"
          >
            {isRejecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Rejecting...</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                <span>Reject Expense</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
