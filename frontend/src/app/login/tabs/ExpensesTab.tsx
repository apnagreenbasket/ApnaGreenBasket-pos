"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Wallet,
  Plus,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  DollarSign,
  Trash2,
  Calendar,
  Search,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Users,
  UserPlus,
  Pencil,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { LogExpenseModal } from "../modals/LogExpenseModal";
import { PaySalaryModal, type StaffSalaryItem } from "../modals/PaySalaryModal";
import { EditStaffModal } from "../modals/EditStaffModal";
import { QuickOnboardStaffModal } from "../modals/QuickOnboardStaffModal";
import type { RestaurantProfile } from "../adminTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

type DatePreset = "today" | "yesterday" | "last_7" | "last_30" | "this_month" | "last_month" | "custom";

interface CategoryBreakdown {
  category: string;
  display_name: string;
  total: number;
  count: number;
  pct: number;
}

interface ExpenseSummary {
  from_date: string;
  to_date: string;
  gross_revenue: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_expenses: number;
  expenses_by_category: CategoryBreakdown[];
  actual_net_profit: number;
  actual_margin_pct: number;
  expense_count: number;
}

interface Expense {
  id: string;
  category: string;
  custom_category?: string;
  amount: number;
  payment_method: string;
  description?: string;
  expense_date: string;
  logged_by_staff_name?: string;
  created_at: string;
}

