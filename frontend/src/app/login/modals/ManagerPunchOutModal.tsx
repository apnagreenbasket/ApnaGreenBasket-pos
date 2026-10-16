"use client";

import React, { useState, useEffect } from "react";
import { AlertCircle, Clock, Loader2, LogOut, User, X } from "lucide-react";
import type { StaffMember } from "@/types";

interface ManagerPunchOutModalProps {
  isOpen: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onConfirm: (member: StaffMember, notes?: string) => Promise<void>;
}

export function ManagerPunchOutModal({
  isOpen,
  member,
  onClose,
  onConfirm,
}: ManagerPunchOutModalProps) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNotes("");
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !member) return null;

  const handlePunchOut = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm(member, notes.trim() || undefined);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to punch out staff member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-punchout-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4.5 bg-[var(--bg-surface-elevated)]/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="manager-punchout-title"
                className="font-display text-base font-bold text-[var(--text-primary)]"
              >
                Punch Out Staff Member
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                End active shift attendance session
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition disabled:opacity-50 cursor-pointer"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="flex-1 font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Staff Member Card */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 font-display text-base font-bold text-[var(--accent-brand)]">
                {member.name[0]?.toUpperCase() || <User className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-bold text-sm text-[var(--text-primary)]">{member.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      member.role === "FLOOR_STAFF" || member.role === "STAFF"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                        : member.role === "CASHIER"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400"
                    }`}
                  >
                    {member.role.replace("_", " ")}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    {member.barcode || `STF-${member.id.slice(0, 4).toUpperCase()}`}
                  </span>
                </div>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              On Shift
            </span>
          </div>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Are you sure you want to punch out <strong className="text-[var(--text-primary)]">{member.name}</strong>?
            This will record their shift end timestamp, mark attendance as settled, and close their active session.
          </p>

          {/* Optional Closing Notes */}
          <div className="space-y-1.5">
            <label
              htmlFor="punchout-notes"
              className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5"
            >
              <Clock className="h-3.5 w-3.5" />
              Closing Notes (Optional)
            </label>
            <input
              id="punchout-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Regular shift end, left for day..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-rose-500 focus:outline-hidden focus:ring-1 focus:ring-rose-500 transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handlePunchOut()}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Punching Out...</span>
              </>
            ) : (
              <>
                <LogOut className="h-3.5 w-3.5" />
                <span>Confirm Punch Out</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
