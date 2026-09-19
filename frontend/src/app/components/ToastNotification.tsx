"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type ToastNotificationProps = {
  notice?: string | null;
  error?: string | null;
  clear: () => void;
};

export function ToastNotification({ notice, error, clear }: ToastNotificationProps) {
  useEffect(() => {
    if (notice || error) {
      const timer = setTimeout(() => {
        clear();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notice, error, clear]);

  if (!notice && !error) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 min-w-[300px] max-w-sm animate-in slide-in-from-top-2 fade-in duration-300">
      {notice && (
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200/60 p-4 shadow-lg ring-1 ring-black/5 dark:bg-blue-950/40 dark:border-blue-500/30">
          <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-blue-800 dark:text-blue-400">Success</h3>
            <p className="text-xs text-blue-700/90 dark:text-blue-500/90 mt-0.5 leading-relaxed">{notice}</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200/60 p-4 shadow-lg ring-1 ring-black/5 dark:bg-rose-950/40 dark:border-rose-500/30">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-800 dark:text-rose-400">Error</h3>
            <p className="text-xs text-rose-700/90 dark:text-rose-500/90 mt-0.5 leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