interface ExpensePage {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface StaffSalaryRosterResponse {
  month: string;
  total_staff: number;
  paid_count: number;
  pending_count: number;
  total_salary_budget: number;
  total_salary_paid: number;
  items: StaffSalaryItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_DISPLAY: Record<string, { label: string; badgeClass: string }> = {
  ADMIN: { label: "Admin", badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  MANAGER: { label: "Store Manager", badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  CASHIER: { label: "Cashier", badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  FLOOR_STAFF: { label: "Floor Staff", badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  DELIVERY_BOY: { label: "Delivery", badgeClass: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  STAFF: { label: "Store Staff", badgeClass: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const formatMonthName = (mStr: string) => {
  try {
    const [y, m] = mStr.split("-");
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  } catch {
    return mStr;
  }
};

const CATEGORY_DISPLAY: Record<string, string> = {
  SALARY: "Staff Salary",
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  EQUIPMENT: "Equipment / Machinery",
  MAINTENANCE: "Maintenance",
  PACKAGING: "Packaging / Plastic",
  MARKETING: "Marketing",
  OTHER: "Other",
};

const CATEGORY_EMOJI: Record<string, string> = {
  SALARY: "👥",
  RENT: "🏢",
  ELECTRICITY: "⚡",
  EQUIPMENT: "🔧",
  MAINTENANCE: "🛠️",
  PACKAGING: "📦",
  MARKETING: "📣",
  OTHER: "📋",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

type DateRange = { from: string; to: string };

function getDateRange(preset: DatePreset, custom?: { from: string; to: string }): DateRange {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === "today") {
    const s = fmtD(now);
    return { from: s + "T00:00:00", to: s + "T23:59:59" };
  }
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = fmtD(y);
    return { from: s + "T00:00:00", to: s + "T23:59:59" };
  }
  if (preset === "last_7") {
    const f = new Date(now);
    f.setDate(f.getDate() - 6);
    return { from: fmtD(f) + "T00:00:00", to: fmtD(now) + "T23:59:59" };
  }
  if (preset === "last_30") {
    const f = new Date(now);
    f.setDate(f.getDate() - 29);
    return { from: fmtD(f) + "T00:00:00", to: fmtD(now) + "T23:59:59" };
  }
  if (preset === "this_month") {
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    const t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmtD(f) + "T00:00:00", to: fmtD(t) + "T23:59:59" };
  }
  if (preset === "last_month") {
    const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const t = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmtD(f) + "T00:00:00", to: fmtD(t) + "T23:59:59" };
  }
  if (preset === "custom" && custom) {
    return { from: custom.from + "T00:00:00", to: custom.to + "T23:59:59" };
  }
  // Default: this month
  const f = new Date(now.getFullYear(), now.getMonth(), 1);
  const t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: fmtD(f) + "T00:00:00", to: fmtD(t) + "T23:59:59" };
}

const ALL_CATEGORIES = [
  "ALL",
  "SALARY",
  "RENT",
  "ELECTRICITY",
  "EQUIPMENT",
  "MAINTENANCE",
  "PACKAGING",
  "MARKETING",
  "OTHER",
];

// ── Main Component ─────────────────────────────────────────────────────────────

type ExpensesTabProps = {
  restaurant: RestaurantProfile | null;
  authToken?: string;
};

export function ExpensesTab({ restaurant, authToken }: ExpensesTabProps) {
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [expensePage, setExpensePage] = useState<ExpensePage | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Staff Salary Roster State
  const [rosterMonth, setRosterMonth] = useState<string>(getCurrentMonth);
  const [salaryRoster, setSalaryRoster] = useState<StaffSalaryRosterResponse | null>(null);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Modals for Staff Salaries & Quick Onboarding
  const [selectedStaffForPay, setSelectedStaffForPay] = useState<StaffSalaryItem | null>(null);
  const [selectedStaffForEdit, setSelectedStaffForEdit] = useState<StaffSalaryItem | null>(null);
  const [isQuickOnboardOpen, setIsQuickOnboardOpen] = useState(false);

  const apiBase = getApiBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };

  const getRange = useCallback(() => {
    if (datePreset === "custom") {
      if (!customFrom || !customTo) return null;
      return getDateRange("custom", { from: customFrom, to: customTo });
    }
    return getDateRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const loadSummary = useCallback(async () => {
    const range = getRange();
    if (!range) return;
    setIsLoadingSummary(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from_date: range.from, to_date: range.to });
      const res = await fetch(`${apiBase}/api/admin/expenses/summary?${params}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      setSummary(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load summary");
    } finally {
      setIsLoadingSummary(false);
    }
  }, [getRange, apiBase, authToken]);

  const loadList = useCallback(async () => {
    const range = getRange();
    if (!range) return;
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams({
        from_date: range.from,
        to_date: range.to,
        page: String(page),
        page_size: "50",
      });
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`${apiBase}/api/admin/expenses?${params}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      setExpensePage(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load expenses");
    } finally {
      setIsLoadingList(false);
    }
  }, [getRange, page, categoryFilter, search, apiBase, authToken]);

  const loadSalaryRoster = useCallback(async () => {
    setIsLoadingRoster(true);
    setRosterError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/expenses/staff-salaries?month=${rosterMonth}`, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data: StaffSalaryRosterResponse = await res.json();
      setSalaryRoster(data);
    } catch (e: any) {
      setRosterError(e.message || "Failed to load staff salary roster");
    } finally {
      setIsLoadingRoster(false);
    }
  }, [apiBase, authToken, rosterMonth]);

  useEffect(() => {
    setPage(1);
  }, [datePreset, customFrom, customTo, categoryFilter]);

  useEffect(() => {
    void loadSummary();
    void loadList();
  }, [loadSummary, loadList]);

  useEffect(() => {
    void loadSalaryRoster();
  }, [loadSalaryRoster]);

  const handleRosterActionSuccess = async () => {
    await Promise.all([
      loadSalaryRoster(),
      loadSummary(),
      loadList(),
    ]);
  };

  const handleDeletePayrollStaff = async (staffId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from payroll?`)) return;
    try {
      const res = await fetch(`${apiBase}/api/admin/expenses/payroll-staff/${staffId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to remove staff member");
      await loadSalaryRoster();
    } catch (e: any) {
      alert(e.message || "Failed to remove staff member");
    }
  };

  const handleSaveExpense = async (data: any) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/expenses`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to save" }));
        throw new Error(err.detail || "Failed to save expense");
      }
      setIsModalOpen(false);
      await Promise.all([loadSummary(), loadList(), loadSalaryRoster()]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/api/admin/expenses/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Delete failed");
      await Promise.all([loadSummary(), loadList(), loadSalaryRoster()]);
    } catch {
      alert("Failed to delete expense.");
    } finally {
      setDeletingId(null);
    }
  };

  const isProfit = (summary?.actual_net_profit ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* HEADER — styled identically to AnalyticsTab */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-[var(--accent-brand)]" />
            Expenses &amp; Profit/Loss
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Operating expenses &amp; actual net profit intelligence for {restaurant?.name || "your outlet"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] p-1 text-xs font-bold">
            {(["today", "yesterday", "last_7", "last_30", "this_month", "last_month", "custom"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  datePreset === p
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {p.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => { void loadSummary(); void loadList(); }}
            disabled={isLoadingSummary || isLoadingList}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
            title="Refresh expenses"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSummary || isLoadingList ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Log Expense
          </button>
        </div>
      </div>

      {/* CUSTOM DATE RANGE */}
      {datePreset === "custom" && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs">
          <Calendar className="h-4 w-4 text-[var(--accent-brand)]" />
          <span className="font-bold">Custom Range:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-[var(--text-primary)]"
          />
          <span>to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-[var(--text-primary)]"
          />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* STAT CARDS — exactly matching Analytics DashboardReport.tsx */}
      {isLoadingSummary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Card 1: Gross Revenue */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
            <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase overflow-visible">
              <span>Gross Revenue</span>
              <DollarSign className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-2xl font-black">₹{fmt(summary.gross_revenue)}</p>
            </div>
          </div>

          {/* Card 2: Cost of Goods */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
            <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase">
              <span>Cost of Goods (COGS)</span>
              <ShoppingCart className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-2xl font-black">₹{fmt(summary.total_cogs)}</p>
            </div>
          </div>

          {/* Card 3: Gross Profit */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
            <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold uppercase">
              <span>Gross Profit</span>
              <TrendingUp className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-2xl font-black">₹{fmt(summary.gross_profit)}</p>
              <span className="text-[10px] font-bold text-emerald-500">
                {summary.gross_margin_pct}% margin
              </span>
            </div>
          </div>

          {/* Card 4: Operating Expenses */}
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 shadow-xs">
            <div className="flex justify-between text-xs text-rose-500/80 font-bold uppercase">
              <span>Total Expenses</span>
              <Wallet className="h-4 w-4 text-rose-500" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className="text-2xl font-black text-rose-500">₹{fmt(summary.total_expenses)}</p>
              <span className="text-[10px] font-bold text-[var(--text-muted)]">
                {summary.expense_count} {summary.expense_count === 1 ? "entry" : "entries"}
              </span>
            </div>
          </div>

          {/* Card 5: Actual Net Profit / Loss */}
          <div
            className={`rounded-2xl border ${
              isProfit ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
            } p-4 shadow-xs`}
          >
            <div
              className={`flex justify-between text-xs ${
                isProfit ? "text-emerald-500/80" : "text-rose-500/80"
              } font-bold uppercase`}
            >
              <span>{isProfit ? "Actual Net Profit" : "Actual Net Loss"}</span>
              {isProfit ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className={`text-2xl font-black ${isProfit ? "text-emerald-500" : "text-rose-500"}`}>
                ₹{fmt(Math.abs(summary.actual_net_profit))}
              </p>
              <span className={`text-[10px] font-bold ${isProfit ? "text-emerald-500" : "text-rose-500"}`}>
                {summary.actual_margin_pct}% margin
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* STAFF SALARIES & MONTHLY PAYOUT ROSTER */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-5">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                Staff Salaries &amp; Monthly Payouts
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Pre-configured salaries with 1-click expense logging &amp; tracking for {formatMonthName(rosterMonth)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className="font-bold text-[var(--text-secondary)]">Month:</span>
              <input
                type="month"
                value={rosterMonth}
                onChange={(e) => setRosterMonth(e.target.value)}
                className="bg-transparent font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => void loadSalaryRoster()}
              disabled={isLoadingRoster}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
              title="Refresh staff roster"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRoster ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => setIsQuickOnboardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Onboard Staff
            </button>
          </div>
        </div>

        {/* Roster Metrics Summary Bar */}
        {salaryRoster && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Staff</span>
              <p className="text-xl font-black text-[var(--text-primary)] mt-1">{salaryRoster.total_staff}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Monthly Budget</span>
              <p className="text-xl font-black text-[var(--accent-brand)] mt-1">₹{fmt(salaryRoster.total_salary_budget)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Paid This Month</span>
              <p className="text-xl font-black text-emerald-500 mt-1">₹{fmt(salaryRoster.total_salary_paid)}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Payout Status</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-bold text-emerald-500">{salaryRoster.paid_count} Paid</span>
                <span className="text-xs text-[var(--text-muted)]">•</span>
                <span className="text-sm font-bold text-amber-500">{salaryRoster.pending_count} Pending</span>
              </div>
            </div>
          </div>
        )}

        {/* Roster Error Banner */}
        {rosterError && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {rosterError}
          </div>
        )}

        {/* Staff Table */}
        {isLoadingRoster ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-[var(--bg-surface-elevated)]" />
            ))}
          </div>
        ) : salaryRoster && salaryRoster.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Staff Member</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Contact</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Base Salary</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {formatMonthName(rosterMonth)} Status
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {salaryRoster.items.map((staff) => (
                  <tr key={staff.staff_id} className="hover:bg-[var(--bg-surface-elevated)]/60 transition">
                    {/* Name & Avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 font-bold text-[var(--accent-brand)] uppercase">
                          {staff.staff_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)] text-sm">{staff.staff_name}</p>
                          <span className="inline-block rounded-md border border-[var(--accent-brand)]/20 bg-[var(--accent-brand)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--accent-brand)] uppercase mt-0.5">
                            {staff.role}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {staff.phone ? (
                        <span className="font-mono font-semibold">{staff.phone}</span>
                      ) : (
                        <span className="text-[var(--text-muted)] italic">—</span>
                      )}
                    </td>

                    {/* Base Salary */}
                    <td className="px-4 py-3">
                      {staff.base_salary !== null && staff.base_salary !== undefined ? (
                        <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                          ₹{fmt(staff.base_salary)}
                          <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1">/mo</span>
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] italic">Not set</span>
                      )}
                    </td>

                    {/* Payout Status for current month */}
                    <td className="px-4 py-3">
                      {staff.is_paid ? (
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-500 border border-emerald-500/20 w-fit">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Paid ₹{fmt(staff.paid_amount || 0)}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                            {staff.paid_date ? fmtDate(staff.paid_date) : ""} via {staff.payment_method || "CASH"}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-500 border border-amber-500/20 w-fit">
                          <Clock className="h-3 w-3" />
                          Pending for {formatMonthName(rosterMonth)}
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {staff.is_paid ? (
                          <button
                            onClick={() => setSelectedStaffForPay(staff)}
                            className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
                            title="Pay extra bonus or adjustment"
                          >
                            + Pay Bonus / Adjustment
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedStaffForPay(staff)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Pay Salary
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedStaffForEdit(staff)}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
                          title={`Edit ${staff.staff_name}'s details (name, role, salary, phone)`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeletePayrollStaff(staff.staff_id, staff.staff_name)}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-500 transition"
                          title={`Remove ${staff.staff_name} from payroll`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-center">
            <Users className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">No physical store staff added yet</p>
            <p className="text-xs text-[var(--text-muted)]">
              Onboard your store&apos;s ground staff (helpers, cleaners, delivery boys) to track their monthly salaries.
            </p>
            <button
              onClick={() => setIsQuickOnboardOpen(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Onboard Staff Now
            </button>
          </div>
        )}
      </div>

      {/* Category Breakdown Panel */}
      {summary && summary.expenses_by_category.length > 0 && (
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs">
          <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-4">
            <Wallet className="h-5 w-5 text-[var(--accent-brand)]" />
            Expenses Breakdown by Category
          </h2>
          <div className="space-y-3">
            {summary.expenses_by_category.map((cat) => (
              <div key={cat.category} className="flex items-center gap-3">
                <span className="w-5 text-base">{CATEGORY_EMOJI[cat.category] || "📋"}</span>
                <span className="w-44 shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                  {cat.display_name}
                </span>
                <div className="relative flex-1 h-2 rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent-brand)] transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(2, cat.pct))}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-bold text-[var(--text-muted)] font-mono">
                  {cat.pct}%
                </span>
                <span className="w-24 text-right text-sm font-mono font-bold text-[var(--accent-brand)]">
                  ₹{fmt(cat.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXPENSE RECORDS TABLE */}
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Expense Records</h2>
            {expensePage && (
              <span className="rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2.5 py-0.5 text-xs font-bold text-[var(--text-muted)] font-mono">
                {expensePage.total}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative min-w-48">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search description, staff..."
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-brand)]"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {ALL_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCategoryFilter(c); setPage(1); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    categoryFilter === c
                      ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                  }`}
                >
                  {c === "ALL" ? "All" : CATEGORY_DISPLAY[c] || c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Content */}
        {isLoadingList ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bg-surface-elevated)]" />
            ))}
          </div>
        ) : expensePage && expensePage.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Category</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Notes</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Method</th>
                    <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Staff</th>
                    <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Amount</th>
                    <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {expensePage.items.map((exp) => (
                    <tr
                      key={exp.id}
                      className="hover:bg-[var(--bg-surface-elevated)]/60 transition"
                    >
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)] font-mono whitespace-nowrap">
                        {fmtDate(exp.expense_date)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] border border-[var(--border-strong)]">
                          <span>{CATEGORY_EMOJI[exp.category] || "📋"}</span>
                          <span>{exp.custom_category || CATEGORY_DISPLAY[exp.category] || exp.category}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                        {exp.description || <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-md bg-[var(--bg-surface-elevated)] px-2 py-0.5 text-[10px] font-bold font-mono text-[var(--text-muted)] border border-[var(--border-strong)] uppercase">
                          {exp.payment_method}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-muted)]">
                        {exp.logged_by_staff_name || "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-rose-500 text-sm">
                        ₹{fmt(exp.amount)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={() => handleDelete(exp.id)}
                          disabled={deletingId === exp.id}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-500 transition disabled:opacity-40"
                          title="Delete expense"
                        >
                          {deletingId === exp.id ? (
                            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-300 border-t-rose-500" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {expensePage.total_pages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-5 py-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Showing {(expensePage.page - 1) * expensePage.page_size + 1}–
                  {Math.min(expensePage.page * expensePage.page_size, expensePage.total)} of {expensePage.total} entries
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    {expensePage.page} / {expensePage.total_pages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(expensePage.total_pages, p + 1))}
                    disabled={page === expensePage.total_pages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <Wallet className="h-7 w-7" />
            </div>
            <p className="text-sm font-bold text-[var(--text-primary)]">No expenses recorded yet</p>
            <p className="text-xs text-[var(--text-muted)]">
              Click &quot;Log Expense&quot; to start tracking operational costs for this period.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:opacity-90 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Log Expense
            </button>
          </div>
        )}
      </div>

      {/* Log Expense Modal */}
      <LogExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveExpense}
        isSaving={isSaving}
      />

      {/* Pay Salary Modal */}
      <PaySalaryModal
        isOpen={!!selectedStaffForPay}
        onClose={() => setSelectedStaffForPay(null)}
        staff={selectedStaffForPay}
        currentMonth={rosterMonth}
        authToken={authToken}
        onSuccess={handleRosterActionSuccess}
      />

      {/* Edit Staff Modal */}
      <EditStaffModal
        isOpen={!!selectedStaffForEdit}
        onClose={() => setSelectedStaffForEdit(null)}
        staff={selectedStaffForEdit}
        authToken={authToken}
        onSuccess={handleRosterActionSuccess}
      />

      {/* Quick Onboard Staff Modal */}
      <QuickOnboardStaffModal
        isOpen={isQuickOnboardOpen}
        onClose={() => setIsQuickOnboardOpen(false)}
        outletId={restaurant?.id}
        authToken={authToken}
        onSuccess={handleRosterActionSuccess}
      />
    </div>
  );
}
