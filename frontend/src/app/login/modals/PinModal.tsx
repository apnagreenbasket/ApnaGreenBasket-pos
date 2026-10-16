/**
 * PinModal — Admin set 4-digit PIN for a staff member.
 *
 * Extracted from admin page.tsx (lines 6223-6278).
 */

"use client";

import { FormEvent } from "react";
import { KeyRound, X } from "lucide-react";
import type { StaffMember } from "@/types";

type PinModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pinTargetStaff: StaffMember | null;
  pinInput: string;
  setPinInput: (pin: string) => void;
  isSavingPin: boolean;
  onSubmitSetStaffPin: (e: FormEvent<HTMLFormElement>) => void;
  onUnsetStaffPin?: () => void;
};

export function PinModal({
  isOpen,
  onClose,
  pinTargetStaff,
  pinInput,
  setPinInput,
  isSavingPin,
  onSubmitSetStaffPin,
  onUnsetStaffPin,
}: PinModalProps) {
  if (!isOpen || !pinTargetStaff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[var(--accent-brand)]" />
            <h3 className="font-display text-lg font-bold">
              {pinTargetStaff.has_pin ? "Manage 4-Digit PIN" : "Set 4-Digit PIN"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmitSetStaffPin} autoComplete="off" data-lpignore="true" data-1p-ignore="true" className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-secondary)]">
              {pinTargetStaff.has_pin ? "Update or revoke" : "Set"} 4-digit quick-switch PIN for{" "}
              <strong>{pinTargetStaff.name}</strong> ({pinTargetStaff.role.replace("_", " ")}):
            </p>
            {pinTargetStaff.has_pin && (
              <span className="inline-block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ Currently has an active PIN configured
              </span>
            )}
          </div>

          <label className="block space-y-1">
            <input
              type="password"
              name="staff_setup_pin"
              id="staff_setup_pin"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]{4}"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border-2 border-[var(--accent-brand)] bg-[var(--bg-surface-elevated)] p-3 text-center font-mono text-2xl font-black tracking-widest text-[var(--text-primary)]"
            />
          </label>

          <div className="flex items-center gap-2 pt-2">
            {pinTargetStaff.has_pin && onUnsetStaffPin && (
              <button
                type="button"
                disabled={isSavingPin}
                onClick={onUnsetStaffPin}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/20 transition disabled:opacity-50 cursor-pointer"
                title="Revoke and remove PIN"
              >
                Remove PIN
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingPin || pinInput.length !== 4}
              className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50"
            >
              {isSavingPin ? "Saving PIN..." : pinTargetStaff.has_pin ? "Update PIN" : "Save PIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
