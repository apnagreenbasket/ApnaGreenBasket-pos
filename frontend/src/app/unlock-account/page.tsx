/**
 * Unlock Account Page — /unlock-account?token=...
 * Validates the security token and clears account lockout.
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Loader2, Sun, Moon } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { useAdminTheme } from "../login/hooks/useAdminTheme";

function UnlockAccountContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useAdminTheme();

  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let isSubscribed = true;

    async function verifyUnlockToken() {
      if (!token || !token.trim()) {
        setStatus("error");
        setMessage("No security unlock token was provided in the link. Please open the link directly from your email.");
        return;
      }

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/unlock-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim() }),
        });

        const data = await res.json().catch(() => ({}));

        if (!isSubscribed) return;

        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "Your account has been unlocked successfully! You can now log in.");
        } else {
          setStatus("error");
          setMessage(data.detail || "This unlock link is invalid or has expired. If your account is still locked, please wait 15 minutes or use Forgot Password.");
        }
      } catch {
        if (!isSubscribed) return;
        setStatus("error");
        setMessage("Unable to connect to the authentication server. Please check your internet connection and try again.");
      }
    }

    void verifyUnlockToken();

    return () => {
      isSubscribed = false;
    };
  }, [token]);

  return (
    <div className="relative min-h-screen bg-[var(--bg-base)] px-4 py-14 sm:px-6 flex items-center justify-center">
      <button 
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-all shadow-sm"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Account Security Unlock
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            ApnaGreen Basket Security Verification
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 shadow-[0_10px_35px_rgba(18,38,58,0.1)] text-center">
          {status === "verifying" && (
            <div className="space-y-4 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-[var(--accent-brand)] mx-auto" />
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Verifying Security Token...</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Please wait while we unlock your account and clear all restrictions.
                </p>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-5 py-2">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Account Unlocked!</h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {message}
                </p>
              </div>
              <button
                onClick={() => router.push("/")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] transition-all shadow-sm"
              >
                <span>Continue to Login</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-5 py-2">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Unlock Link Expired</h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {message}
                </p>
              </div>
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => router.push("/")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] transition-all shadow-sm"
                >
                  <span>Return to Login</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[var(--text-secondary)]">
          Need assistance? Contact support at <a href="mailto:official@apnagreenbasket.com" className="underline hover:text-[var(--text-primary)]">official@apnagreenbasket.com</a>
        </p>
      </div>
    </div>
  );
}

export default function UnlockAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-brand)]" />
      </div>
    }>
      <UnlockAccountContent />
    </Suspense>
  );
}
