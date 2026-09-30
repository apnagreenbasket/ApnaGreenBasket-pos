"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard caught unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6 text-[var(--text-primary)]">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-8 text-center shadow-2xl space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 border border-amber-500/25">
          <AlertTriangle className="h-8 w-8 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-black tracking-tight text-[var(--text-primary)]">
            Something went wrong
          </h2>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {error?.message || "An unexpected error occurred while loading this dashboard view."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-[var(--accent-brand-hover)] transition cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Again</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.hash = "#billing";
                window.location.reload();
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition cursor-pointer"
          >
            <Home className="h-4 w-4" />
            <span>Reload Billing</span>
          </button>
        </div>
      </div>
    </div>
  );
}
