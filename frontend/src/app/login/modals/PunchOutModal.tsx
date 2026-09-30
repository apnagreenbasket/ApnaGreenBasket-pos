/**
 * PunchOutModal — Shift completion & cash handover settlement modal.
 *
 * Displays live shift financials (bills cut, total sales, opening cash float,
 * cash sales, UPI, card, customer refunds), computes expected drawer cash,
 * validates actual cash handed over to owner/manager with live shortage/excess tally,
 * provides thermal handover slip printing, and records audit trail.
 */

"use client";

import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Clock, DollarSign, LogOut, Printer, Receipt, X } from "lucide-react";
import type { StaffMember } from "@/types";
import type { ShiftFinancialSummary, RestaurantProfile } from "../adminTypes";
import { generateShiftHandoverReceiptPDF } from "@/lib/pdfGenerator";

type PunchOutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activeStaff: StaffMember | null;
  punchInAt?: string | null;
  elapsedSeconds: number;
  isPunchingOut: boolean;
  fetchShiftSummary?: () => Promise<ShiftFinancialSummary>;
  outlet?: RestaurantProfile | null;
  onConfirmPunchOut: (actualCashHandedOver?: number, notes?: string, closingNotes?: string) => Promise<void>;
};

export function PunchOutModal({
  isOpen,
  onClose,
  activeStaff,
  punchInAt,
  elapsedSeconds,
  isPunchingOut,
  fetchShiftSummary,
  outlet,
  onConfirmPunchOut,
}: PunchOutModalProps) {
  const [summary, setSummary] = useState<ShiftFinancialSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [actualCashInput, setActualCashInput] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Fetch live shift summary on modal open
  useEffect(() => {
    let isMounted = true;
    if (isOpen && fetchShiftSummary) {
      setIsLoadingSummary(true);
      fetchShiftSummary()
        .then((data) => {
          if (!isMounted) return;
          setSummary(data);
          setActualCashInput(data.expected_cash_in_drawer.toFixed(2));
        })
        .catch((err) => {
          console.error("Failed to fetch live shift summary:", err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingSummary(false);
        });
    } else {
      setSummary(null);
      setActualCashInput("");
      setNotes("");
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, fetchShiftSummary]);

  if (!isOpen) return null;

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration = `${hours}h ${minutes}m ${seconds}s`;

  const punchInTimeFormatted = punchInAt
    ? new Date(punchInAt.endsWith("Z") ? punchInAt : `${punchInAt}Z`).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "Earlier today";

  const enteredActualCash = parseFloat(actualCashInput) || 0;
  const expectedCash = summary ? summary.expected_cash_in_drawer : 0;
  const difference = enteredActualCash - expectedCash;
  const isBalanced = Math.abs(difference) < 0.01;
  const isShortage = difference < -0.01;
  const isExcess = difference > 0.01;

  const handlePrintSlip = () => {
    if (!summary) return;
    const slipData: ShiftFinancialSummary = {
      ...summary,
      actual_cash_handed_over: enteredActualCash,
      cash_difference: difference,
      notes: notes.trim() || undefined,
    };
    generateShiftHandoverReceiptPDF(slipData, outlet, "print");
  };

  const handleConfirm = async () => {
    const finalNotes = notes.trim() || undefined;
    await onConfirmPunchOut(enteredActualCash, finalNotes, finalNotes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                End Shift &amp; Cash Handover
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Cashier: <strong className="text-[var(--text-primary)]">{activeStaff?.name || "Staff"}</strong> ({activeStaff?.role || "CASHIER"})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPunchingOut}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Shift Timing Bar */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Shift Started:</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">{punchInTimeFormatted}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono font-bold text-amber-600 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5" />
              <span>{formattedDuration}</span>
            </div>
          </div>

          {/* Loading or Summary Display */}
          {isLoadingSummary ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <div className="h-7 w-7 rounded-full border-2 border-[var(--accent-brand)]/30 border-t-[var(--accent-brand)] animate-spin" />
              <p className="text-xs text-[var(--text-muted)]">Calculating shift sales &amp; cash collection...</p>
            </div>
          ) : summary ? (
            <div className="space-y-4">
              {/* Sales Key Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Bills Cut</span>
                    <Receipt className="h-3.5 w-3.5 opacity-60" />
                  </div>
                  <div className="mt-1 font-mono text-xl font-black text-[var(--text-primary)]">
                    {summary.total_bills_count}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Total Sales</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Gross</span>
                  </div>
                  <div className="mt-1 font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
                    ₹{summary.total_sales_amount.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Drawer Cash Reconciliation Card */}
              <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-base)] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
                  <span>Shift Collection Breakdown</span>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Drawer Math</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>Starting Cash Float (Punch In Drawer):</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      ₹{summary.opening_cash.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>(+) Cash Collected from Sales:</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      +₹{summary.cash_collected.toFixed(2)}
                    </span>
                  </div>

                  {summary.returns_refund_cash > 0 && (
                    <div className="flex justify-between items-center text-[var(--text-muted)]">
                      <span>(-) Cash Paid for Returns / Refunds:</span>
                      <span className="font-mono font-semibold text-rose-500">
                        -₹{summary.returns_refund_cash.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>UPI &amp; QR Payments:</span>
                    <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                      ₹{summary.upi_collected.toFixed(2)}
                    </span>
                  </div>

                  {summary.card_collected > 0 && (
                    <div className="flex justify-between items-center text-[var(--text-muted)]">
                      <span>Debit / Credit Card Payments:</span>
                      <span className="font-mono font-semibold text-indigo-500">
                        ₹{summary.card_collected.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Highlight: Expected Drawer Cash */}
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)] p-3 rounded-xl">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      Expected Drawer Cash to Hand Over
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Opening Cash + Cash Sales {summary.returns_refund_cash > 0 ? "- Returns" : ""}
                    </span>
                  </div>
                  <span className="font-mono text-lg font-black text-amber-600 dark:text-amber-400">
                    ₹{summary.expected_cash_in_drawer.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Handover Physical Cash Input & Live Discrepancy Tally */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                  Actual Cash Handed Over to Owner / Manager (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-sm text-[var(--text-muted)]">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    placeholder="Enter physical cash handed over"
                    disabled={isPunchingOut}
                    className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--bg-base)] pl-8 pr-4 py-2.5 font-mono text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                  />
                </div>

                {/* Tally Discrepancy Status Badge */}
                <div className="pt-1">
                  {isBalanced ? (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Cash Tally Balanced (₹0.00 difference) — Full cash accounted for.</span>
                    </div>
                  ) : isShortage ? (
                    <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-500">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Cash Shortage: ₹{Math.abs(difference).toFixed(2)} missing from drawer cash.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Cash Excess: ₹{difference.toFixed(2)} surplus above expected drawer cash.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Punching out will conclude your shift and record your shift collection details in the audit ledger.
            </p>
          )}

          {/* Optional Notes Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Closing / Handover Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Handed over physical cash ₹1,200 to Rahul"
              maxLength={255}
              disabled={isPunchingOut}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)] flex items-center justify-between gap-3">
          {summary ? (
            <button
              type="button"
              onClick={handlePrintSlip}
              disabled={isPunchingOut}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-3.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition disabled:opacity-50"
              title="Print Thermal Shift Handover Slip"
            >
              <Printer className="h-4 w-4 text-[var(--accent-brand)]" />
              <span>Print Handover Slip</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPunchingOut}
              className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPunchingOut || isLoadingSummary}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 py-2.5 px-5 text-xs font-bold text-white shadow-md hover:from-rose-700 hover:to-red-700 transition disabled:opacity-50"
            >
              {isPunchingOut ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Settling Shift...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Settle &amp; Punch Out</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
