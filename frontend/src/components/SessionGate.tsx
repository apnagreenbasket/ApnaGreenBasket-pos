"use client";

import React, { useState, useEffect } from "react";
import { User, Phone, ArrowRight, AlertTriangle, Utensils } from "lucide-react";
import { useSession } from "@/context/SessionContext";

interface SessionGateProps {
  /** If true, render as a modal overlay (for re-login from Header). */
  isModal?: boolean;
  /** Called when the modal should close (only relevant when isModal=true). */
  onClose?: () => void;
}

export function SessionGate({ isModal = false, onClose }: SessionGateProps) {
  const {
    isSessionActive,
    isSessionLoading,
    customerName: savedName,
    customerPhone: savedPhone,
    tableNumber,
    startSession,
  } = useSession();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from saved values
  useEffect(() => {
    if (savedName) setName(savedName);
    if (savedPhone) setPhone(savedPhone);
  }, [savedName, savedPhone]);

  // Don't show if session is already active (unless forced as modal)
  if (!isModal && (isSessionLoading || isSessionActive)) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await startSession(name.trim(), phone.trim() || undefined);
      onClose?.();
    } catch (err) {
      let message = "Unable to start session";
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      } else if (err && typeof err === "object") {
        message = (err as any).detail || (err as any).message || JSON.stringify(err);
      }
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div
      className={`w-full max-w-lg ${isModal
          ? "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-6 shadow-2xl"
          : "flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-6"
        }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Logo & Title */}
      <div className={`text-center ${isModal ? "mb-5" : "mb-8"}`}>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-brand)] text-white shadow-lg">
          <Utensils className="h-7 w-7" />
        </div>
        <h2 className="font-sans text-xl font-bold text-[var(--text-primary)]">
          {isModal ? "Login to Session" : "Welcome!"}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {isModal
            ? "Enter your name to reconnect to your table session."
            : `Enter your name to start ordering at Basket #${tableNumber || "1"}`}
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1 font-medium">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto space-y-3">
        {/* Name Input */}
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Your Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-3 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[var(--accent-brand)] focus:outline-hidden"
          />
        </div>

        {/* Phone Input */}
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="tel"
            placeholder="Phone Number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-3 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[var(--accent-brand)] focus:outline-hidden"
          />
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Your name identifies your session at this table. Phone number lets you
          track orders across visits.
        </p>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!name.trim() || isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50 hover:shadow-lg"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Connecting...
            </span>
          ) : (
            <>
              <span>{isModal ? "Reconnect" : "Start Ordering"}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );

  // Full-screen gate or modal overlay
  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        onClick={onClose}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {content}
    </div>
  );
}
