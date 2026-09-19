/**
 * PinSwitchModal — Shared tablet PIN quick-switch lock-screen modal.
 *
 * Enlarged by 50% for high-density tablet views with multi-column roster layout
 * and seamless scroll-free staff selection.
 */

"use client";

import { FormEvent, useEffect, useMemo } from "react";
import { Lock, X, Check } from "lucide-react";
import type { StaffMember } from "@/types";

type PinSwitchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  pinSwitchStaffId: string;
  setPinSwitchStaffId: (id: string) => void;
  pinSwitchInput: string;
  setPinSwitchInput: (pin: string) => void;
  isSwitchingPin: boolean;
  onSubmitPinQuickSwitch: (e: FormEvent<HTMLFormElement>) => void;
};

export function PinSwitchModal({
  isOpen,
  onClose,
  staffList,
  pinSwitchStaffId,
  setPinSwitchStaffId,
  pinSwitchInput,
  setPinSwitchInput,
  isSwitchingPin,
  onSubmitPinQuickSwitch,
}: PinSwitchModalProps) {
  // Only display active staff members on the PIN switch screen
  const activeStaffList = useMemo(() => {
    return staffList.filter((m) => m.status === "active");
  }, [staffList]);

  // Keep selected staff ID pointed at an active member
  useEffect(() => {
    if (activeStaffList.length > 0) {
      if (!pinSwitchStaffId || !activeStaffList.some((m) => m.id === pinSwitchStaffId)) {
        setPinSwitchStaffId(activeStaffList[0].id);
      }
    }
  }, [activeStaffList, pinSwitchStaffId, setPinSwitchStaffId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl space-y-6 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-7 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] border border-[var(--accent-brand)]/30">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">Shared Tablet PIN Switch</h3>
              <p className="text-xs text-[var(--text-muted)]">Select your profile and enter your 4-digit PIN to switch active context</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmitPinQuickSwitch} className="space-y-6">
          {/* Staff Selection Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-bold">
                Select Active Staff Member
              </span>
              {activeStaffList.length > 0 && (
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  {activeStaffList.length} {activeStaffList.length === 1 ? "staff" : "staff members"}
                </span>
              )}
            </div>

            <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 max-h-72 overflow-y-auto p-1 rounded-2xl border border-[var(--border-subtle)]/50 bg-[var(--bg-surface-elevated)]/30">
              {activeStaffList.length === 0 ? (
                <div className="col-span-full py-12 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-brand)]" />
                  <p className="text-xs font-semibold">No active staff available</p>
                </div>
              ) : (
                activeStaffList.map((member) => {
                  const isSelected = pinSwitchStaffId === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setPinSwitchStaffId(member.id)}
                      className={`relative flex items-center gap-3 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                        isSelected
                          ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/15 ring-2 ring-[var(--accent-brand)] shadow-sm"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-elevated)]/80"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)]/20 text-[var(--accent-brand)] font-black text-sm">
                        {member.name[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs truncate text-[var(--text-primary)] leading-snug">{member.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-mono truncate leading-none mt-0.5">
                          {member.role.replace("_", " ")}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="h-4 w-4 shrink-0 rounded-full bg-[var(--accent-brand)] text-white flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* PIN Input Section */}
          <div className="space-y-2 text-center pt-1">
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-bold">
              Enter 4-Digit Staff PIN
            </span>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]{4}"
              value={pinSwitchInput}
              onChange={(e) => setPinSwitchInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              placeholder="••••"
              autoFocus
              className="w-full max-w-xs mx-auto block rounded-2xl border-2 border-[var(--accent-brand)] bg-[var(--bg-surface-elevated)] p-3 text-center font-mono text-2xl font-black tracking-widest text-[var(--text-primary)] shadow-sm focus:outline-none focus:ring-4 focus:ring-[var(--accent-brand)]/20"
            />
          </div>

          {/* Modal Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-3.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSwitchingPin || pinSwitchInput.length !== 4 || !pinSwitchStaffId}
              className="flex-1 rounded-2xl bg-[var(--accent-brand)] px-4 py-3.5 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSwitchingPin ? "Authenticating..." : "Unlock Active Context"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
