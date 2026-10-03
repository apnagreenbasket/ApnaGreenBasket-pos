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
          const exp = Number(data?.expected_cash_in_drawer || 0);
          setActualCashInput(exp.toFixed(2));
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
  const expectedCash = summary ? Number(summary.expected_cash_in_drawer || 0) : 0;
  const difference = enteredActualCash - expectedCash;
  const isBalanced = Math.abs(difference) < 0.01;
  const isShortage = difference < -0.01;
  const isExcess = difference > 0.01;

  const handlePrintSlip = () => {
    if (!summary) return;
    const slipData: ShiftFinancialSummary = {
      ...summary,
      total_sales_amount: Number(summary.total_sales_amount || 0),
      opening_cash: Number(summary.opening_cash || 0),
      cash_collected: Number(summary.cash_collected || 0),
      upi_collected: Number(summary.upi_collected || 0),
      card_collected: Number(summary.card_collected || 0),
      returns_refund_cash: Number(summary.returns_refund_cash || 0),
      expected_cash_in_drawer: Number(summary.expected_cash_in_drawer || 0),
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

  const displayName = activeStaff?.name || "Staff Member";
  const displayRole = (activeStaff?.role || "CASHIER").replace(/_/g, " ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-md my-auto overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl max-h-[94vh] flex flex-col">
        {/* Header Accent Banner */}
        <div className="bg-gradient-to-r from-rose-600 to-red-600 p-6 text-white text-center relative shrink-0">
          {/* Header Close Button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isPunchingOut}
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white/90 hover:bg-white/25 hover:text-white transition backdrop-blur-md disabled:opacity-50"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md shadow-inner">
            <LogOut className="h-8 w-8 text-white" />
          </div>
          <h2 className="font-display text-2xl font-black tracking-tight">
            End Shift &amp; Cash Handover
          </h2>
          <p className="mt-1 text-xs text-rose-100 font-medium">
            Reconcile cash drawer &amp; settle shift collection
          </p>
        </div>

        {/* Content Body - Flexible & Sleek Scroll */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent">
          {/* Active Staff Identity Card */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-black text-lg shadow-xs">
              {displayName[0]?.toUpperCase() || "S"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-[var(--text-primary)] truncate">
                {displayName}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-block rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase font-mono">
                  {displayRole}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">• Ending Shift</span>
              </div>
            </div>
          </div>

          {/* Shift Timing & Duration Card */}
          <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-base)] p-4 text-center">
            <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center justify-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-rose-500" />
              Shift Started at {punchInTimeFormatted}
            </span>
            <div className="mt-1 font-mono text-3xl font-black text-[var(--text-primary)] tracking-wider">
              {formattedDuration}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">Total Shift Duration</span>
          </div>

          {/* Loading or Summary Display */}
          {isLoadingSummary ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <div className="h-7 w-7 rounded-full border-2 border-rose-500/30 border-t-rose-500 animate-spin" />
              <p className="text-xs text-[var(--text-muted)]">Calculating shift sales &amp; cash collection...</p>
            </div>
          ) : summary ? (
            <div className="space-y-4">
              {/* Drawer Cash Reconciliation Card */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
                {/* Sales Key Metrics */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>Bills Cut</span>
                      <Receipt className="h-3.5 w-3.5 opacity-60" />
                    </div>
                    <div className="mt-1 font-mono text-lg font-black text-[var(--text-primary)]">
                      {summary.total_bills_count}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>Total Sales</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">Gross</span>
                    </div>
                    <div className="mt-1 font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">
                      ₹{Number(summary.total_sales_amount || 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Breakdown Math */}
                <div className="space-y-1.5 text-xs pt-1 border-t border-[var(--border-subtle)]">
                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>Starting Cash Float:</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      ₹{Number(summary.opening_cash || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>(+) Cash Collected:</span>
                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      +₹{Number(summary.cash_collected || 0).toFixed(2)}
                    </span>
                  </div>

                  {Number(summary.returns_refund_cash || 0) > 0 && (
                    <div className="flex justify-between items-center text-[var(--text-muted)]">
                      <span>(-) Cash Paid for Returns:</span>
                      <span className="font-mono font-semibold text-rose-500">
                        -₹{Number(summary.returns_refund_cash || 0).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[var(--text-muted)]">
                    <span>UPI &amp; QR Payments:</span>
                    <span className="font-mono font-semibold text-sky-600 dark:text-sky-400">
                      ₹{Number(summary.upi_collected || 0).toFixed(2)}
                    </span>
                  </div>

                  {Number(summary.card_collected || 0) > 0 && (
                    <div className="flex justify-between items-center text-[var(--text-muted)]">
                      <span>Card Payments:</span>
                      <span className="font-mono font-semibold text-indigo-500">
                        ₹{Number(summary.card_collected || 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expected Drawer Cash Highlight Box */}
                <div className="flex items-center justify-between rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-4 py-3 select-none">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold text-[var(--text-muted)]">₹</span>
                    <span className="font-mono text-2xl font-black text-[var(--text-primary)] tracking-wide">
                      {expectedCash.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] font-mono font-semibold text-amber-500">
                      Expected Drawer Cash
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">To Hand Over</span>
                  </div>
                </div>
              </div>

              {/* Handover Physical Cash Input & Live Discrepancy Tally */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>💵</span> Actual Cash Handed Over
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 font-mono uppercase">
                    Required *
                  </span>
                </div>

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
                    className="w-full rounded-xl border-2 border-[var(--border-strong)] bg-[var(--bg-base)] pl-8 pr-4 py-2.5 font-mono text-base font-bold text-[var(--text-primary)] focus:border-rose-500 focus:outline-none transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                {/* Tally Discrepancy Status Badge */}
                <div>
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
            <p className="text-xs text-[var(--text-muted)] leading-relaxed text-center py-2">
              Punching out will conclude your shift and record your shift collection details in the audit ledger.
            </p>
          )}

          {/* Optional Notes Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] block px-1">
              Closing / Handover Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Handed over physical cash ₹1,200 to Rahul"
              maxLength={255}
              disabled={isPunchingOut}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-rose-500 focus:outline-none transition"
            />
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPunchingOut || isLoadingSummary}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 py-3.5 px-4 text-sm font-bold text-white shadow-lg hover:from-rose-700 hover:to-red-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPunchingOut ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Settling Shift &amp; Punching Out...</span>
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4" />
                <span>Settle &amp; Punch Out Shift</span>
              </>
            )}
          </button>

          {/* Footer Secondary Actions */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-xs">
            {summary ? (
              <button
                type="button"
                onClick={handlePrintSlip}
                disabled={isPunchingOut}
                className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium transition disabled:opacity-50"
                title="Print Thermal Shift Handover Slip"
              >
                <Printer className="h-3.5 w-3.5 text-rose-500" />
                <span>Print Handover Slip</span>
              </button>
            ) : <div />}

            <button
              type="button"
              onClick={onClose}
              disabled={isPunchingOut}
              className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium transition disabled:opacity-50"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
