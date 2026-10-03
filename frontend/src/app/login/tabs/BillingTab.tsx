/**
 * BillingTab — Billing & Point of Sale (POS) tab for the admin dashboard.
 *
 * Displays pending discount approvals queue, bill history table with search & filters,
 * and triggers for Create Bill, Discount, and Payment modals.
 * Extracted from admin page.tsx (lines 4180-4468).
 */

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  CreditCard,
  Percent,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  Eye,
  Download,
  FileEdit,
  RotateCcw,
  Banknote,
  Calendar,
  Trash2,
  X,
  Clock,
  Play,
  MoreHorizontal,
  ChevronDown,
  FileText,
  Loader2,
  Barcode,
} from "lucide-react";
import { generateReceiptPDF, generateBillsHistoryPdfReport } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import type { DiscountApproval, ManualBill, RolePermissions } from "@/types";
import type { RestaurantProfile, AdminMenuItem } from "../adminTypes";
import { apiRequest , parseUTCDate} from "../adminUtils";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { CustomerReturnsModal } from "../modals/CustomerReturnsModal";
import { ReturnSuccessModal } from "../modals/ReturnSuccessModal";
import { DeleteBillModal } from "../modals/DeleteBillModal";

type BillingTabProps = {
  restaurant: RestaurantProfile | null;
  staffPermissions: RolePermissions | null;
  isLoadingBilling: boolean;
  loadBillingData: () => Promise<void>;
  pendingApprovals: DiscountApproval[];
  handleResolveApproval: (approvalId: string, approve: boolean) => Promise<void>;
  billsList: ManualBill[];
  menuItems?: AdminMenuItem[];
  billingStatusFilter: any;
  setBillingStatusFilter: (status: any) => void;
  billingSearchQuery: string;
  setBillingSearchQuery: (query: string) => void;
  computedStartDate?: string;
  computedEndDate?: string;
  dateRangeMode?: string;
  dailyGrandTotal?: number;
  dailyNetPaid?: number;
  dailyUpiPaid?: number;
  dailyNetCash?: number;
  dailyReturnsTotal?: number;
  dailyCreditDebitNet?: number;
  dailyLoyaltyRedeemed?: number;

  // Modal triggers
  onOpenCreateBill: () => void;
  onResumeDraft: (bill: ManualBill) => void;
  onOpenDiscountModal: (bill: ManualBill) => void;
  onOpenPaymentModal: (bill: ManualBill) => void;
  onEditCompletedBill?: (bill: ManualBill) => void;
  onDeleteBill?: (billId: string) => Promise<void>;
  onBillSettled?: () => void;
  isAdminRole?: boolean;
  isPunchedIn?: boolean;
  onRequirePunchIn?: () => void;
  isCreateBillOpen?: boolean;
};

const MAIN_STATUS_TABS = ["ALL", "DRAFT", "PAID / COMPLETED", "VOIDED"] as const;
const MORE_STATUS_TABS = [
  "PENDING / PAYMENT",
  "VERIFICATION",
  "PARTIALLY REFUNDED",
  "REFUNDED",
  "CANCELLED",
] as const;

