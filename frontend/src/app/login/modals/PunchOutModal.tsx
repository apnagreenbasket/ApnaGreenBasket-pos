/**
 * PunchOutModal — Shift completion confirmation modal.
 *
 * Confirms end of shift, calculates total shift time, records audit log,
 * and automatically opens PIN Quick-Switch lock screen for the next cashier.
 */

"use client";

import { useState } from "react";
import { AlertTriangle, Clock, LogOut, X } from "lucide-react";
import type { StaffMember } from "@/types";

type PunchOutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activeStaff: StaffMember | null;
  punchInAt?: string | null;
  elapsedSeconds: number;
  isPunchingOut: boolean;
  onConfirmPunchOut: (notes?: string) => Promise<void>;
};

export function PunchOutModal({
  isOpen,
  onClose,
  activeStaff,
  punchInAt,
  elapsedSeconds,
  isPunchingOut,
  onConfirmPunchOut,
}: PunchOutModalProps) {
  const [notes, setNotes] = useState("");

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

  const handleConfirm = async () => {
    await onConfirmPunchOut(notes.trim() || undefined);
    setNotes("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
                End Shift &amp; Punch Out
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {activeStaff?.name || "Staff Member"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPunchingOut}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Shift Summary Card */}
          <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)] font-medium">Shift Started:</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">
                {punchInTimeFormatted}
              </span>
            </div>
            <div className="h-px bg-[var(--border-subtle)]" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)] font-medium">Total Shift Duration:</span>
              <span className="inline-flex items-center gap-1.5 font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                <Clock className="h-4 w-4" />
                {formattedDuration}
              </span>
            </div>
          </div>

          {/* Prompt Note */}
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Punching out will record your final shift duration into the Staff Action Audit Trail and lock the screen for the next cashier.
          </p>

          {/* Optional Notes Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Shift Closing Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Till balanced, handed over to Rahul"
              maxLength={255}
              disabled={isPunchingOut}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPunchingOut}
              className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPunchingOut}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:from-rose-700 hover:to-red-700 transition disabled:opacity-50"
            >
              {isPunchingOut ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Punching Out...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Punch Out &amp; End Shift</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
