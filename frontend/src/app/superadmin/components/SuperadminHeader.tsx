import { LogOut, Moon, RefreshCw, ShieldCheck, Sun } from "lucide-react";

type SuperadminHeaderProps = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  isLoadingRestaurants: boolean;
  onRefresh: () => void;
  onLogout: () => void;
};

export function SuperadminHeader({
  theme,
  toggleTheme,
  isLoadingRestaurants,
  onRefresh,
  onLogout,
}: SuperadminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="font-display text-base font-bold sm:text-lg">Superadmin Console</p>
            <p className="text-[11px] text-[var(--text-secondary)] sm:text-xs">Platform Directory &amp; Outlet Provisioning</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] p-2 sm:px-3 sm:py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoadingRestaurants}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold hover:border-[var(--accent-brand)] sm:text-sm sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingRestaurants ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Sync Directory</span>
            <span className="sm:hidden">Sync</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-brand)] px-3 py-2 text-xs font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] sm:text-sm sm:px-4"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