export function BillingTab({
  restaurant,
  staffPermissions,
  isLoadingBilling,
  loadBillingData,
  pendingApprovals,
  handleResolveApproval,
  billsList,
  menuItems = [],
  billingStatusFilter,
  setBillingStatusFilter,
  billingSearchQuery,
  setBillingSearchQuery,
  computedStartDate,
  computedEndDate,
  dateRangeMode,
  dailyGrandTotal,
  dailyNetPaid,
  dailyUpiPaid,
  dailyNetCash,
  dailyReturnsTotal,
  dailyCreditDebitNet,
  dailyLoyaltyRedeemed,
  onOpenCreateBill,
  onResumeDraft,
  onOpenDiscountModal,
  onOpenPaymentModal,
  onEditCompletedBill,
  onDeleteBill,
  onBillSettled,
  isAdminRole = true,
  isPunchedIn = true,
  onRequirePunchIn,
  isCreateBillOpen = false,
}: BillingTabProps) {
  const [returnsModalOpen, setReturnsModalOpen] = useState(false);
  const [returnsInitialTab, setReturnsInitialTab] = useState<"USER_HISTORY" | "INVOICE_NO" | "RETURN_HISTORY">("USER_HISTORY");
  const [billToDelete, setBillToDelete] = useState<ManualBill | null>(null);
  const [successReturnData, setSuccessReturnData] = useState<any | null>(null);
  const [showReturnSuccessModal, setShowReturnSuccessModal] = useState(false);
  const [showDenomWidget, setShowDenomWidget] = useState(false);
  const [activeDropdownBillId, setActiveDropdownBillId] = useState<string | null>(null);
  const [isMoreFilterOpen, setIsMoreFilterOpen] = useState(false);
  const moreFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      setActiveDropdownBillId(null);
      if (moreFilterRef.current && !moreFilterRef.current.contains(e.target as Node)) {
        setIsMoreFilterOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDropdownBillId(null);
        setIsMoreFilterOpen(false);
      }
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const menuItemsMap = useMemo(() => {
    const map: Record<string, AdminMenuItem> = {};
    menuItems.forEach((m) => {
      map[m.id] = m;
    });
    return map;
  }, [menuItems]);

  const [error, setError] = useState<string | null>(null);
  const [serverSearchedBills, setServerSearchedBills] = useState<ManualBill[]>([]);
  const [isSearchingServerBills, setIsSearchingServerBills] = useState(false);

  // Auto-search across all past bills if local date filter doesn't find the scanned bill ID
  useEffect(() => {
    const raw = billingSearchQuery.trim();
    const clean = raw.replace(/^#/, "").toLowerCase();
    if (clean.length < 3) {
      setServerSearchedBills([]);
      return;
    }

    // Check if query already matches anything in billsList
    const hasLocalMatch = billsList.some((b) => {
      const idL = b.id.toLowerCase();
      const invL = ((b as any).invoice_no || "").toLowerCase();
      const bskL = (b.basket_number || "").toLowerCase();
      return idL.includes(clean) || invL.includes(clean) || bskL.includes(clean);
    });

    if (hasLocalMatch) {
      setServerSearchedBills([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingServerBills(true);
      try {
        const results = await apiRequest<ManualBill[]>(
          `/api/billing/bills?search=${encodeURIComponent(clean)}&limit=25`
        );
        if (Array.isArray(results)) {
          setServerSearchedBills(results);
        }
      } catch (err) {
        console.error("Error searching past bills:", err);
      } finally {
        setIsSearchingServerBills(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [billingSearchQuery, billsList]);

  // Combined bills list: local bills for date range + server-searched bills (deduplicated)
  const combinedBillsList = useMemo(() => {
    if (serverSearchedBills.length === 0) return billsList;
    const map = new Map<string, ManualBill>();
    billsList.forEach((b) => map.set(b.id, b));
    serverSearchedBills.forEach((b) => {
      if (!map.has(b.id)) map.set(b.id, b);
    });
    return Array.from(map.values());
  }, [billsList, serverSearchedBills]);

  const filteredBills = useMemo(() => {
    const raw = billingSearchQuery.trim();
    const cleanQ = raw.replace(/^#/, "").toLowerCase();
    const hasSearch = Boolean(cleanQ);

    return combinedBillsList.filter((b) => {
      if (!hasSearch && billingStatusFilter !== "ALL") {
        const s = (b.status || "").toUpperCase();
        const ds = (b.discount_status || "").toUpperCase();
        if (billingStatusFilter === "DRAFT") {
          if (s !== "DRAFT" && s !== "PENDING" && s !== "PAYMENT_PENDING") return false;
        } else if (billingStatusFilter === "PENDING / PAYMENT") {
          if (s !== "PENDING" && s !== "PAYMENT_PENDING") return false;
        } else if (billingStatusFilter === "VERIFICATION") {
          if (s !== "PENDING_VERIFICATION" && ds !== "PENDING_APPROVAL") return false;
        } else if (billingStatusFilter === "PAID / COMPLETED") {
          if (s !== "PAID" && s !== "COMPLETED" && s !== "FINALIZED") return false;
        } else if (billingStatusFilter === "PARTIALLY REFUNDED") {
          if (s !== "PARTIALLY_REFUNDED") return false;
        } else if (billingStatusFilter === "REFUNDED") {
          if (s !== "REFUNDED" || b.is_void) return false;
        } else if (billingStatusFilter === "VOIDED") {
          if (s !== "REFUNDED" || !b.is_void) return false;
        } else if (billingStatusFilter === "CANCELLED") {
          if (s !== "CANCELLED") return false;
        } else if (s !== billingStatusFilter) {
          return false;
        }
      }
      if (hasSearch) {
        const idMatch = b.id.toLowerCase().includes(cleanQ);
        const invMatch = (b as any).invoice_no ? (b as any).invoice_no.toLowerCase().includes(cleanQ) : false;
        const basketMatch = b.basket_number ? b.basket_number.toLowerCase().includes(cleanQ) : false;
        const nameMatch = b.customer_name ? b.customer_name.toLowerCase().includes(raw.toLowerCase()) : false;
        const phoneMatch = b.customer_phone ? b.customer_phone.includes(cleanQ) : false;

        return idMatch || invMatch || basketMatch || nameMatch || phoneMatch;
      }
      return true;
    });
  }, [combinedBillsList, billingStatusFilter, billingSearchQuery]);

  // Dual horizontal scroll sync (Top and Bottom scrollbars)
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const isSyncingTop = useRef(false);
  const isSyncingTable = useRef(false);

  useEffect(() => {
    const updateScrollMetrics = () => {
      if (tableScrollRef.current) {
        const sw = tableScrollRef.current.scrollWidth;
        const cw = tableScrollRef.current.clientWidth;
        setTableScrollWidth(sw);
        setHasHorizontalOverflow(sw > cw + 2);
      }
    };
    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && tableScrollRef.current) {
      observer = new ResizeObserver(updateScrollMetrics);
      observer.observe(tableScrollRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateScrollMetrics);
      observer?.disconnect();
    };
  }, [filteredBills]);

  const handleTopScroll = () => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    if (topScrollRef.current && tableScrollRef.current) {
      isSyncingTable.current = true;
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleTableScroll = () => {
    if (isSyncingTable.current) {
      isSyncingTable.current = false;
      return;
    }
    if (topScrollRef.current && tableScrollRef.current) {
      isSyncingTop.current = true;
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  };


  const handleExportBillsPdf = () => {
    if (filteredBills.length === 0) {
      setError("No bills match the selected filter to export.");
      return;
    }

    let dateLabel = "All Time";
    if (dateRangeMode === "today") {
      dateLabel = `Today (${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})`;
    } else if (dateRangeMode === "yesterday") {
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      dateLabel = `Yesterday (${yDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})`;
    } else if (dateRangeMode === "last2days") {
      dateLabel = "Last 2 Days";
    } else if (dateRangeMode === "week") {
      dateLabel = "This Week";
    } else if (dateRangeMode === "last7" || (dateRangeMode as string) === "last_7") {
      dateLabel = "Last 7 Days";
    } else if (dateRangeMode === "this_month" || (dateRangeMode as string) === "thisMonth") {
      dateLabel = `This Month (${new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })})`;
    } else if (dateRangeMode === "last30" || (dateRangeMode as string) === "last_30") {
      dateLabel = "Last 30 Days";
    } else if (computedStartDate && computedEndDate) {
      dateLabel = computedStartDate === computedEndDate 
        ? computedStartDate 
        : `${computedStartDate} to ${computedEndDate}`;
    }

    generateBillsHistoryPdfReport({
      restaurant,
      dateRangeLabel: dateLabel,
      statusFilterLabel: billingStatusFilter,
      searchQuery: billingSearchQuery,
      bills: filteredBills,
    });
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === "+" || e.code === "NumpadAdd") {
        e.preventDefault();
        onOpenCreateBill();
      } else if (e.key === "/") {
        e.preventDefault();
        document.getElementById("billing-search-input")?.focus();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        const recentBill = billsList.find(b => b.status === "PAID" || b.status === "COMPLETED");
        if (recentBill) {
          generateReceiptPDF(recentBill as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "print");
        }
      }
    };
    
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onOpenCreateBill, billsList, restaurant]);
  
  const [liveDrawerData, setLiveDrawerData] = useState<{
    denominations: Record<string, number>;
    total_balance: number;
  } | null>(null);

  // Drawer Transaction Modal State
  const [drawerTxModalOpen, setDrawerTxModalOpen] = useState(false);
  const [drawerTxType, setDrawerTxType] = useState<"MANUAL_DEPOSIT" | "MANUAL_WITHDRAWAL">("MANUAL_DEPOSIT");
  const [drawerTxDenoms, setDrawerTxDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });
  const [drawerTxNotes, setDrawerTxNotes] = useState("");
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  // Hardware barcode scanner support on POS Billing Tab
  useBarcodeScanner({
    enabled: !isCreateBillOpen && !returnsModalOpen && !billToDelete && !showReturnSuccessModal && !drawerTxModalOpen,
    onScan: (barcode: string) => {
      const clean = barcode.replace(/^#/, "").trim();
      if (!clean) return;
      setBillingSearchQuery(clean);
      const input = document.getElementById("billing-search-input") as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    },
  });

  const fetchLiveDrawer = async () => {
    try {
      const data = await apiRequest<{
        denominations: Record<string, number>;
        total_balance: number;
      }>("/api/billing/drawer-state");
      setLiveDrawerData(data);
    } catch (err) {
      console.error("Error loading live drawer:", err);
    }
  };

  useEffect(() => {
    if (showDenomWidget || drawerTxModalOpen) {
      void fetchLiveDrawer();
    }
  }, [showDenomWidget, drawerTxModalOpen]);

  // One-click select all available drawer notes & amount for evening closing drop
  const handleSelectExactAll = () => {
    if (!liveDrawerData?.denominations) return;
    const newDenoms: Record<number, number> = { 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 };
    Object.entries(liveDrawerData.denominations).forEach(([d, count]) => {
      const denomNum = Number(d);
      if (denomNum in newDenoms && count > 0) {
        newDenoms[denomNum] = count;
      }
    });
    setDrawerTxDenoms(newDenoms);
    // Note: drawerTxNotes is left untouched so the user can enter/select reason manually
  };

  // Keyboard shortcut handler for 3x3 notes grid inside drawer modal (Numpad 1-9 & Digits 1-9)
  useEffect(() => {
    if (!drawerTxModalOpen) return;

    const handleDrawerKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setDrawerTxModalOpen(false);
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setDrawerTxDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
        return;
      }

      const numpadMap: Record<string, number> = {
        "Numpad7": 500, "Digit7": 500,
        "Numpad8": 200, "Digit8": 200,
        "Numpad9": 100, "Digit9": 100,
        "Numpad4": 50,  "Digit4": 50,
        "Numpad5": 20,  "Digit5": 20,
        "Numpad6": 10,  "Digit6": 10,
        "Numpad1": 5,   "Digit1": 5,
        "Numpad2": 2,   "Digit2": 2,
        "Numpad3": 1,   "Digit3": 1,
      };

      const denom = numpadMap[e.code];
      if (denom) {
        e.preventDefault();
        const isNumpadShifted = e.code.startsWith("Numpad") && !/^\d$/.test(e.key);
        const isRemoveAction = e.shiftKey || isNumpadShifted;

        setDrawerTxDenoms((prev) => {
          const curCount = prev[denom] || 0;
          if (isRemoveAction) {
            return { ...prev, [denom]: Math.max(0, curCount - 1) };
          } else {
            return { ...prev, [denom]: curCount + 1 };
          }
        });
      }
    };

    window.addEventListener("keydown", handleDrawerKeyDown);
    return () => window.removeEventListener("keydown", handleDrawerKeyDown);
  }, [drawerTxModalOpen]);

  const handleDrawerTxSubmit = async () => {
    setIsSubmittingTx(true);
    try {
      await apiRequest("/api/billing/drawer-transaction", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: drawerTxType,
          denominations: drawerTxDenoms,
          notes: drawerTxNotes || null,
        }),
      });
      setDrawerTxModalOpen(false);
      setDrawerTxNotes("");
      setDrawerTxDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      await fetchLiveDrawer();
      setDrawerTxModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to process drawer transaction");
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const handleProcessCustomerReturn = async (returnData: any) => {
    try {
      const res = await apiRequest<any>("/api/billing/returns", {
        method: "POST",
        body: JSON.stringify(returnData),
      });
      setSuccessReturnData(res);
      setReturnsModalOpen(false);
      setShowReturnSuccessModal(true);
      void loadBillingData();
      void fetchLiveDrawer();
      onBillSettled?.();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to process return.");
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex items-center justify-between text-sm font-bold text-rose-500">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full bg-rose-500 p-0.5 text-[var(--bg-surface)]">
              <ShieldAlert className="h-4 w-4" />
            </span>
            {error}
          </div>
          <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100 uppercase text-[10px] tracking-wider px-2 py-1 rounded bg-rose-500/20">
            Dismiss
          </button>
        </div>
      )}

      {/* Header & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[var(--accent-brand)]" />
            Billing &amp; Point of Sale (POS)
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Create walk-in &amp; phone bills
          </p>
        </div>

        {/* Mobile KPI Summary Bridge (visible when sticky top bar is hidden on smaller screens) */}
        {(dailyGrandTotal !== undefined || dailyNetPaid !== undefined) && (
          <div className="sm:hidden w-full flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] text-xs shadow-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-black">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">Total:</span>
              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-black">₹{(dailyGrandTotal || 0).toFixed(2)}</span>
            </div>

            {/* Mobile Counter Credit / Debit Pill */}
            {(dailyCreditDebitNet || 0) !== 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-black">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">Credit-Debit:</span>
                <span className="font-mono text-neutral-900 dark:text-neutral-100 font-black">
                  {(dailyCreditDebitNet || 0) > 0 ? "+" : "-"}₹{Math.abs(dailyCreditDebitNet || 0).toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-black">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">Net:</span>
              <span className="font-mono text-neutral-900 dark:text-neutral-100 font-black">₹{(dailyNetPaid || 0).toFixed(2)}</span>
            </div>

            {dailyUpiPaid !== undefined && dailyUpiPaid > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-black">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">UPI:</span>
                <span className="font-mono text-neutral-900 dark:text-neutral-100 font-black">₹{dailyUpiPaid.toFixed(2)}</span>
              </div>
            )}

            {dailyNetCash !== undefined && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-black">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">Net Cash:</span>
                <span className="font-mono text-neutral-900 dark:text-neutral-100 font-black">₹{dailyNetCash.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!isAdminRole && !isPunchedIn) {
                onRequirePunchIn?.();
                return;
              }
              setShowDenomWidget(!showDenomWidget);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${showDenomWidget ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]" : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)]"}`}
          >
            <Banknote className="h-4 w-4" />
            Live Cash Drawer
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isAdminRole && !isPunchedIn) {
                onRequirePunchIn?.();
                return;
              }
              setReturnsInitialTab("USER_HISTORY");
              setReturnsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            Returns &amp; Exchanges
          </button>
          <button
            type="button"
            onClick={() => {
              void loadBillingData();
              void fetchLiveDrawer();
            }}
            disabled={isLoadingBilling}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingBilling ? "animate-spin" : ""}`} />
            Sync Billing
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isAdminRole && !isPunchedIn) {
                onRequirePunchIn?.();
                return;
              }
              onOpenCreateBill();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
          >
            <Plus className="h-4 w-4" />
            Create New Bill
          </button>
        </div>
      </div>

{/* LIVE CASH DRAWER WIDGET */}
      {showDenomWidget && (
        <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2 font-bold text-emerald-300">
              <Banknote className="h-5 w-5 text-emerald-400" />
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">Live Cash Drawer State</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setDrawerTxType("MANUAL_DEPOSIT"); setDrawerTxModalOpen(true); }}
                className="rounded-lg bg-emerald-500/20 text-emerald-500 px-3 py-1 text-xs font-bold hover:bg-emerald-500/30 transition"
              >
                + Add Cash (Float)
              </button>
              <button
                type="button"
                onClick={() => { setDrawerTxType("MANUAL_WITHDRAWAL"); setDrawerTxModalOpen(true); }}
                className="rounded-lg bg-rose-500/20 text-rose-500 px-3 py-1 text-xs font-bold hover:bg-rose-500/30 transition"
              >
                - Withdraw Cash (Drop)
              </button>
              <button onClick={fetchLiveDrawer} className="p-1 text-emerald-400 hover:text-emerald-300">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!liveDrawerData ? (
            <p className="text-xs text-[var(--text-muted)] py-4">Loading live drawer state...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[var(--text-secondary)]">Current Physical Balance:</span>
                <span className="font-mono text-xl text-emerald-400 font-black">
                  ₹{liveDrawerData.total_balance.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((d) => {
                  const count = liveDrawerData.denominations[String(d)] || 0;
                  return (
                    <div
                      key={`drawer-${d}`}
                      className={`rounded-xl border p-2 text-center space-y-0.5 ${count < 0 ? 'border-rose-500/20 bg-rose-500/10' : count > 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'}`}
                    >
                      <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">
                        ₹{d} Notes
                      </span>
                      <span className={`font-mono font-bold text-sm block ${count < 0 ? 'text-rose-400' : 'text-[var(--text-primary)]'}`}>
                        {count}×
                      </span>
                      <span className={`font-mono text-[10px] block font-semibold ${count < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        ₹{d * count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </article>
      )}
      {pendingApprovals.length > 0 && (!staffPermissions || staffPermissions.can_manage_billing) && (
        <article className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h2 className="font-display text-lg font-bold">Pending Discount Approvals Queue</h2>
            </div>
            <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {pendingApprovals.length} Pending
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingApprovals.map((appr) => (
              <div
                key={appr.id}
                className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between text-xs border-b border-[var(--border-subtle)] pb-2">
                  <span className="font-mono font-bold text-[var(--accent-brand)]">
                    {appr.order_basket_number && appr.order_basket_number.toUpperCase().includes("WALK")
                      ? "Walk-In"
                      : `Basket #${appr.order_basket_number || "Walk-In"}`}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {parseUTCDate(appr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Requested By:</span>
                    <span className="font-bold text-[var(--text-primary)]">{appr.requested_by_name || "Cashier"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Discount Requested:</span>
                    <span className="font-bold text-emerald-600">
                      {appr.discount_type === "PERCENT"
                        ? `${appr.discount_value}% OFF`
                        : appr.discount_type === "FLAT"
                          ? `₹${appr.discount_value} OFF`
                          : "100% COMPLIMENTARY"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-muted)]">Order Total:</span>
                    <span className="font-mono font-bold">₹{appr.order_total_amount.toFixed(2)}</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Reason Note:</span>
                    <p className="text-xs italic text-[var(--text-secondary)] rounded-lg bg-[var(--bg-surface-elevated)] p-2 mt-0.5">
                      &quot;{appr.reason_note}&quot;
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => void handleResolveApproval(appr.id, true)}
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolveApproval(appr.id, false)}
                    className="flex-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* BILL HISTORY & MANAGEMENT TABLE */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-4">
        {/* Filter Tabs & Search Bar */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Main Status Buttons & More Dropdown (No scrollbar) */}
          <div className="flex items-center gap-1.5 shrink-0 relative" ref={moreFilterRef}>
            {MAIN_STATUS_TABS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setBillingStatusFilter(st)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black whitespace-nowrap transition cursor-pointer border ${
                  billingStatusFilter === st
                    ? "bg-black text-white border-black shadow-xs"
                    : "text-neutral-900 bg-white hover:bg-neutral-100 border-neutral-300 dark:border-neutral-700"
                }`}
              >
                {st}
              </button>
            ))}

            {/* More Statuses Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMoreFilterOpen((prev) => !prev);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black whitespace-nowrap transition cursor-pointer border ${
                  MORE_STATUS_TABS.includes(billingStatusFilter)
                    ? "bg-black text-white border-black shadow-xs"
                    : "text-neutral-900 bg-white hover:bg-neutral-100 border-neutral-300 dark:border-neutral-700"
                }`}
                title="Filter by more statuses"
              >
                <span>
                  {MORE_STATUS_TABS.includes(billingStatusFilter)
                    ? `More: ${billingStatusFilter.replace("_", " ")}`
                    : "More"}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${isMoreFilterOpen ? "rotate-180" : ""}`} />
              </button>

              {isMoreFilterOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 w-52 rounded-xl border border-[var(--border-strong)] bg-white dark:bg-neutral-900 py-1 shadow-2xl z-40"
                  onClick={(e) => e.stopPropagation()}
                >
                  {MORE_STATUS_TABS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setBillingStatusFilter(st);
                        setIsMoreFilterOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                        billingStatusFilter === st
                          ? "bg-black text-white"
                          : "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <span>{st.replace("_", " ")}</span>
                      {billingStatusFilter === st && <span className="text-[11px] font-black">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <div className="relative min-w-[200px] sm:min-w-[260px] flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-500" />
              <input
                id="billing-search-input"
                type="text"
                value={billingSearchQuery}
                onChange={(e) => setBillingSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const clean = billingSearchQuery.replace(/^#/, "").trim();
                    if (clean !== billingSearchQuery) {
                      setBillingSearchQuery(clean);
                    }
                  }
                }}
                placeholder="Search or scan bill"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-16 text-xs font-mono font-bold text-black dark:text-white placeholder:text-neutral-500 dark:placeholder:text-neutral-400 placeholder:font-semibold focus:border-black outline-none"
              />
              <div className="absolute right-2 top-2 flex items-center gap-1.5">
                {isSearchingServerBills && (
                  <RefreshCw className="h-3 w-3 animate-spin text-sky-400" />
                )}
                {billingSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBillingSearchQuery("")}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <span title="Barcode scanner active" className="inline-flex items-center">
                  <Barcode className="h-3.5 w-3.5 text-sky-400/80" />
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportBillsPdf}
              title={`Export ${filteredBills.length} filtered bills as PDF`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black bg-black px-3.5 py-2 text-xs font-bold text-white hover:bg-neutral-800 shadow-xs transition shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-white" />
              <span>Export PDF ({filteredBills.length})</span>
            </button>
          </div>
        </div>

        {/* Top Horizontal Scrollbar for Laptops and Zoomed-in screens */}
        {hasHorizontalOverflow && (
          <div className="flex items-center gap-2.5 px-4 py-1.5 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] font-medium">
            <span className="whitespace-nowrap shrink-0 flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
              ↔ Scroll Table:
            </span>
            <div
              ref={topScrollRef}
              onScroll={handleTopScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin"
              style={{ height: 14 }}
            >
              <div style={{ width: tableScrollWidth, height: 1 }} />
            </div>
          </div>
        )}

        {/* Bills List Table */}
        <div
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="overflow-x-auto min-h-[380px] pb-24"
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5 whitespace-nowrap">Bill ID &amp; Source</th>
                <th className="p-3.5 max-w-[170px]">Customer &amp; Basket</th>
                <th className="p-3.5 text-center whitespace-nowrap">Items</th>
                <th className="p-3.5 text-right whitespace-nowrap">Subtotal</th>
                <th className="p-3.5 text-right whitespace-nowrap">Discount</th>
                <th className="p-3.5 text-right min-w-[130px] max-w-[170px]">Grand Total</th>
                <th className="p-3.5 text-center whitespace-nowrap">Status</th>
                <th className="p-3.5 text-center whitespace-nowrap min-w-[95px]">Date &amp; Time</th>
                <th className="p-3.5 text-right whitespace-nowrap min-w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-[var(--text-muted)]">
                    {!isAdminRole && !isPunchedIn ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-3">
                          <Clock className="h-6 w-6" />
                        </div>
                        <h3 className="text-base font-bold text-[var(--text-primary)]">Shift Inactive</h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
                          Please punch in to begin your shift, create counter bills, manage the cash drawer, and process returns.
                        </p>
                        {onRequirePunchIn && (
                          <button
                            type="button"
                            onClick={onRequirePunchIn}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 transition shadow-xs cursor-pointer"
                          >
                            <Play className="h-4 w-4 fill-current" />
                            Punch In to Start Shift
                          </button>
                        )}
                      </div>
                    ) : (
                      "No bills found matching filters."
                    )}
                  </td>
                </tr>
              ) : (
                filteredBills.map((b) => (
                    <tr key={b.id} className={`hover:bg-[var(--bg-surface-elevated)]/50 transition ${b.status === "REFUNDED" ? "opacity-50" : ""}`}>
                      <td className="p-3.5 font-mono">
                        <span className="font-bold text-[var(--text-primary)]">#{b.id.slice(0, 8).toUpperCase()}</span>
                        <span className="block text-[10px] uppercase font-bold text-[var(--accent-brand)]">{b.source}</span>
                      </td>

                      <td className="p-3.5">
                        {b.customer_name ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-[15px] text-[var(--text-primary)] leading-tight">
                              {b.customer_name}
                            </span>
                            <span className="text-xs font-medium text-[var(--text-muted)] mt-0.5">
                              {b.basket_number && b.basket_number.toUpperCase().includes("WALK")
                                ? "Walk-In"
                                : `Basket #${b.basket_number || "Walk-In"}`}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-[var(--text-primary)]">
                            {b.basket_number && b.basket_number.toUpperCase().includes("WALK")
                              ? "Walk-In"
                              : `Basket #${b.basket_number || "Walk-In"}`}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-bold font-mono">{b.items?.length || 0}</td>

                      <td className="p-3.5 text-right font-mono text-base">₹{b.subtotal_amount.toFixed(2)}</td>

                      <td className="p-3.5 text-right font-mono">
                        {b.discount_type ? (
                          <span className="text-emerald-600 font-bold">
                            {b.discount_type === "PERCENT"
                              ? `-${b.discount_value}%`
                              : b.discount_type === "FLAT"
                                ? `-₹${b.discount_value}`
                                : b.discount_type === "COMPLIMENTARY_ITEMS"
                                  ? `-₹${b.discount_value}`
                                  : "FREE"}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right font-mono font-black text-base text-[var(--text-primary)] min-w-[130px] max-w-[170px]">
                        <div>₹{b.total_amount.toFixed(2)}</div>
                        {((b as any).total_refunded_amount > 0 || b.status === "PARTIALLY_REFUNDED") && !b.is_void && (
                          <div className="text-[11px] text-rose-400 font-bold mt-0.5 break-words leading-tight">
                            ↩ Refunded: -₹{Number((b as any).total_refunded_amount || 0).toFixed(2)}
                          </div>
                        )}
                        {b.status === "PARTIALLY_REFUNDED" && !b.is_void && (
                          <div className="text-[11px] text-amber-400 font-bold mt-0.5 break-words leading-tight">
                            Net: ₹{(b as any).net_amount !== undefined ? Number((b as any).net_amount).toFixed(2) : (b.total_amount - Number((b as any).total_refunded_amount || 0)).toFixed(2)}
                          </div>
                        )}
                        {(b as any).credit_applied > 0 && (
                          <div className="text-[11px] text-emerald-500 font-bold mt-0.5 break-words leading-tight">
                            Credit Used: ₹{(b as any).credit_applied}
                          </div>
                        )}
                        {Number((b as any).loyalty_discount_inr) > 0 && (
                          <div className="text-[11px] text-purple-400 font-bold mt-0.5 break-words leading-tight">
                            Loyalty: -₹{Number((b as any).loyalty_discount_inr).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).debit_applied) > 0 && (
                          <div className="text-[11px] text-red-500 font-bold mt-0.5 break-words leading-tight">
                            Debit: ₹{Number((b as any).debit_applied).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).debt_settled) > 0 && (
                          <div className="text-[11px] text-emerald-500 font-bold mt-0.5 break-words leading-tight">
                            Debt Settled (Udhaar): +₹{Number((b as any).debt_settled).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).credit_awarded) > 0 && (
                          <div className="text-[11px] text-sky-500 font-bold mt-0.5 break-words leading-tight">
                            Wallet: +₹{Number((b as any).credit_awarded).toFixed(2)}
                          </div>
                        )}
                        {Number((b as any).credit_cashed_out) > 0 && (
                          <div className="text-[11px] text-orange-400 font-bold mt-0.5 break-words leading-tight">
                            Credit Cashed Out: ₹{Number((b as any).credit_cashed_out).toFixed(2)}
                          </div>
                        )}
                        {(() => {
                          const hasModifiers = Number((b as any).credit_applied) > 0 || 
                                               Number((b as any).debit_applied) > 0 || 
                                               Number((b as any).debt_settled) > 0 || 
                                               Number((b as any).credit_awarded) > 0 || 
                                               Number((b as any).credit_cashed_out) > 0 ||
                                               Number((b as any).loyalty_discount_inr) > 0;
                          
                          if (!hasModifiers) return null;
                          
                          const billTotal = Number(b.total_amount || 0);
                          const netPaid = billTotal 
                                        - Number((b as any).loyalty_discount_inr || 0)
                                        - Number((b as any).credit_applied || 0) 
                                        - Number((b as any).debit_applied || 0) 
                                        + Number((b as any).debt_settled || 0) 
                                        + Number((b as any).credit_awarded || 0) 
                                        - Number((b as any).credit_cashed_out || 0);
                                        
                          return (
                            <div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)] text-xs text-[var(--accent-brand)] font-black">
                              <span className="bg-[var(--accent-brand)]/10 px-1.5 py-0.5 rounded-lg inline-block whitespace-nowrap">
                                NET PAID: ₹{netPaid.toFixed(2)}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${b.status === "PAID" || b.status === "SERVED" || b.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : b.discount_status === "PENDING_APPROVAL"
                              ? "bg-amber-500/10 text-amber-400 animate-pulse"
                              : b.status === "PARTIALLY_REFUNDED"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : b.is_void
                                  ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                                  : b.status === "CANCELLED" || b.status === "REFUNDED"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)]"
                            }`}
                        >
                          {b.is_void
                            ? "🚫 VOIDED (EDITED)"
                            : b.discount_status === "PENDING_APPROVAL"
                              ? "Pending Discount Approval"
                              : b.status === "PENDING"
                                ? "DRAFT"
                                : b.status === "PARTIALLY_REFUNDED"
                                  ? "PARTIALLY REFUNDED"
                                  : b.status}
                        </span>
                        {b.payment_method === "SPLIT" || (Number((b as any).cash_amount) > 0 && Number((b as any).upi_amount) > 0) ? (
                          <div className="flex flex-col items-center gap-0.5 mt-1">
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                              CASH: ₹{Number((b as any).cash_amount || 0).toFixed(2)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-400 border border-sky-500/20 whitespace-nowrap">
                              UPI: ₹{Number((b as any).upi_amount || 0).toFixed(2)}
                            </span>
                          </div>
                        ) : b.payment_method ? (
                          <span className="block text-[10px] text-neutral-900 dark:text-neutral-100 font-black font-mono uppercase mt-0.5">
                            Via {b.payment_method}
                          </span>
                        ) : null}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">
                          {b.created_at ? parseUTCDate(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 whitespace-nowrap">
                          {b.created_at ? parseUTCDate(b.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase() : ""}
                        </div>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. Edit Button */}
                          {(b.status === "PAID" || b.status === "COMPLETED") && onEditCompletedBill ? (
                            <button
                              type="button"
                              onClick={() => onEditCompletedBill(b)}
                              className="flex items-center gap-1 rounded-lg border border-black bg-black text-white hover:bg-neutral-800 px-2.5 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 shadow-xs"
                              title="Edit this completed bill (Voids old bill)"
                            >
                              <FileEdit className="h-3.5 w-3.5 text-white" />
                              <span>Edit</span>
                            </button>
                          ) : (b.status === "DRAFT" || b.status === "PENDING") && onResumeDraft ? (
                            <button
                              type="button"
                              onClick={() => onResumeDraft(b)}
                              className="flex items-center gap-1 rounded-lg border border-black bg-black text-white hover:bg-neutral-800 px-2.5 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 shadow-xs"
                              title="Resume / Edit Draft Bill"
                            >
                              <FileEdit className="h-3.5 w-3.5 text-white" />
                              <span>Edit</span>
                            </button>
                          ) : null}

                          {/* 2. View Button */}
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "view");
                            }}
                            className="p-1.5 rounded-lg border border-black bg-black text-white hover:bg-neutral-800 transition cursor-pointer shrink-0 shadow-xs"
                            title="View PDF Bill"
                          >
                            <Eye className="h-4 w-4 text-white" />
                          </button>

                          {/* 3. Direct Print Button */}
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "print");
                            }}
                            className="p-1.5 rounded-lg border border-black bg-black text-white hover:bg-neutral-800 transition cursor-pointer shrink-0 shadow-xs"
                            title="Print Bill Directly"
                          >
                            <Printer className="h-4 w-4 text-white" />
                          </button>

                          {/* 4. Direct Download Button */}
                          <button
                            type="button"
                            onClick={() => {
                              generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "download");
                            }}
                            className="p-1.5 rounded-lg border border-black bg-black text-white hover:bg-neutral-800 transition cursor-pointer shrink-0 shadow-xs"
                            title="Download Bill PDF"
                          >
                            <Download className="h-4 w-4 text-white" />
                          </button>

                          {/* 5. More Button with Dropdown Popup */}
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownBillId(activeDropdownBillId === b.id ? null : b.id);
                              }}
                              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 shadow-xs ${
                                activeDropdownBillId === b.id
                                  ? "border-black bg-neutral-800 text-white"
                                  : "border-black bg-black text-white hover:bg-neutral-800"
                              }`}
                              title="More options"
                            >
                              <span>More</span>
                              <ChevronDown className={`h-3 w-3 text-white transition-transform ${activeDropdownBillId === b.id ? "rotate-180" : ""}`} />
                            </button>

                            {/* Dropdown Popup Menu */}
                            {activeDropdownBillId === b.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-[var(--border-subtle)]"
                              >
                                <div className="py-1">
                                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    Bill Actions
                                  </div>

                                  {/* View Bill */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownBillId(null);
                                      generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "view");
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                  >
                                    <Eye className="h-4 w-4 text-sky-500 shrink-0" />
                                    <span>View Bill</span>
                                  </button>

                                  {/* Edit Bill */}
                                  {(b.status === "PAID" || b.status === "COMPLETED") && onEditCompletedBill && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownBillId(null);
                                        onEditCompletedBill(b);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                    >
                                      <FileEdit className="h-4 w-4 text-amber-500 shrink-0" />
                                      <span>Edit Bill</span>
                                    </button>
                                  )}

                                  {(b.status === "DRAFT" || b.status === "PENDING") && onResumeDraft && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownBillId(null);
                                        onResumeDraft(b);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                    >
                                      <FileEdit className="h-4 w-4 text-amber-500 shrink-0" />
                                      <span>Edit Draft Bill</span>
                                    </button>
                                  )}

                                  {/* Print Bill */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownBillId(null);
                                      generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "print");
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                  >
                                    <Printer className="h-4 w-4 text-emerald-500 shrink-0" />
                                    <span>Print Bill</span>
                                  </button>
                                </div>

                                <div className="py-1">
                                  {/* Download Bill */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownBillId(null);
                                      generateReceiptPDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "download");
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                  >
                                    <Download className="h-4 w-4 text-blue-500 shrink-0" />
                                    <span>Download Bill</span>
                                  </button>

                                  {/* Download Invoice */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveDropdownBillId(null);
                                      generateA4InvoicePDF(b as any, restaurant?.name || "RESTAURANT", menuItemsMap, restaurant || {}, "download");
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                  >
                                    <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                                    <span>Download Invoice</span>
                                  </button>
                                </div>

                                {b.status !== "PAID" && b.status !== "COMPLETED" && b.status !== "PARTIALLY_REFUNDED" && b.status !== "REFUNDED" && (
                                  <div className="py-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownBillId(null);
                                        onOpenDiscountModal(b);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition text-left cursor-pointer"
                                    >
                                      <Percent className="h-4 w-4 text-orange-500 shrink-0" />
                                      <span>Apply Discount</span>
                                    </button>
                                    {onDeleteBill && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveDropdownBillId(null);
                                          setBillToDelete(b);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition text-left cursor-pointer"
                                      >
                                        <Trash2 className="h-4 w-4 text-rose-500 shrink-0" />
                                        <span>Delete Draft</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Customer Returns & Exchanges Modal */}
      <CustomerReturnsModal
        isOpen={returnsModalOpen}
        onClose={() => setReturnsModalOpen(false)}
        billsList={billsList.filter((b) => b.status === "PAID" || b.status === "COMPLETED" || b.status === "PARTIALLY_REFUNDED")}
        menuItems={menuItems}
        onRequestReturn={handleProcessCustomerReturn}
        restaurantName={restaurant?.name || "ApnaGreen Basket"}
        restaurant={restaurant}
        initialTab={returnsInitialTab}
        startDate={computedStartDate}
        endDate={computedEndDate}
        dateRangeMode={dateRangeMode}
        isAdminRole={isAdminRole}
        isPunchedIn={isPunchedIn}
        onRequirePunchIn={onRequirePunchIn}
      />

      {/* Centered Return Success Modal */}
      <ReturnSuccessModal
        isOpen={showReturnSuccessModal}
        onClose={() => {
          setShowReturnSuccessModal(false);
          setSuccessReturnData(null);
        }}
        returnData={successReturnData}
        restaurantName={restaurant?.name || "ApnaGreen Basket"}
        restaurant={restaurant}
        menuItemsMap={menuItemsMap}
      />

      {/* Delete Bill Modal */}
      {billToDelete && onDeleteBill && (
        <DeleteBillModal
          isOpen={true}
          onClose={() => setBillToDelete(null)}
          order={billToDelete}
          onConfirm={async (id) => {
            await onDeleteBill(id);
            setBillToDelete(null);
          }}
        />
      )}

      {drawerTxModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl shadow-2xl flex flex-col h-full border border-[var(--border-strong)] relative overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--bg-surface-elevated)]">
              <div>
                <h2 className={`text-sm font-bold flex items-center gap-1.5 flex-wrap ${drawerTxType === "MANUAL_DEPOSIT" ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span>{drawerTxType === "MANUAL_DEPOSIT" ? "Add Cash to Drawer" : "Withdraw Cash from Drawer"}</span>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                    (Avl : ₹{liveDrawerData ? liveDrawerData.total_balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"})
                  </span>
                </h2>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {drawerTxType === "MANUAL_DEPOSIT" ? "Deposit morning float or additional cash" : "Withdraw cash drop for safe storage or day closing"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerTxModalOpen(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Quick Auto-Tap / Exact Actions Bar */}
              <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                    Notes Tapped:
                  </span>
                  <span className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                    kbd active (1-9)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {drawerTxType === "MANUAL_WITHDRAWAL" && (
                    <button
                      type="button"
                      onClick={handleSelectExactAll}
                      className="rounded-lg bg-rose-500/15 border border-rose-500/40 px-2.5 py-1 text-xs font-mono font-bold text-rose-400 hover:bg-rose-500/25 transition whitespace-nowrap cursor-pointer active:scale-95 flex items-center gap-1 shadow-xs"
                      title="Select all notes and coins currently in drawer to withdraw for evening closing"
                    >
                      <span>Exact ₹{liveDrawerData ? liveDrawerData.total_balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</span>
                    </button>
                  )}
                  {Object.values(drawerTxDenoms).some(c => c > 0) && (
                    <button
                      type="button"
                      onClick={() => setDrawerTxDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 })}
                      className="text-rose-400 hover:text-rose-300 font-bold text-[11px] underline cursor-pointer px-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 3x3 Grid of 9 Denominations (identical to POS Billing Process Payment) */}
              <div className="grid grid-cols-3 gap-2">
                {[500, 200, 100, 50, 20, 10, 5, 2, 1].map((d) => {
                  const count = drawerTxDenoms[d] || 0;
                  const isDeposit = drawerTxType === "MANUAL_DEPOSIT";
                  return (
                    <div
                      key={`tx-${d}`}
                      className={`relative rounded-xl flex font-mono transition font-black border-2 select-none shadow-xs ${
                        count > 0
                          ? isDeposit
                            ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                            : "border-rose-500 bg-rose-500 text-white shadow-md"
                          : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                      }`}
                    >
                      {count > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrawerTxDenoms((prev) => ({ ...prev, [d]: Math.max(0, count - 1) }));
                          }}
                          className="flex items-center justify-center px-2 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-lg cursor-pointer"
                          title={`Remove 1× ₹${d}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDrawerTxDenoms((prev) => ({ ...prev, [d]: count + 1 }))}
                        className="flex-1 py-3 px-2 text-center text-sm font-bold cursor-pointer"
                        title={`Add ₹${d} (Key: ${d === 500 ? 7 : d === 200 ? 8 : d === 100 ? 9 : d === 50 ? 4 : d === 20 ? 5 : d === 10 ? 6 : d === 5 ? 1 : d === 2 ? 2 : 3})`}
                      >
                        ₹{d}
                      </button>
                      {count > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-slate-900 text-white text-xs font-black border border-white pointer-events-none shadow-xs">
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Active Notes Breakdown Chips */}
              {Object.entries(drawerTxDenoms).filter(([_, c]) => c > 0).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">
                    Selected Breakdown:
                  </span>
                  {Object.entries(drawerTxDenoms)
                    .filter(([_, c]) => c > 0)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([denomStr, count]) => (
                      <span
                        key={denomStr}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 text-xs font-mono font-bold text-[var(--text-primary)]"
                      >
                        <span>{count}×</span>
                        <span className={drawerTxType === "MANUAL_DEPOSIT" ? "text-emerald-400" : "text-rose-400"}>₹{denomStr}</span>
                        <span className="text-[var(--text-muted)] font-normal">(=₹{Number(denomStr) * count})</span>
                      </span>
                    ))}
                </div>
              )}

              {/* Reason / Note Input */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] flex items-center justify-between">
                  <span>Reason / Note</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-normal">(Optional manual entry)</span>
                </label>
                <input
                  type="text"
                  value={drawerTxNotes}
                  onChange={(e) => setDrawerTxNotes(e.target.value)}
                  placeholder={drawerTxType === "MANUAL_DEPOSIT" ? "e.g. Morning Float, Customer change refill" : "e.g. End of day drop, Supplier cash payment"}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs focus:border-sky-500 outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
              </div>

              {/* Total Amount Summary */}
              <div className="flex justify-between items-center text-sm font-mono font-bold mt-4 pt-4 border-t border-[var(--border-subtle)]">
                <span className="text-xs uppercase font-bold text-[var(--text-secondary)]">Total Amount to {drawerTxType === "MANUAL_DEPOSIT" ? "Add" : "Withdraw"}:</span>
                <span className={`text-xl font-black ${drawerTxType === "MANUAL_DEPOSIT" ? "text-emerald-400" : "text-rose-400"}`}>
                  ₹{Object.entries(drawerTxDenoms).reduce((sum, [d, c]) => sum + Number(d)*c, 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] flex gap-2">
              <button
                type="button"
                onClick={() => setDrawerTxModalOpen(false)}
                className="w-1/3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingTx || Object.values(drawerTxDenoms).every(c => c === 0)}
                onClick={handleDrawerTxSubmit}
                className={`w-2/3 rounded-xl py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2 ${
                  drawerTxType === "MANUAL_DEPOSIT" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                {isSubmittingTx ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Submit {drawerTxType === "MANUAL_DEPOSIT" ? "Deposit" : "Withdrawal"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
