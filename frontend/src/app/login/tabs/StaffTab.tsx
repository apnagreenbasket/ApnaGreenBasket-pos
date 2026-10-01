/**
 * StaffTab — Staff & team management tab for the admin dashboard.
 *
 * Displays staff roster table, stat cards, action audit trail,
 * and triggers for create/edit/PIN modals.
 * Extracted from admin page.tsx (lines 3414-3674).
 */

"use client";

import { FormEvent, useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "../modals/ConfirmModal";
import {
  Activity,
  AlertCircle,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Package,
  Pencil,
  Printer,
  Receipt,
  RefreshCw,
  Scale,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { formatRupees, formatDateTime, parseUTCDate } from "../adminUtils";
import type { StaffAuditEntry, StaffMember, StaffRole, StockMovementResponse, WastageReportResponse } from "@/types";
import type { RestaurantProfile, StaffPunchSessionItem } from "../adminTypes";
import { generateShiftHandoverReceiptPDF, generateStaffExecutiveDayReportPDF } from "@/lib/pdfGenerator";
import { StockMovementReport } from "./analytics/StockMovementReport";
import { WastageReport } from "./analytics/WastageReport";

export type ReconciliationSummary = {
  start_date: string | null;
  end_date: string | null;
  counter_gross_sales: number;
  counter_cash_tender: number;
  counter_upi_tender: number;
  counter_credit_applied: number;
  counter_debit_applied: number;
  counter_debt_settled: number;
  counter_credit_awarded: number;
  counter_credit_cashed_out: number;
  counter_credit_debit_net: number;
  counter_loyalty_redeemed: number;
  counter_net_paid: number;
  counter_bills_count: number;
  returns_gross_amount: number;
  returns_exchange_value: number;
  returns_net_refund: number;
  returns_cash_refund: number;
  returns_upi_refund: number;
  returns_credit_debit_net: number;
  returns_count: number;
  consolidated_net_sales: number;
  cash_tender_total: number;
  upi_tender_total: number;
  total_tender: number;
  consolidated_credit_debit_net: number;
  consolidated_loyalty_redeemed: number;
  consolidated_net_settlement: number;
};

type StaffFormState = {
  outlet_id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  password: string;
  pin: string;
};

type StaffTabProps = {
  restaurant: RestaurantProfile | null;
  staffList: StaffMember[];
  staffAuditLogs: StaffAuditEntry[];
  isLoadingStaff: boolean;

  // Audit Filters
  auditRoleFilter: string;
  setAuditRoleFilter: (val: string) => void;
  auditActionFilter: string;
  setAuditActionFilter: (val: string) => void;
  auditDateFilter: string;
  setAuditDateFilter: (val: string) => void;
  auditPage: number;
  setAuditPage: (val: number | ((prev: number) => number)) => void;
  auditTotalPages: number;

  // User & Privilege Context
  currentUserRole?: string | null;
  currentUserId?: string | null;

  // Shift & API
  apiRequest?: <T>(endpoint: string, options?: RequestInit) => Promise<T>;

  // Actions
  loadStaffMembers: () => Promise<void>;
  loadStaffAuditLogs: () => Promise<void>;
  onDeactivateStaffMember: (id: string, name: string) => Promise<void>;
  onActivateStaffMember: (id: string, name: string) => Promise<void>;
  onDeleteStaffMemberPermanently: (id: string, name: string) => Promise<void>;

  // Modal triggers
  onOpenCreateStaff: () => void;
  onOpenEditStaff: (member: StaffMember) => void;
  onOpenPinSetup: (member: StaffMember) => void;
  onOpenPinSwitch: () => void;
};

export function StaffTab({
  restaurant,
  staffList,
  staffAuditLogs,
  isLoadingStaff,
  auditRoleFilter,
  setAuditRoleFilter,
  auditActionFilter,
  setAuditActionFilter,
  auditDateFilter,
  setAuditDateFilter,
  auditPage,
  setAuditPage,
  auditTotalPages,
  currentUserRole,
  currentUserId,
  apiRequest,
  loadStaffMembers,
  loadStaffAuditLogs,
  onDeactivateStaffMember,
  onActivateStaffMember,
  onDeleteStaffMemberPermanently,
  onOpenCreateStaff,
  onOpenEditStaff,
  onOpenPinSetup,
  onOpenPinSwitch,
}: StaffTabProps) {
  const [staffToDeactivate, setStaffToDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [staffToActivate, setStaffToActivate] = useState<{ id: string; name: string } | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  // Shift Handover Sessions State
  const [shiftSessions, setShiftSessions] = useState<StaffPunchSessionItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionStaffFilter, setSessionStaffFilter] = useState<string>("");
  const [sessionDatePreset, setSessionDatePreset] = useState<string>("today");

  const loadShiftSessions = useCallback(async () => {
    if (!apiRequest) return;
    setIsLoadingSessions(true);
    try {
      const params = new URLSearchParams();
      if (sessionStaffFilter) params.append("staff_id", sessionStaffFilter);

      const now = new Date();
      const formatDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      if (sessionDatePreset === "today") {
        const todayStr = formatDateStr(now);
        params.append("start_date", todayStr);
        params.append("end_date", todayStr);
      } else if (sessionDatePreset === "yesterday") {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yStr = formatDateStr(yesterday);
        params.append("start_date", yStr);
        params.append("end_date", yStr);
      } else if (sessionDatePreset === "7days") {
        const past7 = new Date(now);
        past7.setDate(now.getDate() - 7);
        params.append("start_date", formatDateStr(past7));
        params.append("end_date", formatDateStr(now));
      } else if (sessionDatePreset === "30days") {
        const past30 = new Date(now);
        past30.setDate(now.getDate() - 30);
        params.append("start_date", formatDateStr(past30));
        params.append("end_date", formatDateStr(now));
      }
      params.append("limit", "50");

      const data = await apiRequest<StaffPunchSessionItem[]>(`/api/staff/punch/sessions?${params.toString()}`);
      setShiftSessions(data || []);
    } catch (err) {
      console.warn("Failed to load shift sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [apiRequest, sessionStaffFilter, sessionDatePreset]);

  useEffect(() => {
    void loadShiftSessions();
  }, [loadShiftSessions]);

  const totalSalesRecorded = shiftSessions.reduce((acc, s) => acc + (Number(s.total_sales_amount) || 0), 0);
  const totalCashCollected = shiftSessions.reduce((acc, s) => acc + (Number(s.cash_collected) || 0), 0);
  const totalHandedOver = shiftSessions.reduce((acc, s) => acc + (Number(s.actual_cash_handed_over) || 0), 0);
  const totalDifference = shiftSessions.reduce((acc, s) => acc + (Number(s.cash_difference) || 0), 0);

  const isManager = currentUserRole === "MANAGER";
  const isManagerOrAdmin = ["SUPERADMIN", "OUTLET_ADMIN", "MANAGER"].includes((currentUserRole || "").toUpperCase());

  // Consolidated Store Reconciliation State (Manager & Upper Roles)
  const [recData, setRecData] = useState<ReconciliationSummary | null>(null);
  const [isLoadingRec, setIsLoadingRec] = useState(false);
  const [recDatePreset, setRecDatePreset] = useState<"today" | "yesterday" | "7days" | "30days" | "custom">("today");
  const [recCustomStart, setRecCustomStart] = useState<string>("");
  const [recCustomEnd, setRecCustomEnd] = useState<string>("");
  const [isExportingRecCsv, setIsExportingRecCsv] = useState(false);

  const loadReconciliationSummary = useCallback(async () => {
    if (!apiRequest || !isManagerOrAdmin) return;
    setIsLoadingRec(true);
    try {
      const params = new URLSearchParams();
      const now = new Date();
      const formatDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      if (recDatePreset === "today") {
        const todayStr = formatDateStr(now);
        params.append("start_date", todayStr);
        params.append("end_date", todayStr);
      } else if (recDatePreset === "yesterday") {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yStr = formatDateStr(yesterday);
        params.append("start_date", yStr);
        params.append("end_date", yStr);
      } else if (recDatePreset === "7days") {
        const past7 = new Date(now);
        past7.setDate(now.getDate() - 7);
        params.append("start_date", formatDateStr(past7));
        params.append("end_date", formatDateStr(now));
      } else if (recDatePreset === "30days") {
        const past30 = new Date(now);
        past30.setDate(now.getDate() - 30);
        params.append("start_date", formatDateStr(past30));
        params.append("end_date", formatDateStr(now));
      } else if (recDatePreset === "custom" && recCustomStart && recCustomEnd) {
        params.append("start_date", recCustomStart);
        params.append("end_date", recCustomEnd);
      }

      const data = await apiRequest<ReconciliationSummary>(`/api/billing/reconciliation-summary?${params.toString()}`);
      setRecData(data || null);
    } catch (err) {
      console.warn("Failed to load reconciliation summary:", err);
    } finally {
      setIsLoadingRec(false);
    }
  }, [apiRequest, isManagerOrAdmin, recDatePreset, recCustomStart, recCustomEnd]);

  useEffect(() => {
    if (isManagerOrAdmin) {
      void loadReconciliationSummary();
    }
  }, [loadReconciliationSummary, isManagerOrAdmin]);

  const handleDownloadRecCsv = async () => {
    if (isExportingRecCsv) return;
    setIsExportingRecCsv(true);
    try {
      const params = new URLSearchParams();
      const now = new Date();
      const formatDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      if (recDatePreset === "today") {
        const todayStr = formatDateStr(now);
        params.append("start_date", todayStr);
        params.append("end_date", todayStr);
      } else if (recDatePreset === "yesterday") {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yStr = formatDateStr(yesterday);
        params.append("start_date", yStr);
        params.append("end_date", yStr);
      } else if (recDatePreset === "7days") {
        const past7 = new Date(now);
        past7.setDate(now.getDate() - 7);
        params.append("start_date", formatDateStr(past7));
        params.append("end_date", formatDateStr(now));
      } else if (recDatePreset === "30days") {
        const past30 = new Date(now);
        past30.setDate(now.getDate() - 30);
        params.append("start_date", formatDateStr(past30));
        params.append("end_date", formatDateStr(now));
      } else if (recDatePreset === "custom" && recCustomStart && recCustomEnd) {
        params.append("start_date", recCustomStart);
        params.append("end_date", recCustomEnd);
      }
      params.append("export", "csv");

      const token = typeof window !== "undefined"
        ? window.localStorage.getItem("agb_access_token") ||
          window.localStorage.getItem("admin_access_token") ||
          window.localStorage.getItem("access_token") ||
          window.localStorage.getItem("token")
        : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/billing/reconciliation-summary?${params.toString()}`, { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `store_reconciliation_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to download reconciliation CSV:", err);
    } finally {
      setIsExportingRecCsv(false);
    }
  };

  // Inventory Stock Movement & Wastage State (Manager & Upper Roles)
  const [invSubTab, setInvSubTab] = useState<"stock_movement" | "wastage">("wastage");
  const [stockMovementData, setStockMovementData] = useState<StockMovementResponse | null>(null);
  const [wastageData, setWastageData] = useState<WastageReportResponse | null>(null);
  const [isLoadingInv, setIsLoadingInv] = useState(false);
  const [invDatePreset, setInvDatePreset] = useState<"today" | "yesterday" | "7days" | "30days" | "custom">("today");
  const [invCustomStart, setInvCustomStart] = useState<string>("");
  const [invCustomEnd, setInvCustomEnd] = useState<string>("");

  const loadInventoryStockData = useCallback(async () => {
    if (!apiRequest || !isManagerOrAdmin) return;
    setIsLoadingInv(true);
    try {
      const now = new Date();
      let fromStr = "";
      let toStr = "";

      if (invDatePreset === "today") {
        const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        fromStr = from.toISOString();
        toStr = now.toISOString();
      } else if (invDatePreset === "yesterday") {
        const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        fromStr = from.toISOString();
        toStr = to.toISOString();
      } else if (invDatePreset === "7days") {
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        fromStr = from.toISOString();
        toStr = now.toISOString();
      } else if (invDatePreset === "30days") {
        const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        fromStr = from.toISOString();
        toStr = now.toISOString();
      } else if (invDatePreset === "custom" && invCustomStart && invCustomEnd) {
        const [fYear, fMonth, fDay] = invCustomStart.split("-").map(Number);
        fromStr = new Date(fYear, fMonth - 1, fDay, 0, 0, 0).toISOString();
        const [tYear, tMonth, tDay] = invCustomEnd.split("-").map(Number);
        toStr = new Date(tYear, tMonth - 1, tDay, 23, 59, 59, 999).toISOString();
      }

      const params = new URLSearchParams();
      if (fromStr) params.append("from_date", fromStr);
      if (toStr) params.append("to_date", toStr);

      if (invSubTab === "stock_movement") {
        const mov = await apiRequest<StockMovementResponse>(`/api/analytics/stock-movement?${params.toString()}`);
        setStockMovementData(mov || null);
      } else {
        const was = await apiRequest<WastageReportResponse>(`/api/analytics/wastage?${params.toString()}`);
        setWastageData(was || null);
      }
    } catch (err) {
      console.warn("Failed to load inventory stock analytics in StaffTab:", err);
    } finally {
      setIsLoadingInv(false);
    }
  }, [apiRequest, isManagerOrAdmin, invSubTab, invDatePreset, invCustomStart, invCustomEnd]);

  useEffect(() => {
    if (isManagerOrAdmin) {
      void loadInventoryStockData();
    }
  }, [loadInventoryStockData, isManagerOrAdmin]);

  const activeStaffCount = staffList.filter((s) => s.status === "active").length;
  const inactiveStaffCount = staffList.filter((s) => s.status !== "active").length;

  const filteredStaffList = staffList.filter((member) => {
    if (statusFilter === "active") return member.status === "active";
    if (statusFilter === "inactive") return member.status !== "active";
    return true;
  });

  // Executive Day Report Download State (Reconciliation + Shifts + Stock Movement + Wastage)
  const [reportDatePreset, setReportDatePreset] = useState<"today" | "yesterday" | "7days" | "30days" | "this_month">("today");
  const [isDownloadingMasterReport, setIsDownloadingMasterReport] = useState(false);

  const handleDownloadMasterReport = async () => {
    if (!apiRequest) return;
    setIsDownloadingMasterReport(true);
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      let startDate = toStr(now);
      let endDate = toStr(now);
      let label = "Today";

      if (reportDatePreset === "yesterday") {
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        startDate = toStr(y);
        endDate = toStr(y);
        label = "Yesterday";
      } else if (reportDatePreset === "7days") {
        const p = new Date(now);
        p.setDate(now.getDate() - 7);
        startDate = toStr(p);
        endDate = toStr(now);
        label = "Last 7 Days";
      } else if (reportDatePreset === "30days") {
        const p = new Date(now);
        p.setDate(now.getDate() - 30);
        startDate = toStr(p);
        endDate = toStr(now);
        label = "Last 30 Days";
      } else if (reportDatePreset === "this_month") {
        const f = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = toStr(f);
        endDate = toStr(now);
        label = "This Month";
      }

      // Parallel non-blocking on-demand fetches — lightweight JSON, zero persistent load on DB
      const [recRes, shiftsRes, stockMovRes, wastageRes] = await Promise.allSettled([
        apiRequest<ReconciliationSummary>(`/api/billing/reconciliation-summary?start_date=${startDate}&end_date=${endDate}`),
        apiRequest<StaffPunchSessionItem[]>(`/api/staff/punch/sessions?start_date=${startDate}&end_date=${endDate}&limit=100`),
        apiRequest<StockMovementResponse>(`/api/analytics/stock-movement?from_date=${startDate}&to_date=${endDate}`),
        apiRequest<WastageReportResponse>(`/api/analytics/wastage?from_date=${startDate}&to_date=${endDate}`),
      ]);

      const recDataVal = recRes.status === "fulfilled" ? recRes.value : null;
      const shiftsDataVal = shiftsRes.status === "fulfilled" ? (shiftsRes.value || []) : [];
      const stockMovDataVal = stockMovRes.status === "fulfilled" ? stockMovRes.value : null;
      const wastageDataVal = wastageRes.status === "fulfilled" ? wastageRes.value : null;

      const dateRangeLabel = `${label} (${startDate === endDate ? startDate : `${startDate} to ${endDate}`})`;

      generateStaffExecutiveDayReportPDF(restaurant, dateRangeLabel, {
        reconciliation: recDataVal,
        shifts: shiftsDataVal,
        stockMovement: stockMovDataVal,
        wastage: wastageDataVal,
      });
    } catch (err) {
      console.error("Failed to generate master executive report:", err);
    } finally {
      setIsDownloadingMasterReport(false);
    }
  };

  // Global Keyboard Shortcuts for Staff & Team (Press '+' or Numpad '+' to open Add Staff Member)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, select, or contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      // Don't trigger if any confirmation modal is open
      if (staffToDeactivate || staffToActivate || staffToDelete) {
        return;
      }

      if (e.key === "+" || e.code === "NumpadAdd") {
        e.preventDefault();
        onOpenCreateStaff();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [staffToDeactivate, staffToActivate, staffToDelete, onOpenCreateStaff]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Staff &amp; Team Management</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Outlet roles, permissions, staff accounts, PIN setup, and action audit trail
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Executive Date Dropdown & Report Download Button */}
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1 shadow-2xs">
            <select
              value={reportDatePreset}
              onChange={(e) => setReportDatePreset(e.target.value as any)}
              className="rounded-lg bg-transparent px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-hidden cursor-pointer"
              title="Select period for executive report (Defaults to Today)"
            >
              <option value="today" className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]">Today</option>
              <option value="yesterday" className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]">Yesterday</option>
              <option value="7days" className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]">Last 7 Days</option>
              <option value="30days" className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]">Last 30 Days</option>
              <option value="this_month" className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]">This Month</option>
            </select>
            <button
              type="button"
              onClick={handleDownloadMasterReport}
              disabled={isDownloadingMasterReport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Download Executive Closing Report (Store Settlement, Shifts, Stock Movement & Wastage)"
            >
              {isDownloadingMasterReport ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              <span>{isDownloadingMasterReport ? "Generating..." : "Report"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenPinSwitch}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-3.5 py-2 text-xs font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition"
          >
            <KeyRound className="h-4 w-4" />
            <span>PIN Quick-Switch</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateStaff}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
            title="Shortcut: Press + or Numpad +"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Add Staff Member</span>
            <kbd className="ml-1 hidden sm:inline-flex items-center rounded border border-white/30 bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90 shadow-2xs">
              +
            </kbd>
          </button>
        </div>
      </div>

      {/* Staff Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Staff</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{staffList.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Staff</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {activeStaffCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">PIN Provisioned</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {staffList.filter((s) => s.has_pin).length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Audit Log Entries</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{staffAuditLogs.length}</p>
        </div>
      </div>

      {/* Staff Master Table */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[var(--accent-brand)]" />
              <h2 className="font-display text-lg font-bold">Outlet Team Roster</h2>
            </div>
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-subtle)] text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  statusFilter === "active"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Active ({activeStaffCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("inactive")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  statusFilter === "inactive"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Deactivated ({inactiveStaffCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  statusFilter === "all"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                All ({staffList.length})
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadStaffMembers()}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] self-end sm:self-auto"
            title="Refresh Roster"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingStaff ? "animate-spin text-[var(--accent-brand)]" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5">Staff Member</th>
                <th className="p-3.5">Contact</th>
                <th className="p-3.5">Assigned Role</th>
                <th className="p-3.5 text-center">PIN Status</th>
                <th className="p-3.5 text-center">Account Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {filteredStaffList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                    {statusFilter === "inactive"
                      ? "No deactivated staff members."
                      : statusFilter === "active"
                        ? "No active staff members found."
                        : "No staff members found for this outlet. Click + Add Staff Member to provision accounts."}
                  </td>
                </tr>
              ) : (
                filteredStaffList.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold text-sm">
                          {member.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{member.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">ID: {member.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 space-y-0.5">
                      <p className="font-mono text-[11px] text-[var(--text-primary)]">{member.email}</p>
                      {member.phone && <p className="font-mono text-[10px] text-[var(--text-muted)]">{member.phone}</p>}
                    </td>

                    <td className="p-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.role === "OUTLET_ADMIN" || member.role === "SUPERADMIN"
                        ? "bg-purple-100 text-purple-800"
                        : member.role === "MANAGER"
                          ? "bg-indigo-100 text-indigo-800"
                          : member.role === "FLOOR_STAFF"
                            ? "bg-amber-100 text-amber-800"
                            : member.role === "CASHIER"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-sky-800"
                        }`}>
                        {member.role.replace("_", " ")}
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      {member.has_pin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          PIN Set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
                          No PIN
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}>
                        {member.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right space-x-1">
                      {(() => {
                        const isTargetPeerOrHigher =
                          isManager &&
                          (member.role === "MANAGER" ||
                            member.role === "OUTLET_ADMIN" ||
                            member.role === "SUPERADMIN");
                        const isSelf = Boolean(currentUserId && member.id === currentUserId);
                        const canManageTarget = !isTargetPeerOrHigher && !isSelf;
                        const canDeleteTarget =
                          (currentUserRole === "OUTLET_ADMIN" || currentUserRole === "SUPERADMIN") &&
                          member.status === "inactive" &&
                          !isSelf;

                        return (
                          <>
                            {/* Set PIN */}
                            <button
                              type="button"
                              onClick={() => onOpenPinSetup(member)}
                              disabled={!canManageTarget && !isSelf}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)] disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                !canManageTarget && !isSelf
                                  ? "Managers cannot set PIN for peer or admin accounts"
                                  : "Set 4-Digit PIN"
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>

                            {/* Edit Details */}
                            <button
                              type="button"
                              onClick={() => onOpenEditStaff(member)}
                              disabled={!canManageTarget}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)] disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                !canManageTarget
                                  ? isSelf
                                    ? "Use profile settings to edit own account"
                                    : "Managers cannot edit peer or admin accounts"
                                  : "Edit Details"
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            {/* Status Toggle: Deactivate vs Activate */}
                            {member.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => setStaffToDeactivate({ id: member.id, name: member.name })}
                                disabled={!canManageTarget}
                                className="p-1.5 rounded-lg hover:bg-rose-500/15 text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={
                                  !canManageTarget
                                    ? isSelf
                                      ? "Cannot deactivate your own account"
                                      : "Managers cannot deactivate peer or admin accounts"
                                    : "Deactivate Account"
                                }
                              >
                                <UserX className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStaffToActivate({ id: member.id, name: member.name })}
                                disabled={!canManageTarget}
                                className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={
                                  !canManageTarget
                                    ? isSelf
                                      ? "Cannot change own status"
                                      : "Managers cannot activate peer or admin accounts"
                                    : "Activate Account"
                                }
                              >
                                <UserCheck className="h-4 w-4" />
                              </button>
                            )}

                            {/* Permanent Delete (Allowed only for deactivated members by Outlet Admin or Superadmin) */}
                            {canDeleteTarget && (
                              <button
                                type="button"
                                onClick={() => setStaffToDelete({ id: member.id, name: member.name })}
                                className="p-1.5 rounded-lg hover:bg-rose-600/20 text-rose-600"
                                title="Permanently Delete Account"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Consolidated Store Settlement & Returns Reconciliation — Dedicated for Manager & Upper Roles */}
      {isManagerOrAdmin && (
        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-4">
          <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                    Consolidated Store Settlement &amp; Returns Reconciliation
                  </h2>
                  <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/20 uppercase tracking-wider">
                    Manager &amp; Upper Roles
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Executive store closing reconciliation: Net sales, Cash Tender (Total), UPI Tender (Total), and returns desk deductions
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Date Presets */}
              <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1 text-xs">
                {(["today", "yesterday", "7days", "30days", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRecDatePreset(preset)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      recDatePreset === preset
                        ? "bg-[var(--accent-brand)] text-white shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {preset === "today"
                      ? "Today"
                      : preset === "yesterday"
                      ? "Yesterday"
                      : preset === "7days"
                      ? "Last 7 Days"
                      : preset === "30days"
                      ? "Last 30 Days"
                      : "Custom"}
                  </button>
                ))}
              </div>

              {recDatePreset === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={recCustomStart}
                    onChange={(e) => setRecCustomStart(e.target.value)}
                    className="text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
                  />
                  <span className="text-xs text-[var(--text-muted)]">to</span>
                  <input
                    type="date"
                    value={recCustomEnd}
                    onChange={(e) => setRecCustomEnd(e.target.value)}
                    className="text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
                  />
                </div>
              )}

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => void loadReconciliationSummary()}
                disabled={isLoadingRec}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
                title="Refresh reconciliation report"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRec ? "animate-spin" : ""}`} />
                <span>Sync</span>
              </button>

              {/* Download CSV Button */}
              <button
                type="button"
                onClick={() => void handleDownloadRecCsv()}
                disabled={isExportingRecCsv || isLoadingRec}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] hover:text-[var(--accent-brand)] transition shadow-xs cursor-pointer"
                title="Download reconciliation summary as CSV"
              >
                <Download className={`h-3.5 w-3.5 ${isExportingRecCsv ? "animate-bounce" : ""}`} />
                <span>{isExportingRecCsv ? "Exporting..." : "Export CSV"}</span>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* KPI Badges */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* 1. Cash Tender (Total) */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-emerald-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Cash Tender (Total)</span>
                  <Banknote className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="font-mono text-xl font-black text-emerald-500">
                  ₹{(recData?.cash_tender_total ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">
                  POS: +₹{(recData?.counter_cash_tender ?? 0).toFixed(2)} • Ret: -₹{(recData?.returns_cash_refund ?? 0).toFixed(2)}
                </div>
              </div>

              {/* 2. UPI Tender (Total) */}
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-sky-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">UPI Tender (Total)</span>
                  <Smartphone className="h-4 w-4 text-sky-400" />
                </div>
                <div className="font-mono text-xl font-black text-sky-500">
                  ₹{(recData?.upi_tender_total ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">
                  POS: +₹{(recData?.counter_upi_tender ?? 0).toFixed(2)} • Ret: -₹{(recData?.returns_upi_refund ?? 0).toFixed(2)}
                </div>
              </div>

              {/* 3. Total Realized Tender */}
              <div className="rounded-2xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/5 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[var(--accent-brand)] mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Total Realized Tender</span>
                  <Wallet className="h-4 w-4 text-[var(--accent-brand)]" />
                </div>
                <div className="font-mono text-xl font-black text-[var(--accent-brand)]">
                  ₹{(recData?.total_tender ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">
                  Cash Tender + UPI Tender
                </div>
              </div>

              {/* 4. Net Merchandise Sales */}
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-indigo-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Net Sales Retained</span>
                  <Receipt className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="font-mono text-xl font-black text-indigo-400">
                  ₹{(recData?.consolidated_net_sales ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">
                  Gross: ₹{(recData?.counter_gross_sales ?? 0).toFixed(2)} • Ret: -₹{((recData?.returns_gross_amount ?? 0) - (recData?.returns_exchange_value ?? 0)).toFixed(2)}
                </div>
              </div>

              {/* 5. Customer Credit-Debit Net */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-amber-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Credit-Debit Net</span>
                  <DollarSign className="h-4 w-4 text-amber-400" />
                </div>
                <div className="font-mono text-xl font-black text-amber-400">
                  {(recData?.consolidated_credit_debit_net ?? 0) >= 0 ? "+" : "-"}₹{Math.abs(recData?.consolidated_credit_debit_net ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">
                  POS: {(recData?.counter_credit_debit_net ?? 0) >= 0 ? "+" : ""}₹{(recData?.counter_credit_debit_net ?? 0).toFixed(2)} • Ret: {(recData?.returns_credit_debit_net ?? 0) >= 0 ? "+" : ""}₹{(recData?.returns_credit_debit_net ?? 0).toFixed(2)}
                </div>
              </div>

              {/* 6. Loyalty Points Redeemed */}
              <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-purple-400 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Loyalty Redeemed</span>
                  <Sparkles className="h-4 w-4 text-purple-400" />
                </div>
                <div className="font-mono text-xl font-black text-purple-400">
                  -₹{(recData?.consolidated_loyalty_redeemed ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">
                  Counter bill discounts
                </div>
              </div>
            </div>

            {/* Detailed 3-Way Reconciliation Table */}
            <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] uppercase text-[10px] font-bold">
                    <th className="p-3 pl-4">Reconciliation Line Item</th>
                    <th className="p-3 text-right">POS Billing Counter (Inflows)</th>
                    <th className="p-3 text-right">Returns &amp; Exchanges (Outflows)</th>
                    <th className="p-3 pr-4 text-right bg-[var(--accent-brand)]/5 text-[var(--accent-brand)] font-black">Consolidated Store Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-medium">
                  <tr>
                    <td className="p-3 pl-4 text-[var(--text-primary)] font-semibold">
                      Gross Merchandise / Exchange Sales
                    </td>
                    <td className="p-3 text-right font-mono text-[var(--text-primary)]">
                      ₹{(recData?.counter_gross_sales ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-400">
                      -₹{((recData?.returns_gross_amount ?? 0) - (recData?.returns_exchange_value ?? 0)).toFixed(2)}
                    </td>
                    <td className="p-3 pr-4 text-right font-mono font-bold bg-[var(--accent-brand)]/5 text-[var(--text-primary)]">
                      ₹{(recData?.consolidated_net_sales ?? 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-emerald-500/[0.03]">
                    <td className="p-3 pl-4 text-emerald-400 font-bold flex items-center gap-2">
                      <Banknote className="h-3.5 w-3.5" />
                      <span>Cash Tender</span>
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-500 font-semibold">
                      +₹{(recData?.counter_cash_tender ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-500 font-semibold">
                      -₹{(recData?.returns_cash_refund ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 pr-4 text-right font-mono font-black text-emerald-500 bg-emerald-500/10 text-sm">
                      ₹{(recData?.cash_tender_total ?? 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-sky-500/[0.03]">
                    <td className="p-3 pl-4 text-sky-400 font-bold flex items-center gap-2">
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>UPI Tender</span>
                    </td>
                    <td className="p-3 text-right font-mono text-sky-500 font-semibold">
                      +₹{(recData?.counter_upi_tender ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-500 font-semibold">
                      -₹{(recData?.returns_upi_refund ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 pr-4 text-right font-mono font-black text-sky-500 bg-sky-500/10 text-sm">
                      ₹{(recData?.upi_tender_total ?? 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 pl-4 text-[var(--text-primary)]">
                      Customer Credit / Debit Net Adjustment
                    </td>
                    <td className="p-3 text-right font-mono">
                      {(recData?.counter_credit_debit_net ?? 0) >= 0 ? "+" : ""}₹{(recData?.counter_credit_debit_net ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {(recData?.returns_credit_debit_net ?? 0) >= 0 ? "+" : ""}₹{(recData?.returns_credit_debit_net ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 pr-4 text-right font-mono font-bold bg-[var(--accent-brand)]/5">
                      {(recData?.consolidated_credit_debit_net ?? 0) >= 0 ? "+" : ""}₹{(recData?.consolidated_credit_debit_net ?? 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 pl-4 text-[var(--text-primary)]">
                      Loyalty Discounts Redeemed
                    </td>
                    <td className="p-3 text-right font-mono text-purple-400">
                      -₹{(recData?.counter_loyalty_redeemed ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-mono text-[var(--text-muted)]">
                      ₹0.00
                    </td>
                    <td className="p-3 pr-4 text-right font-mono font-bold text-purple-400 bg-[var(--accent-brand)]/5">
                      -₹{(recData?.consolidated_loyalty_redeemed ?? 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-[var(--accent-brand)]/10 font-bold border-t-2 border-[var(--accent-brand)]/30 text-[var(--text-primary)]">
                    <td className="p-3.5 pl-4 flex items-center gap-2">
                      <Scale className="h-4 w-4 text-[var(--accent-brand)]" />
                      <span className="font-extrabold">Total Realized Settlement (Cash + UPI)</span>
                    </td>
                    <td className="p-3.5 text-right font-mono text-base font-black">
                      ₹{(recData?.counter_net_paid ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-base font-black text-rose-500">
                      -₹{(recData?.returns_net_refund ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3.5 pr-4 text-right font-mono text-base font-black text-[var(--accent-brand)] bg-[var(--accent-brand)]/15">
                      ₹{(recData?.total_tender ?? 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="text-[11px] text-[var(--text-muted)]">
                    <td className="p-2.5 pl-4">Total Records / Vouchers Count</td>
                    <td className="p-2.5 text-right font-mono">{recData?.counter_bills_count ?? 0} bills</td>
                    <td className="p-2.5 text-right font-mono">{recData?.returns_count ?? 0} returns</td>
                    <td className="p-2.5 pr-4 text-right font-mono bg-[var(--accent-brand)]/5 font-bold">
                      {(recData?.counter_bills_count ?? 0) + (recData?.returns_count ?? 0)} vouchers
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </article>
      )}

      {/* Inventory Stock Movement & Wastage Tracking — Dedicated for Manager & Upper Roles */}
      {isManagerOrAdmin && (
        <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-4">
          <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                    Inventory Stock Movement &amp; Wastage
                  </h2>
                  <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/20 uppercase tracking-wider">
                    Manager &amp; Upper Roles
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Audit inventory flows: Real-time stock movements, intake additions, sales deductions, and logged wastage
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Subtab Selector: Stock Movement vs Wastage */}
              <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-subtle)] text-xs">
                <button
                  type="button"
                  onClick={() => setInvSubTab("stock_movement")}
                  className={`px-3 py-1 rounded-lg font-bold uppercase transition cursor-pointer ${
                    invSubTab === "stock_movement"
                      ? "bg-[var(--accent-brand)] text-white shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Stock Movement
                </button>
                <button
                  type="button"
                  onClick={() => setInvSubTab("wastage")}
                  className={`px-3 py-1 rounded-lg font-bold uppercase transition cursor-pointer ${
                    invSubTab === "wastage"
                      ? "bg-[var(--accent-brand)] text-white shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Wastage
                </button>
              </div>

              {/* Date Presets */}
              <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1 text-xs">
                {(["today", "yesterday", "7days", "30days", "custom"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setInvDatePreset(preset)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      invDatePreset === preset
                        ? "bg-[var(--accent-brand)] text-white shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {preset === "today"
                      ? "Today"
                      : preset === "yesterday"
                      ? "Yesterday"
                      : preset === "7days"
                      ? "Last 7 Days"
                      : preset === "30days"
                      ? "Last 30 Days"
                      : "Custom"}
                  </button>
                ))}
              </div>

              {invDatePreset === "custom" && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={invCustomStart}
                    onChange={(e) => setInvCustomStart(e.target.value)}
                    className="text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
                  />
                  <span className="text-xs text-[var(--text-muted)]">to</span>
                  <input
                    type="date"
                    value={invCustomEnd}
                    onChange={(e) => setInvCustomEnd(e.target.value)}
                    className="text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
                  />
                </div>
              )}

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => void loadInventoryStockData()}
                disabled={isLoadingInv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
                title="Refresh inventory reports"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingInv ? "animate-spin" : ""}`} />
                <span>Sync</span>
              </button>
            </div>
          </div>

          <div className="p-4">
            {invSubTab === "stock_movement" && (
              <StockMovementReport data={stockMovementData} isLoading={isLoadingInv} />
            )}
            {invSubTab === "wastage" && (
              <WastageReport data={wastageData} isLoading={isLoadingInv} />
            )}
          </div>
        </article>
      )}

      {/* Shift Handover & Cash Collection History — Directly below Outlet Team Roster */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-4">
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                Shift Handover &amp; Cash Collection History
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Cashier shift reconciliation records, drawer cash tallies, and handover receipts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Staff Filter */}
            <select
              value={sessionStaffFilter}
              onChange={(e) => setSessionStaffFilter(e.target.value)}
              className="text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Cashiers &amp; Staff</option>
              {staffList.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.role})
                </option>
              ))}
            </select>

            {/* Date Preset Filter */}
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1 text-xs">
              <button
                type="button"
                onClick={() => setSessionDatePreset("today")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sessionDatePreset === "today"
                    ? "bg-[var(--accent-brand)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSessionDatePreset("yesterday")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sessionDatePreset === "yesterday"
                    ? "bg-[var(--accent-brand)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setSessionDatePreset("7days")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sessionDatePreset === "7days"
                    ? "bg-[var(--accent-brand)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setSessionDatePreset("30days")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sessionDatePreset === "30days"
                    ? "bg-[var(--accent-brand)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => setSessionDatePreset("all")}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  sessionDatePreset === "all"
                    ? "bg-[var(--accent-brand)] text-white shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                All
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => void loadShiftSessions()}
              disabled={isLoadingSessions}
              className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition disabled:opacity-50"
              title="Refresh Shift Records"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingSessions ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Stats Summary Bar */}
        {shiftSessions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-medium text-[var(--text-muted)] block">Total Sales</span>
              <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                {formatRupees(totalSalesRecorded)}
              </span>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-medium text-[var(--text-muted)] block">Cash Sales Collected</span>
              <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatRupees(totalCashCollected)}
              </span>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-medium text-[var(--text-muted)] block">Physical Handed Over</span>
              <span className="font-mono text-base font-bold text-[var(--text-primary)]">
                {formatRupees(totalHandedOver)}
              </span>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[11px] font-medium text-[var(--text-muted)] block">Net Tally Variance</span>
              <span
                className={`font-mono text-base font-bold ${
                  Math.abs(totalDifference) < 0.01
                    ? "text-emerald-600 dark:text-emerald-400"
                    : totalDifference < 0
                    ? "text-rose-500"
                    : "text-amber-500"
                }`}
              >
                {Math.abs(totalDifference) < 0.01
                  ? "₹0.00 (Balanced)"
                  : totalDifference < 0
                  ? `-₹${Math.abs(totalDifference).toFixed(2)} (Shortage)`
                  : `+₹${totalDifference.toFixed(2)} (Excess)`}
              </span>
            </div>
          </div>
        )}

        {/* Table of Shift Sessions */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-3 px-4">Cashier / Staff</th>
                <th className="py-3 px-4">Shift Timing</th>
                <th className="py-3 px-4 text-right">Opening Float</th>
                <th className="py-3 px-4 text-right">Bills &amp; Sales</th>
                <th className="py-3 px-4 text-right">Collections</th>
                <th className="py-3 px-4 text-right">Expected Drawer</th>
                <th className="py-3 px-4 text-right">Handed Over</th>
                <th className="py-3 px-4 text-center">Tally Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {isLoadingSessions ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--text-muted)]">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full border-2 border-[var(--accent-brand)]/30 border-t-[var(--accent-brand)] animate-spin" />
                      <span>Loading shift handover sessions...</span>
                    </div>
                  </td>
                </tr>
              ) : shiftSessions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[var(--text-muted)]">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No shift handover records found</p>
                    <p className="text-[11px] opacity-75">
                      Shift collection summaries appear here whenever cashiers settle and punch out.
                    </p>
                  </td>
                </tr>
              ) : (
                shiftSessions.map((session) => {
                  const isSettled = session.status === "SETTLED";
                  const diffVal = Number(session.cash_difference || 0);
                  const isDiffZero = Math.abs(diffVal) < 0.01;
                  const isDiffNegative = diffVal < -0.01;

                  return (
                    <tr key={session.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                      {/* Cashier & Role */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-[var(--text-primary)]">
                            {session.staff_name}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="rounded-md bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                              {session.staff_role}
                            </span>
                            {session.auto_punched_out && (
                              <span className="text-[9px] text-amber-500 font-semibold" title="Auto punched out by night reset">
                                (Auto Reset)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Timing */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-[var(--text-primary)] font-medium">
                            In: {formatDateTime(session.punch_in_at)}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            Out: {session.punch_out_at ? formatDateTime(session.punch_out_at) : "Active"}
                          </span>
                          <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                            ⏱ {session.duration_formatted || "In Progress"}
                          </span>
                        </div>
                      </td>

                      {/* Opening Cash Float */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-[var(--text-primary)]">
                        {formatRupees(session.opening_cash)}
                      </td>

                      {/* Bills & Gross Sales */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {formatRupees(session.total_sales_amount)}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] font-medium">
                            {session.total_bills_count} {session.total_bills_count === 1 ? "bill" : "bills"}
                          </span>
                        </div>
                      </td>

                      {/* Collections Breakdown */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex flex-col items-end text-[11px]">
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                            Cash: +{formatRupees(session.cash_collected)}
                          </span>
                          <span className="font-mono text-sky-600 dark:text-sky-400 text-[10px]">
                            UPI: {formatRupees(session.upi_collected)}
                          </span>
                          {Number(session.returns_refund_cash || 0) > 0 && (
                            <span className="font-mono text-rose-500 text-[10px]">
                              Refunds: -{formatRupees(session.returns_refund_cash)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Expected Drawer Cash */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatRupees(session.expected_cash_in_drawer)}
                      </td>

                      {/* Handed Over */}
                      <td className="py-3.5 px-4 text-right font-mono font-black text-[var(--text-primary)]">
                        {isSettled ? formatRupees(session.actual_cash_handed_over) : "—"}
                      </td>

                      {/* Tally Status */}
                      <td className="py-3.5 px-4 text-center">
                        {!isSettled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-semibold text-emerald-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active Shift
                          </span>
                        ) : isDiffZero ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Balanced
                          </span>
                        ) : isDiffNegative ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-500">
                            <AlertCircle className="h-3 w-3" />
                            Short: -{formatRupees(Math.abs(diffVal))}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            <AlertCircle className="h-3 w-3" />
                            Excess: +{formatRupees(diffVal)}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => generateShiftHandoverReceiptPDF(session, restaurant, "print")}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--accent-brand)] hover:text-white transition shadow-2xs"
                          title="Print Thermal Shift Handover Slip"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Slip</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Staff Audit Trail */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold">Staff Action Audit Trail</h2>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={auditRoleFilter}
              onChange={(e) => setAuditRoleFilter(e.target.value)}
              className="text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Roles</option>
              <option value="SUPERADMIN">Superadmin</option>
              <option value="OUTLET_ADMIN">Outlet Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="CASHIER">Cashier</option>
              <option value="DELIVERY_BOY">Delivery Boy</option>
              <option value="STAFF">General Staff</option>
            </select>
            <select
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
              className="text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Actions</option>
              <option value="punch_in">Shift Punch-In</option>
              <option value="punch_out">Shift Punch-Out</option>
              <option value="staff_pin_logged_in">PIN Login</option>
              <option value="pin_quick_switch">PIN Quick-Switch</option>
              <option value="bill_deleted">Bill Deleted</option>
              <option value="staff_created">Staff Created</option>
              <option value="staff_updated">Staff Updated</option>
              <option value="staff_deactivated">Staff Deactivated</option>
              <option value="staff_pin_updated">PIN Updated</option>
            </select>
            <select
              value={auditDateFilter}
              onChange={(e) => setAuditDateFilter(e.target.value)}
              className="text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
            <button
              type="button"
              onClick={() => void loadStaffAuditLogs()}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
              title="Refresh Audit Logs"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5 whitespace-nowrap">Timestamp</th>
                <th className="p-3.5 whitespace-nowrap">Staff Member</th>
                <th className="p-3.5 whitespace-nowrap">Action Type</th>
                <th className="p-3.5 whitespace-nowrap">Reference</th>
                <th className="p-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {staffAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                    No staff action audit records logged yet.
                  </td>
                </tr>
              ) : (
                staffAuditLogs.map((log) => {
                  const renderAuditDetails = (details?: string | null, actionType?: string) => {
                    if (!details) return <span className="text-[var(--text-muted)]">—</span>;

                    // Case 1: Punch Out audit log details
                    if (actionType === "punch_out") {
                      const parts = details
                        .split(/\.\s+/)
                        .map((p) => p.trim().replace(/\.$/, ""))
                        .filter(Boolean);

                      if (parts.length >= 2) {
                        const title = parts[0];
                        const timePart = parts.find((p) => p.toLowerCase().includes("elapsed shift time"));
                        const salesPart = parts.find((p) => p.toLowerCase().includes("sales:"));
                        const handoverPart = parts.find((p) => p.toLowerCase().includes("handover cash:"));
                        const otherParts = parts.filter(
                          (p, idx) => idx !== 0 && p !== timePart && p !== salesPart && p !== handoverPart
                        );

                        return (
                          <div className="flex flex-col gap-1 py-1 max-w-xl">
                            <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span>{title}</span>
                            </div>

                            {(timePart || salesPart) && (
                              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 flex-wrap pl-3">
                                {timePart && (
                                  <span>
                                    ⏱ <strong className="text-[var(--text-primary)] font-mono">{timePart.replace(/^elapsed shift time:\s*/i, "")}</strong>
                                  </span>
                                )}
                                {timePart && salesPart && <span>•</span>}
                                {salesPart && (
                                  <span>
                                    Sales: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{salesPart.replace(/^sales:\s*/i, "")}</strong>
                                  </span>
                                )}
                              </div>
                            )}

                            {handoverPart && (
                              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap pl-3">
                                <span>💵 {handoverPart}</span>
                              </div>
                            )}

                            {otherParts.map((part, i) => (
                              <div key={i} className="text-[11px] text-[var(--text-secondary)] pl-3">
                                {part}
                              </div>
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div className="font-semibold text-amber-600 dark:text-amber-400 py-0.5 max-w-xl break-words">
                          {details}
                        </div>
                      );
                    }

                    // Case 2: Punch In audit log details
                    if (actionType === "punch_in") {
                      const match = details.match(
                        /^(Staff\s+['"][^'"]+['"]\s+punched in for shift)\s+with\s+(starting drawer cash\s+.*)$/i
                      );
                      if (match) {
                        return (
                          <div className="flex flex-col gap-1 py-1 max-w-xl">
                            <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{match[1]}</span>
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] pl-3 flex items-center gap-1">
                              <span>💵 Starting drawer cash:</span>
                              <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                                {match[2].replace(/^starting drawer cash\s*/i, "")}
                              </strong>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400 py-0.5 max-w-xl break-words">
                          {details}
                        </div>
                      );
                    }

                    // Case 3: Other actions with multi-sentence or newline details
                    const lines = details
                      .split(/\n|\.\s+/)
                      .map((l) => l.trim().replace(/\.$/, ""))
                      .filter(Boolean);

                    if (lines.length > 1) {
                      return (
                        <div className="flex flex-col gap-0.5 py-1 max-w-xl">
                          {lines.map((line, idx) => (
                            <div key={idx} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              {line}
                            </div>
                          ))}
                        </div>
                      );
                    }

                    return (
                      <div className="text-xs text-[var(--text-secondary)] py-0.5 max-w-xl break-words leading-relaxed">
                        {details}
                      </div>
                    );
                  };

                  return (
                    <tr key={log.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                      <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px] whitespace-nowrap">
                        {parseUTCDate(log.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3.5 font-bold text-[var(--text-primary)] whitespace-nowrap">{log.staff_name || "System / Admin"}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        {log.action_type === "punch_in" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            PUNCH IN
                          </span>
                        ) : log.action_type === "punch_out" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            PUNCH OUT
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-[var(--accent-brand)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-brand)] uppercase">
                            {log.action_type.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                        {log.reference_type ? `${log.reference_type} #${log.reference_id?.slice(0, 8)}` : "—"}
                      </td>
                      <td className="p-3.5 text-[var(--text-secondary)] font-medium max-w-xl">
                        {renderAuditDetails(log.details, log.action_type)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            Page {auditPage} of {auditTotalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={auditPage >= auditTotalPages}
              onClick={() => setAuditPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </article>

      {/* Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={!!staffToDeactivate}
        title="Deactivate Staff Member"
        message={`Are you sure you want to deactivate staff member "${staffToDeactivate?.name}"? They will no longer be able to log in or switch via PIN, and any active punch session will be closed.`}
        confirmText="Deactivate"
        onConfirm={() => {
          if (staffToDeactivate) {
            void onDeactivateStaffMember(staffToDeactivate.id, staffToDeactivate.name);
          }
        }}
        onClose={() => setStaffToDeactivate(null)}
      />

      {/* Activate Confirmation Modal */}
      <ConfirmModal
        isOpen={!!staffToActivate}
        title="Activate Staff Member"
        message={`Are you sure you want to reactivate staff member "${staffToActivate?.name}"? Their account access will be restored.`}
        confirmText="Activate"
        onConfirm={() => {
          if (staffToActivate) {
            void onActivateStaffMember(staffToActivate.id, staffToActivate.name);
          }
        }}
        onClose={() => setStaffToActivate(null)}
      />

      {/* Permanent Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!staffToDelete}
        title="Permanently Delete Staff Member"
        message={`Are you sure you want to permanently delete "${staffToDelete?.name}"? This action cannot be undone and will permanently remove their credentials and account.`}
        confirmText="Permanently Delete"
        onConfirm={() => {
          if (staffToDelete) {
            void onDeleteStaffMemberPermanently(staffToDelete.id, staffToDelete.name);
          }
        }}
        onClose={() => setStaffToDelete(null)}
      />
    </div>
  );
}
