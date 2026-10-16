"use client";

import React, { useState, useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X, Loader2, Calendar, User, KeyRound, ShieldAlert } from "lucide-react";

export interface ExpenseItemSummary {
  id: string;
  category: string;
  custom_category?: string;
  amount: number;
  payment_method: string;
  description?: string;
  expense_date: string;
  logged_by_staff_name?: string;
}

interface DeleteExpenseModalProps {
  isOpen: boolean;
  expense: ExpenseItemSummary | null;
  onClose: () => void;
  onConfirm: (expenseId: string, pin: string) => Promise<void>;
}

export function DeleteExpenseModal({
  isOpen,
  expense,
  onClose,
  onConfirm,
}: DeleteExpenseModalProps) {
  const [pin, setPin] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setErrorMsg(null);
      setTimeout(() => pinInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen || !expense) return null;

  const handleDelete = async () => {
    if (pin.length !== 4) {
      setErrorMsg("Please enter your complete 4-digit admin PIN.");
      return;
    }
    setErrorMsg(null);
    setIsDeleting(true);
    try {
      await onConfirm(expense.id, pin);
      setPin("");
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to delete expense. Please verify your PIN and try again.");
      setPin("");
      setTimeout(() => pinInputRef.current?.focus(), 100);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setPin("");
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

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[var(--bg-surface)] text-left shadow-2xl transition-all border border-rose-500/20 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-rose-500/10 px-6 py-4 flex items-center gap-3 border-b border-rose-500/20">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-rose-500">Delete Expense Record</h3>
            <p className="text-xs text-rose-400/80">This action cannot be undone</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
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
            Are you sure you want to permanently delete this expense? It will be removed from your ledger records and recalculate all profit &amp; loss figures.
          </p>

          {/* Expense Detail Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2.5">
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
                <span>{expense.logged_by_staff_name || "Manager"}</span>
              </div>
            </div>
          </div>

          {/* Admin Security PIN Verification Section */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="admin_security_pin"
                className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"
              >
                <KeyRound className="h-4 w-4 text-amber-500" />
                Admin Security PIN <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                4-digit code
              </span>
            </div>
            <input
              ref={pinInputRef}
              id="admin_security_pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              disabled={isDeleting}
              value={pin}
              onChange={(e) => {
                setErrorMsg(null);
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pin.length === 4 && !isDeleting) {
                  e.preventDefault();
                  void handleDelete();
                }
              }}
              placeholder="••••"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-center font-mono text-2xl tracking-[0.5em] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-rose-500 focus:outline-hidden transition shadow-inner"
            />
            <p className="text-[11px] text-[var(--text-muted)] text-center">
              Enter your 4-digit admin PIN to verify and authorize deletion.
            </p>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="bg-[var(--bg-surface-elevated)] px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || pin.length !== 4}
            className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-rose-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying &amp; Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>Delete Permanently</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
