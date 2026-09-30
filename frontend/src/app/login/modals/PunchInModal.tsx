/**
 * PunchInModal — Shift start modal for cashiers and non-admin staff roles.
 *
 * Enforces punch-in before granting access to POS billing, live orders, and cart sessions.
 */

"use client";

import { useEffect, useState } from "react";
import { Clock, LogOut, Play, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
import type { StaffMember } from "@/types";

type PunchInModalProps = {
  isOpen: boolean;
  activeStaff: StaffMember | null;
  userRole?: string | null;
  currentDrawerBalance?: number | string;
  isPunchingIn: boolean;
  onPunchIn: (openingCash?: number) => Promise<void>;
  onSwitchUser: () => void;
  onLogout: () => void;
};

export function PunchInModal({
  isOpen,
  activeStaff,
  userRole,
  currentDrawerBalance = 0,
  isPunchingIn,
  onPunchIn,
  onSwitchUser,
  onLogout,
}: PunchInModalProps) {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [openingCash, setOpeningCash] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      const balNum = Number(currentDrawerBalance || 0);
      setOpeningCash(balNum > 0 ? balNum.toFixed(2) : "0");
    }
  }, [isOpen, currentDrawerBalance]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  const displayName = activeStaff?.name || "Staff Member";
  const displayRole = (activeStaff?.role || userRole || "CASHIER").replace(/_/g, " ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl">
        {/* Header Accent Banner */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white text-center relative">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md shadow-inner">
            <Clock className="h-8 w-8 text-white animate-pulse" />
          </div>
          <h2 className="font-display text-2xl font-black tracking-tight">
            Shift Punch-In Required
          </h2>
          <p className="mt-1 text-xs text-emerald-100 font-medium">
            Start your shift to begin counter billing &amp; operations
          </p>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
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
                <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase font-mono">
                  {displayRole}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">• Ready to work</span>
              </div>
            </div>
          </div>

          {/* Live Digital Clock Card */}
          <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-base)] p-4 text-center">
            <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              {currentDate}
            </span>
            <div className="mt-1 font-mono text-3xl font-black text-[var(--text-primary)] tracking-wider">
              {currentTime}
            </div>
          </div>

          {/* Starting Cash in Drawer Input */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="opening-cash-input" className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span>💵</span> Starting Cash in Drawer
              </label>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                Live Drawer: ₹{Number(currentDrawerBalance || 0).toFixed(2)}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-muted)]">₹</span>
              <input
                id="opening-cash-input"
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                disabled={isPunchingIn}
                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] text-sm font-mono font-bold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Opening float / change in cash drawer when you sit. Shift collection starts from this amount.
            </p>
          </div>

          {/* Explanation note */}
          <p className="text-xs text-[var(--text-muted)] text-center leading-relaxed px-2">
            Your counter bills, returns, and orders will be strictly tracked starting from this punch-in time. Shifts auto-expire after 12 hours.
          </p>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => onPunchIn(parseFloat(openingCash) || 0)}
            disabled={isPunchingIn}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 px-4 text-sm font-bold text-white shadow-lg hover:from-emerald-700 hover:to-teal-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPunchingIn ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Recording Punch-In...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                <span>Punch In &amp; Begin Shift</span>
              </>
            )}
          </button>

          {/* Footer Secondary Actions */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-xs">
            <button
              type="button"
              onClick={onSwitchUser}
              className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium transition"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Switch PIN User</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 text-rose-500 hover:text-rose-600 font-medium transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
