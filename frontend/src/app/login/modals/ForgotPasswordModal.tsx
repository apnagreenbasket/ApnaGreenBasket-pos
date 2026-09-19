"use client";

import React, { useState, useEffect } from "react";
import { X, Mail, KeyRound, ArrowRight, ShieldCheck, RefreshCw, Eye, EyeOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

type ForgotPasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
  onSuccess?: (email: string) => void;
};

export function ForgotPasswordModal({
  isOpen,
  onClose,
  initialEmail = "",
  onSuccess,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState(initialEmail);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Sync initial email when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail);
      setError(null);
      setSuccessMsg(null);
      setStep("request");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [isOpen, initialEmail]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  // Step 1: Send OTP
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || cooldown > 0 || isLoading) return;

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/forgot-password/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to send verification code.");
      }

      setMaskedEmail(data.email_masked || email);
      setCooldown(data.cooldown_seconds || 60);
      setStep("verify");
      setSuccessMsg("Verification code sent to your email address.");
    } catch (err: any) {
      setError(err.message || "Failed to send code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP & Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/forgot-password/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to reset password.");
      }

      setSuccessMsg(data.message || "Password successfully reset!");
      if (onSuccess) {
        onSuccess(email.trim().toLowerCase());
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
      // If code was invalidated (5 wrong attempts), reset OTP input
      if (err.message && err.message.includes("expired") || err.message.includes("invalidated")) {
        setOtp("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] border border-[var(--accent-brand)]/20">
            {step === "request" ? <KeyRound className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {step === "request" ? "Forgot Password" : "Set New Password"}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            {step === "request"
              ? "Enter your account email and we will send you a 6-digit verification code."
              : `Code sent to ${maskedEmail || email}. Enter it below with your new password.`}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{successMsg}</div>
          </div>
        )}

        {/* Phase 1: Request Code Form */}
        {step === "request" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Account Email
              </span>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@apnagreenbasket.com"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] pl-10 pr-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[var(--accent-brand)] focus:outline-none transition"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={isLoading || !email.trim() || cooldown > 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Sending Code...
                </>
              ) : cooldown > 0 ? (
                `Resend available in ${cooldown}s`
              ) : (
                <>
                  Send Verification Code
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Phase 2: Verify & Reset Form */}
        {step === "verify" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            {/* 6-Digit OTP */}
            <label className="block space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  6-Digit Code
                </span>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  Expires in 15m
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                placeholder="000000"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2.5 text-center text-2xl font-bold tracking-[0.3em] font-mono focus:ring-2 focus:ring-[var(--accent-brand)] focus:outline-none transition"
              />
            </label>

            {/* New Password */}
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                New Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] pl-3.5 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[var(--accent-brand)] focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {/* Confirm Password */}
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Confirm New Password
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Re-enter new password"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[var(--accent-brand)] focus:outline-none transition"
              />
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || otp.length !== 6 || newPassword.length < 8}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                "Reset Password & Unlock"
              )}
            </button>

            {/* Resend Cooldown Section */}
            <div className="pt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <button
                type="button"
                onClick={() => setStep("request")}
                className="hover:text-[var(--text-primary)] transition"
              >
                Change Email
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || isLoading}
                onClick={() => handleRequestOtp()}
                className="font-semibold text-[var(--accent-brand)] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed transition"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
