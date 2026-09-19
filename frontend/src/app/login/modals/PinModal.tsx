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
};

export function PinModal({
  isOpen,
  onClose,
  pinTargetStaff,
  pinInput,
  setPinInput,
  isSavingPin,
  onSubmitSetStaffPin,
}: PinModalProps) {
  if (!isOpen || !pinTargetStaff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[var(--accent-brand)]" />
            <h3 className="font-display text-lg font-bold">Set 4-Digit PIN</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmitSetStaffPin} className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Set 4-digit quick-switch PIN for <strong>{pinTargetStaff.name}</strong> ({pinTargetStaff.role.replace("_", " ")}):
          </p>

          <label className="block space-y-1">
            <input
              type="password"
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

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingPin || pinInput.length !== 4}
              className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50"
            >
              {isSavingPin ? "Saving PIN..." : "Save PIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
