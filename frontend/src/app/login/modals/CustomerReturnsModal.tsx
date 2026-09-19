"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileText,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  UserCheck,
  UserPlus,
  Wallet,
  X,
  Clock,
  Play,
} from "lucide-react";
import type { AdminMenuItem } from "../adminTypes";
import type { ManualBill, ItemReturnLedgerResponse, ItemReturnLedgerRow } from "@/types";
import { getUnitFactor, getUnallocatedBatchStock, type DraftCartItem } from "./CreateBillDrawer";
import { generateReturnReceiptPDF } from "@/lib/pdfGenerator";
import { apiRequest , parseUTCDate} from "../adminUtils";

type DirectReturnItem = {
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
};

interface DecimalQtyInputProps {
  value: number;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  title?: string;
  onChange: (val: number) => void;
  onRemove?: () => void;
}

function DecimalQtyInput({
  value,
  min = 0,
  max,
  placeholder = "0",
  className,
  title,
  onChange,
  onRemove,
}: DecimalQtyInputProps) {
  const [text, setText] = useState<string>(value > 0 ? String(value) : "");

  useEffect(() => {
    const num = parseFloat(text);
    if (isNaN(num) && value === 0) return;
    if (num !== value) {
      setText(value > 0 ? String(value) : "");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);

    if (raw === "" || raw === ".") {
      onChange(0);
      return;
    }

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      if (max !== undefined && parsed > max) {
        setText(String(max));
        onChange(max);
      } else if (parsed >= 0) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(text);
    if (isNaN(parsed) || parsed <= (min > 0 ? 0 : -1)) {
      if (onRemove && min > 0) {
        onRemove();
      } else {
        setText(min > 0 ? String(min) : "");
        onChange(min > 0 ? min : 0);
      }
    } else {
      let clamped = parsed;
      if (max !== undefined && clamped > max) clamped = max;
      if (min !== undefined && clamped < min) clamped = min;
      const rounded = Math.round(clamped * 1000) / 1000;
      setText(String(rounded));
      onChange(rounded);
    }
  };

  return (
    <input
      type="number"
      step="any"
      min={min}
      max={max}
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
}

const DENOM_KEY_MAP: Record<number, string> = {
  500: "7",
  200: "8",
  100: "9",
  50: "4",
  20: "5",
  10: "6",
  5: "1",
  2: "2",
  1: "3",
};

const NUMPAD_DENOM_MAP: Record<string, number> = {
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

type CustomerReturnsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  billsList: ManualBill[];
  menuItems: AdminMenuItem[];
  onRequestReturn: (returnData: any) => Promise<void>;
  restaurantName?: string;
  restaurant?: any;
  initialTab?: "USER_HISTORY" | "INVOICE_NO" | "RETURN_HISTORY";
  startDate?: string;
  endDate?: string;
  dateRangeMode?: string;
  isAdminRole?: boolean;
  isPunchedIn?: boolean;
  onRequirePunchIn?: () => void;
};

export function CustomerReturnsModal({
  isOpen,
  onClose,
  billsList,
  menuItems,
  onRequestReturn,
  restaurantName = "ApnaGreen Basket",
  restaurant,
  initialTab,
  startDate,
  endDate,
  dateRangeMode,
  isAdminRole = true,
  isPunchedIn = true,
  onRequirePunchIn,
}: CustomerReturnsModalProps) {
  const [lookupTab, setLookupTab] = useState<"USER_HISTORY" | "INVOICE_NO" | "RETURN_HISTORY">(
    initialTab || "USER_HISTORY"
  );

  useEffect(() => {
    if (isOpen && initialTab) {
      setLookupTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Search queries
  const [customerSearch, setCustomerSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [serverSearchedBills, setServerSearchedBills] = useState<ManualBill[]>([]);
  const [isSearchingServerBills, setIsSearchingServerBills] = useState<boolean>(false);

  // Mode: Bill-referenced return vs Direct un-billed return
  const [returnMode, setReturnMode] = useState<"BILL_REFERENCED" | "DIRECT_UNBILLED">("BILL_REFERENCED");

  // Selected Bill for bill-referenced return
  const [selectedBill, setSelectedBill] = useState<ManualBill | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Return quantities for bill items: item_id -> quantity to return
  const [returnItemsMap, setReturnItemsMap] = useState<Record<string, number>>({});
  const [returnItemsUnitMap, setReturnItemsUnitMap] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("DEFECTIVE_PRODUCT");

  // Direct return items (when customer has no original bill)
  const [directReturnItems, setDirectReturnItems] = useState<DirectReturnItem[]>([]);
  const [directCustomerName, setDirectCustomerName] = useState("");
  const [directCustomerPhone, setDirectCustomerPhone] = useState("");

  // Exchange items to add
  const [exchangeItems, setExchangeItems] = useState<DraftCartItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<"CASH" | "UPI" | "STORE_CREDIT">("CASH");

  // Cash Denominations for refund (Given to Customer)
  const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const [refundCashDenoms, setRefundCashDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });
  
  // Cash Denominations Inward (Received from Customer)
  const [inwardCashDenoms, setInwardCashDenoms] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });

  // Active Cash Deck for Numpad Tapping & Spacebar Switching
  const [activeCashDeck, setActiveCashDeck] = useState<"OUTWARD" | "INWARD">("OUTWARD");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const outwardDeckRef = useRef<HTMLDivElement>(null);
  const inwardDeckRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const cashSectionRef = useRef<HTMLDivElement>(null);

  // Smoothly slide the scrollable container so the cash selection deck is positioned on screen
  const scrollToCashDeck = (deck?: "OUTWARD" | "INWARD") => {
    const active = deck || activeCashDeck;
    const target = active === "OUTWARD" ? outwardDeckRef.current : inwardDeckRef.current;
    const container = rightScrollRef.current;

    if (container && (target || cashSectionRef.current)) {
      const el = target || cashSectionRef.current!;
      const targetRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if target is already comfortably visible in the viewport
      const isComfortablyVisible =
        targetRect.top >= containerRect.top + 10 &&
        targetRect.bottom <= containerRect.bottom - 10;

      if (!isComfortablyVisible) {
        const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
        // Scroll so the top of the cash deck sits neatly 12px below the container top
        const targetScroll = Math.max(0, relativeTop - 12);
        container.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
    } else if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Wallet / Analytics State
  const [customerAnalytics, setCustomerAnalytics] = useState<any>(null);
  const [customerPhoneOverride, setCustomerPhoneOverride] = useState("");
  const [customerNameOverride, setCustomerNameOverride] = useState("");
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const lastPhonePromptCloseTime = useRef<number>(0);

  // Customer Dynamic Suggestions State
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; phone: string; gstin?: string; credit_balance?: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  const [autoConvertCredit, setAutoConvertCredit] = useState(false);
  const [autoRecordDebitOnShortfall, setAutoRecordDebitOnShortfall] = useState(false);
  const [autoRecordExtraChangeAsDebt, setAutoRecordExtraChangeAsDebt] = useState(false);
  const [settleDebit, setSettleDebit] = useState(false);
  const [applyCreditAmount, setApplyCreditAmount] = useState("");
  const [creditCashedOut, setCreditCashedOut] = useState("");

  // Round off toggle state
  const [isRoundOffActive, setIsRoundOffActive] = useState(false);

  // Exchange items autocomplete & search
  const [showExchangeSection, setShowExchangeSection] = useState(false);
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState("");
  const [showExchangePicker, setShowExchangePicker] = useState(false);
  const exchangePickerRef = React.useRef<HTMLDivElement>(null);
  const [localCatalogItems, setLocalCatalogItems] = useState<AdminMenuItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [exchangeNotice, setExchangeNotice] = useState<string | null>(null);

  // Auto-dismiss exchangeNotice after 4.5 seconds
  useEffect(() => {
    if (!exchangeNotice) return;
    const timer = setTimeout(() => {
      setExchangeNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [exchangeNotice]);

  const handleRefundDenomChange = (denom: number, change: number) => {
    setError(null);
    if (change > 0) {
      scrollToCashDeck("OUTWARD");
    }
    setRefundCashDenoms(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + change);
      return { ...prev, [denom]: next };
    });
  };

  const handleInwardDenomChange = (denom: number, change: number) => {
    setError(null);
    if (change > 0) {
      scrollToCashDeck("INWARD");
    }
    setInwardCashDenoms(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + change);
      return { ...prev, [denom]: next };
    });
  };

  const refundDenomTotal = Object.entries(refundCashDenoms).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);
  const inwardDenomTotal = Object.entries(inwardCashDenoms).reduce((acc, [denom, count]) => acc + (Number(denom) * count), 0);

  // Return bills history state
  const [returnsHistoryList, setReturnsHistoryList] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const vouchersSummary = useMemo(() => {
    if (!isAdminRole && !isPunchedIn) {
      return {
        voucherCount: 0,
        grossReturns: 0,
        totalExchanges: 0,
        netBalance: 0,
        netCreditDebit: 0,
        creditApplied: 0,
        debitApplied: 0,
        debtSettled: 0,
        creditAwarded: 0,
        creditCashedOut: 0,
      };
    }
    let grossReturns = 0;
    let totalExchanges = 0;
    let creditApplied = 0;
    let debitApplied = 0;
    let debtSettled = 0;
    let creditAwarded = 0;
    let creditCashedOut = 0;

    (returnsHistoryList || []).forEach((r) => {
      const gRet = Number(r.gross_return_amount || 0) || (Number(r.total_refund_amount || 0) + Number(r.total_exchange_amount || 0));
      const exAmt = Number(r.total_exchange_amount || 0);
      grossReturns += gRet;
      totalExchanges += exAmt;

      creditApplied += Number(r.credit_applied || 0);
      debitApplied += Number(r.debit_applied || 0);
      debtSettled += Number(r.debt_settled || 0);
      creditAwarded += Number(r.credit_awarded || 0);
      creditCashedOut += Number(r.credit_cashed_out || 0);
    });

    const netBalance = grossReturns - totalExchanges;
    const netCreditDebit = debtSettled + creditAwarded - creditApplied - debitApplied - creditCashedOut;

    return {
      voucherCount: returnsHistoryList.length,
      grossReturns,
      totalExchanges,
      netBalance,
      netCreditDebit,
      creditApplied,
      debitApplied,
      debtSettled,
      creditAwarded,
      creditCashedOut,
    };
  }, [returnsHistoryList, isAdminRole, isPunchedIn]);

  // Item-level return ledger state
  const [historyViewMode, setHistoryViewMode] = useState<"ITEM_LEDGER" | "VOUCHERS">("ITEM_LEDGER");
  const [itemLedgerData, setItemLedgerData] = useState<ItemReturnLedgerResponse | null>(null);
  const [itemLedgerSearch, setItemLedgerSearch] = useState("");
  const [itemLedgerReason, setItemLedgerReason] = useState("ALL");
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  const activeCatalog = useMemo(() => {
    return (menuItems && menuItems.length > 0) ? menuItems : localCatalogItems;
  }, [menuItems, localCatalogItems]);

  const menuItemsMap = useMemo(() => {
    const map: Record<string, any> = {};
    (activeCatalog || []).forEach((m) => {
      map[m.id] = m;
    });
    return map;
  }, [activeCatalog]);

  // Customer linkage resolution
  const effectiveCustomerPhone = useMemo(() => {
    if (returnMode === "BILL_REFERENCED") {
      return customerPhoneOverride.trim();
    }
    return directCustomerPhone.trim();
  }, [returnMode, customerPhoneOverride, directCustomerPhone]);

  const effectiveCustomerName = useMemo(() => {
    if (returnMode === "BILL_REFERENCED") {
      return customerNameOverride.trim();
    }
    return directCustomerName.trim();
  }, [returnMode, customerNameOverride, directCustomerName]);

  const isCustomerLinked = useMemo(() => {
    const clean = effectiveCustomerPhone.replace(/\D/g, "");
    return clean.length >= 10;
  }, [effectiveCustomerPhone]);

  // Calculate return credit total (Bill-referenced vs Direct unbilled)
  const returnCreditTotal = returnMode === "BILL_REFERENCED" && selectedBill
    ? (selectedBill.items || []).reduce((sum: number, item: any) => {
        const qty = returnItemsMap[item.id] || 0;
        if (qty <= 0) return sum;
        const billedPrice = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
        const origMenuItem = item.menu_item_id
          ? menuItemsMap[item.menu_item_id]
          : (activeCatalog || []).find((m: any) => m.name?.toLowerCase() === item.item_name?.toLowerCase());
        const billedUnit = item.selected_unit || origMenuItem?.unit_label || "piece";
        const currentUnit = returnItemsUnitMap[item.id] || billedUnit;
        const billedFactor = getUnitFactor(origMenuItem, billedUnit);
        const currentFactor = getUnitFactor(origMenuItem, currentUnit);
        const factorRatio = (billedFactor > 0 && currentFactor > 0) ? (currentFactor / billedFactor) : 1;
        const effectiveUnitPrice = factorRatio > 0 ? billedPrice / factorRatio : billedPrice;
        return sum + qty * effectiveUnitPrice;
      }, 0)
    : directReturnItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Calculate exchange items total
  const exchangeItemsTotal = exchangeItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

  // Net payable / refundable
  const netBalance = exchangeItemsTotal - returnCreditTotal;
  const isNetRefund = netBalance < 0;
  const rawRefundOwed = isNetRefund ? Math.abs(netBalance) : 0;
  const rawAdditionalPayable = netBalance > 0 ? netBalance : 0;

  // Check if a return bill is actively being processed
  const isProcessingReturn = Boolean(
    lookupTab !== "RETURN_HISTORY" && (
      (returnMode === "BILL_REFERENCED" && selectedBill) ||
      (returnMode === "DIRECT_UNBILLED" && directReturnItems.length > 0) ||
      returnCreditTotal > 0 ||
      exchangeItemsTotal > 0
    )
  );

  // Debt settled when Mart owes customer refund (Net Refund)
  const refundDebtToSettle = useMemo(() => {
    if (!isNetRefund || !settleDebit || !customerAnalytics || !customerAnalytics.credit_balance || customerAnalytics.credit_balance >= 0) {
      return 0;
    }
    const debt = Math.abs(customerAnalytics.credit_balance);
    return Math.min(rawRefundOwed, debt);
  }, [isNetRefund, settleDebit, customerAnalytics, rawRefundOwed]);

  // Debt added when customer owes Mart money on Exchange (Net Payable)
  const payableDebtToAdd = useMemo(() => {
    if (netBalance <= 0 || !settleDebit || !customerAnalytics || !customerAnalytics.credit_balance || customerAnalytics.credit_balance >= 0) {
      return 0;
    }
    return Math.abs(customerAnalytics.credit_balance);
  }, [netBalance, settleDebit, customerAnalytics]);

  // Store credit applied towards Exchange payable
  const appliedCredit = useMemo(() => {
    if (netBalance <= 0) return 0;
    const val = parseFloat(applyCreditAmount) || 0;
    const maxCredit = customerAnalytics && customerAnalytics.credit_balance > 0 ? customerAnalytics.credit_balance : 0;
    return Math.min(val, rawAdditionalPayable, maxCredit);
  }, [netBalance, applyCreditAmount, customerAnalytics, rawAdditionalPayable]);

  // Store credit cashed out during return
  const cashedOutCredit = useMemo(() => {
    const val = parseFloat(creditCashedOut) || 0;
    const maxCredit = customerAnalytics && customerAnalytics.credit_balance > 0 ? customerAnalytics.credit_balance : 0;
    return Math.min(val, maxCredit);
  }, [creditCashedOut, customerAnalytics]);

  // Effective target cash to pay OUTWARD to customer
  const targetRefundAmt = useMemo(() => {
    if (refundMethod !== "CASH") return 0;
    let base = 0;
    if (isNetRefund) {
      base = Math.max(0, rawRefundOwed - refundDebtToSettle) + cashedOutCredit;
    } else {
      base = cashedOutCredit;
    }
    if (isRoundOffActive && base > 0) {
      return Math.round(base);
    }
    return base;
  }, [refundMethod, isNetRefund, rawRefundOwed, refundDebtToSettle, cashedOutCredit, isRoundOffActive]);

  // Effective target cash to receive INWARD from customer (for Exchange payable)
  const targetCollectionAmt = useMemo(() => {
    if (refundMethod !== "CASH" || isNetRefund) return 0;
    const base = Math.max(0, rawAdditionalPayable - appliedCredit) + payableDebtToAdd;
    if (isRoundOffActive && base > 0) {
      return Math.round(base);
    }
    return base;
  }, [refundMethod, isNetRefund, rawAdditionalPayable, appliedCredit, payableDebtToAdd, isRoundOffActive]);

  // Round off computation helpers
  const baseOutward = isNetRefund ? Math.max(0, rawRefundOwed - refundDebtToSettle) + cashedOutCredit : cashedOutCredit;
  const hasDecimalOutward = baseOutward > 0 && Math.abs(Math.round(baseOutward) - baseOutward) > 0.001;
  const roundedTargetOutward = Math.round(baseOutward);
  const diffOutward = roundedTargetOutward - baseOutward;
  const deltaLabelOutward = `${diffOutward >= 0 ? "+" : ""}₹${diffOutward.toFixed(2)}`;

  const baseInward = (!isNetRefund) ? Math.max(0, rawAdditionalPayable - appliedCredit) + payableDebtToAdd : 0;
  const hasDecimalInward = baseInward > 0 && Math.abs(Math.round(baseInward) - baseInward) > 0.001;
  const roundedTargetInward = Math.round(baseInward);
  const diffInward = roundedTargetInward - baseInward;
  const deltaLabelInward = `${diffInward >= 0 ? "+" : ""}₹${diffInward.toFixed(2)}`;

  const hasDecimal = isNetRefund ? hasDecimalOutward : hasDecimalInward;
  const activeRoundOff = isRoundOffActive ? (isNetRefund ? diffOutward : diffInward) : 0;

  const currentNetRefundGiven = refundDenomTotal - inwardDenomTotal;
  const currentNetCashReceived = inwardDenomTotal - refundDenomTotal;

  const remainingNeededOutward = useMemo(() => {
    if (isNetRefund) {
      return Math.max(0, targetRefundAmt - currentNetRefundGiven);
    }
    return Math.max(0, currentNetCashReceived - targetCollectionAmt);
  }, [isNetRefund, targetRefundAmt, currentNetRefundGiven, currentNetCashReceived, targetCollectionAmt]);

  const remainingNeededInward = useMemo(() => {
    if (!isNetRefund) {
      return Math.max(0, targetCollectionAmt - currentNetCashReceived);
    }
    return Math.max(0, currentNetRefundGiven - targetRefundAmt);
  }, [isNetRefund, targetCollectionAmt, currentNetCashReceived, currentNetRefundGiven, targetRefundAmt]);

  const smartHighlightedDenoms = useMemo(() => {
    if (remainingNeededOutward <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    const denomsAbove = [...DENOMINATIONS].reverse().filter((d) => d > remainingNeededOutward);

    DENOMINATIONS.forEach((d) => {
      if (d <= remainingNeededOutward) highlighted.add(d);
    });

    denomsAbove.slice(0, 2).forEach((d) => {
      if (refundDenomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (currentNetRefundGiven + d) - targetRefundAmt;
        if (resultingChange < refundDenomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [remainingNeededOutward, currentNetRefundGiven, targetRefundAmt, refundDenomTotal]);

  const smartHighlightedInwardDenoms = useMemo(() => {
    const target = !isNetRefund ? remainingNeededInward : remainingNeededInward;
    if (target <= 0) return new Set<number>();

    const highlighted = new Set<number>();
    const denomsAbove = [...DENOMINATIONS].reverse().filter((d) => d > target);

    DENOMINATIONS.forEach((d) => {
      if (d <= target) highlighted.add(d);
    });

    denomsAbove.slice(0, 2).forEach((d) => {
      if (inwardDenomTotal === 0) {
        highlighted.add(d);
      } else {
        const resultingChange = (inwardDenomTotal + d) - target;
        if (resultingChange < inwardDenomTotal) {
          highlighted.add(d);
        }
      }
    });

    return highlighted;
  }, [isNetRefund, remainingNeededInward, inwardDenomTotal]);

  const smallestSingleNoteForOutward = useMemo(() => {
    return [...DENOMINATIONS].reverse().find((d) => d >= targetRefundAmt) || null;
  }, [targetRefundAmt]);

  const smallestSingleNoteForInward = useMemo(() => {
    const target = !isNetRefund ? targetCollectionAmt : remainingNeededInward;
    return [...DENOMINATIONS].reverse().find((d) => d >= target) || null;
  }, [isNetRefund, targetCollectionAmt, remainingNeededInward]);

  const netSatisfactionStatus = useMemo(() => {
    if (returnCreditTotal <= 0) {
      return { isSatisfied: false, reason: "NO_ITEMS", label: "Select items to return" };
    }
    if (returnMode === "BILL_REFERENCED" && !selectedBill) {
      return { isSatisfied: false, reason: "NO_BILL", label: "Select invoice" };
    }
    if (returnMode === "DIRECT_UNBILLED" && directReturnItems.length === 0) {
      return { isSatisfied: false, reason: "NO_ITEMS", label: "Add items for direct return" };
    }

    const hasCreditDebitEngaged = 
      refundMethod === "STORE_CREDIT" ||
      settleDebit ||
      autoConvertCredit ||
      autoRecordDebitOnShortfall ||
      autoRecordExtraChangeAsDebt ||
      parseFloat(applyCreditAmount || "0") > 0 ||
      parseFloat(creditCashedOut || "0") > 0;

    if (hasCreditDebitEngaged && !isCustomerLinked) {
      return { isSatisfied: false, reason: "NEED_PHONE", label: "Link customer mobile for credit / udhaar" };
    }

    if (refundMethod === "STORE_CREDIT") {
      return { isSatisfied: true, reason: "STORE_CREDIT", label: `Store Credit: ₹${rawRefundOwed.toFixed(2)}` };
    }

    if (refundMethod === "UPI") {
      return { isSatisfied: true, reason: "UPI", label: `UPI: ₹${(isNetRefund ? targetRefundAmt : targetCollectionAmt).toFixed(2)}` };
    }

    if (refundMethod === "CASH") {
      if (isNetRefund) {
        const netCashGiven = refundDenomTotal - inwardDenomTotal;
        const diff = Math.round((netCashGiven - targetRefundAmt) * 100) / 100;
        if (Math.abs(diff) < 0.005) {
          return { isSatisfied: true, reason: "EXACT_CASH", label: `Exact Change Dispensed: ₹${targetRefundAmt.toFixed(2)}` };
        }
        if (diff < 0) {
          if (autoConvertCredit && isCustomerLinked) {
            return { isSatisfied: true, reason: "BALANCED_CREDIT", label: `₹${netCashGiven.toFixed(2)} cash + ₹${Math.abs(diff).toFixed(2)} store credit` };
          }
          return { isSatisfied: false, reason: "CASH_SHORT", diff: Math.abs(diff), label: `Short by ₹${Math.abs(diff).toFixed(2)}` };
        }
        if (diff > 0) {
          if (autoRecordExtraChangeAsDebt && isCustomerLinked) {
            return { isSatisfied: true, reason: "BALANCED_DEBT", label: `₹${netCashGiven.toFixed(2)} cash (₹${diff.toFixed(2)} extra as debt)` };
          }
          return { isSatisfied: false, reason: "CASH_EXTRA", diff, label: `Extra ₹${diff.toFixed(2)} cash given` };
        }
      } else {
        // Exchange - Net Payable by Customer
        const netCashPaid = inwardDenomTotal - refundDenomTotal;
        const diff = Math.round((netCashPaid - targetCollectionAmt) * 100) / 100;
        if (targetCollectionAmt <= 0 || Math.abs(diff) < 0.005) {
          return { isSatisfied: true, reason: "EXACT_CASH", label: `Exact Cash Received: ₹${targetCollectionAmt.toFixed(2)}` };
        }
        if (diff < 0) {
          if (autoRecordDebitOnShortfall && isCustomerLinked) {
            return { isSatisfied: true, reason: "BALANCED_DEBT", label: `₹${netCashPaid.toFixed(2)} cash + ₹${Math.abs(diff).toFixed(2)} debt` };
          }
          return { isSatisfied: false, reason: "CASH_SHORT", diff: Math.abs(diff), label: `Short by ₹${Math.abs(diff).toFixed(2)}` };
        }
        if (diff > 0) {
          if ((autoConvertCredit || settleDebit) && isCustomerLinked) {
            return { isSatisfied: true, reason: "BALANCED_CREDIT", label: `₹${netCashPaid.toFixed(2)} cash (₹${diff.toFixed(2)} extra handled)` };
          }
          return { isSatisfied: false, reason: "CASH_EXTRA", diff, label: `Customer paid ₹${diff.toFixed(2)} extra` };
        }
      }
    }

    return { isSatisfied: true, reason: "DEFAULT", label: "Ready" };
  }, [
    returnCreditTotal,
    returnMode,
    selectedBill,
    directReturnItems.length,
    refundMethod,
    isCustomerLinked,
    isNetRefund,
    refundDenomTotal,
    inwardDenomTotal,
    targetRefundAmt,
    targetCollectionAmt,
    autoConvertCredit,
    autoRecordExtraChangeAsDebt,
    autoRecordDebitOnShortfall,
    settleDebit,
    applyCreditAmount,
    creditCashedOut,
    rawRefundOwed,
  ]);

  const handleAutoTapOutwardExact = (targetAmount: number) => {
    scrollToCashDeck("OUTWARD");
    let rem = Math.floor(targetAmount);
    const newCounts: Record<number, number> = {
      500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
    };
    for (const d of DENOMINATIONS) {
      if (rem >= d) {
        const cnt = Math.floor(rem / d);
        newCounts[d] = cnt;
        rem %= d;
      }
    }
    setRefundCashDenoms(newCounts);
  };

  const handleAutoTapInwardExact = (targetAmount: number) => {
    scrollToCashDeck("INWARD");
    let rem = Math.floor(targetAmount);
    const newCounts: Record<number, number> = {
      500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
    };
    for (const d of DENOMINATIONS) {
      if (rem >= d) {
        const cnt = Math.floor(rem / d);
        newCounts[d] = cnt;
        rem %= d;
      }
    }
    setInwardCashDenoms(newCounts);
  };

  const handleResetOutwardNotes = () => {
    setError(null);
    setRefundCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
  };

  const handleResetInwardNotes = () => {
    setError(null);
    setInwardCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
  };

  const activeOutwardNotesList = useMemo(() => {
    return Object.entries(refundCashDenoms).filter(([_, count]) => count > 0);
  }, [refundCashDenoms]);

  const activeInwardNotesList = useMemo(() => {
    return Object.entries(inwardCashDenoms).filter(([_, count]) => count > 0);
  }, [inwardCashDenoms]);

  const fetchCustomerAnalytics = async (phone: string) => {
    try {
      const data = await apiRequest<any>(`/api/admin/customers/analytics?phone=${phone}&period=all_time`);
      setCustomerAnalytics(data || null);
    } catch (err) {
      console.error("Error fetching customer analytics:", err);
      setCustomerAnalytics(null);
    }
  };

  // Search existing customers dynamically & auto-fetch analytics
  const handlePhoneInputChange = async (val: string) => {
    const clean = val.replace(/\D/g, "");
    setCustomerPhoneOverride(clean);
    setHighlightedSuggestionIndex(-1);

    if (clean.length === 10) {
      void fetchCustomerAnalytics(clean);
    }

    if (clean.trim().length >= 2) {
      try {
        const data = await apiRequest<any>(
          `/api/admin/customers?search=${encodeURIComponent(clean.trim())}&page=1&page_size=50`
        );
        setCustomerSuggestions(data?.items || data || []);
        setShowSuggestions(true);
      } catch {
        setCustomerSuggestions([]);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSaveAndLinkCustomer = () => {
    const clean = customerPhoneOverride.replace(/\D/g, "");
    if (clean.length >= 10) {
      void fetchCustomerAnalytics(clean);
      lastPhonePromptCloseTime.current = Date.now();
      setShowPhonePrompt(false);
      setError(null);
    }
  };

  const handleSelectCustomerSuggestion = (s: { name: string; phone: string }) => {
    setCustomerPhoneOverride(s.phone);
    if (s.name) setCustomerNameOverride(s.name);
    setShowSuggestions(false);
    setHighlightedSuggestionIndex(-1);
    if (showPhonePrompt) {
      lastPhonePromptCloseTime.current = Date.now();
      setShowPhonePrompt(false);
      setError(null);
    }
    void fetchCustomerAnalytics(s.phone);
  };

  // Synchronize customer phone and name overrides when selectedBill changes
  useEffect(() => {
    if (selectedBill) {
      setCustomerPhoneOverride(selectedBill.customer_phone || "");
      setCustomerNameOverride(selectedBill.customer_name || "");
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
    }
  }, [selectedBill?.id]);

  // Click outside to close suggestion and exchange dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (exchangePickerRef.current && !exchangePickerRef.current.contains(e.target as Node)) {
        setShowExchangePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const cleanPhone = effectiveCustomerPhone.replace(/\D/g, "");
    if (cleanPhone.length >= 10) {
      void fetchCustomerAnalytics(cleanPhone);
    } else {
      setCustomerAnalytics(null);
    }
  }, [isOpen, effectiveCustomerPhone]);

  // Active Date Filter Label
  const activeDateFilterLabel = useMemo(() => {
    if (dateRangeMode === "today") return "Today Only";
    if (dateRangeMode === "yesterday") return "Yesterday";
    if (dateRangeMode === "last2days") return "Last 2 Days";
    if (dateRangeMode === "week") return "This Week";
    if (dateRangeMode === "last7" || (dateRangeMode as string) === "last_7") return "Last 7 Days";
    if (dateRangeMode === "this_month" || (dateRangeMode as string) === "thisMonth") return "This Month";
    if (dateRangeMode === "last30" || (dateRangeMode as string) === "last_30") return "Last 30 Days";
    if (startDate && endDate) {
      return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    }
    return "Active Period";
  }, [dateRangeMode, startDate, endDate]);

  // Universal 30-Day Bounded Bill Search Fallback (Industry Standard Limit 50)
  useEffect(() => {
    if (!isOpen) {
      setServerSearchedBills([]);
      return;
    }
    const query = lookupTab === "INVOICE_NO" ? invoiceSearch.trim() : customerSearch.trim();
    if (query.length < 2) {
      setServerSearchedBills([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingServerBills(true);
      try {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const sDate = thirtyDaysAgo.toISOString().slice(0, 10);
        const eDate = today.toISOString().slice(0, 10);

        const data = await apiRequest<ManualBill[]>(
          `/api/billing/bills?search=${encodeURIComponent(query)}&start_date=${sDate}&end_date=${eDate}&status=PAID,COMPLETED,PARTIALLY_REFUNDED&limit=50`
        );
        if (Array.isArray(data)) {
          setServerSearchedBills(data);
        }
      } catch (err) {
        console.error("Error searching past 30 days bills:", err);
      } finally {
        setIsSearchingServerBills(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen, lookupTab, customerSearch, invoiceSearch]);

  // Fetch return bills history when modal opens, and item-level ledger when tab 3 (Return Log) is opened
  useEffect(() => {
    if (isOpen) {
      if (!isAdminRole && !isPunchedIn) {
        setReturnsHistoryList([]);
        return;
      }
      void fetchReturnsHistory();
    }
  }, [isOpen, startDate, endDate, isAdminRole, isPunchedIn]);

  useEffect(() => {
    if (isOpen && lookupTab === "RETURN_HISTORY") {
      if (!isAdminRole && !isPunchedIn) {
        setReturnsHistoryList([]);
        setItemLedgerData(null);
        return;
      }
      void fetchReturnsHistory();
      void fetchItemLedger();
    }
  }, [isOpen, lookupTab, startDate, endDate, isAdminRole, isPunchedIn]);

  // Self-healing catalog fetch: Ensure exchange items are always available even if prop is empty
  useEffect(() => {
    if (!isOpen) return;
    if ((!menuItems || menuItems.length === 0) && localCatalogItems.length === 0) {
      setIsLoadingCatalog(true);
      apiRequest<any>("/api/admin/menu-items?page=1&page_size=500")
        .then((res) => {
          const items = res.items !== undefined ? res.items : res;
          if (Array.isArray(items)) setLocalCatalogItems(items);
        })
        .catch((err) => console.error("Error fetching catalog for exchange:", err))
        .finally(() => setIsLoadingCatalog(false));
    }
  }, [isOpen, menuItems, localCatalogItems.length]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedBill(null);
      setReturnItemsMap({});
      setReturnItemsUnitMap({});
      setReturnReason("DEFECTIVE_PRODUCT");
      setRefundMethod("CASH");
      setRefundCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setInwardCashDenoms({ 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
      setDirectReturnItems([]);
      setDirectCustomerName("");
      setDirectCustomerPhone("");
      setCustomerPhoneOverride("");
      setCustomerNameOverride("");
      setShowPhonePrompt(false);
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      setCustomerAnalytics(null);
      setAutoConvertCredit(false);
      setAutoRecordDebitOnShortfall(false);
      setAutoRecordExtraChangeAsDebt(false);
      setSettleDebit(false);
      setApplyCreditAmount("");
      setCreditCashedOut("");
      setExchangeItems([]);
      setExchangeNotice(null);
      setIsRoundOffActive(false);
      setExchangeSearchQuery("");
      setShowExchangePicker(false);
      setShowExchangeSection(false);
      setCustomerSearch("");
      setInvoiceSearch("");
      setServerSearchedBills([]);
      setIsSearchingServerBills(false);
      setLookupTab("USER_HISTORY");
      setError(null);
      setActiveCashDeck("OUTWARD");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Sync initial active deck based on whether Mart owes customer refund or customer owes for exchange
  useEffect(() => {
    if (isOpen) {
      setActiveCashDeck(isNetRefund ? "OUTWARD" : "INWARD");
    }
  }, [isOpen, isNetRefund]);

  const fetchReturnsHistory = async () => {
    if (!isAdminRole && !isPunchedIn) {
      setReturnsHistoryList([]);
      return;
    }
    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const qs = params.toString();
      const url = qs ? `/api/billing/returns?${qs}` : "/api/billing/returns";
      const data = await apiRequest<any[]>(url);
      setReturnsHistoryList(data || []);
    } catch (err) {
      console.error("Error loading returns history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchItemLedger = async (searchQuery = itemLedgerSearch, reasonFilter = itemLedgerReason) => {
    if (!isAdminRole && !isPunchedIn) {
      setItemLedgerData(null);
      return;
    }
    setIsLoadingLedger(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (reasonFilter && reasonFilter !== "ALL") params.set("reason", reasonFilter);
      if (startDate) params.set("from_date", startDate);
      if (endDate) params.set("to_date", endDate);
      params.set("page_size", "200");
      const data = await apiRequest<ItemReturnLedgerResponse>(`/api/billing/returns/item-ledger?${params.toString()}`);
      setItemLedgerData(data);
    } catch (err) {
      console.error("Error loading item ledger:", err);
      setItemLedgerData(null);
    } finally {
      setIsLoadingLedger(false);
    }
  };

  const handleExportLedgerCsv = async () => {
    setIsLoadingLedger(true);
    try {
      const params = new URLSearchParams();
      if (itemLedgerSearch.trim()) params.set("search", itemLedgerSearch.trim());
      if (itemLedgerReason && itemLedgerReason !== "ALL") params.set("reason", itemLedgerReason);
      if (startDate) params.set("from_date", startDate);
      if (endDate) params.set("to_date", endDate);
      params.set("export", "csv");

      const token = typeof window !== "undefined" ? window.localStorage.getItem("agb_access_token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/billing/returns/item-ledger?${params.toString()}`, { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `returned_items_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn("Backend CSV export fetch failed, falling back to formatted client-side export:", err);
    } finally {
      setIsLoadingLedger(false);
    }

    // Client-side formatted CSV fallback with strict RFC-4180 escaping and Excel number formatting
    if (itemLedgerData && itemLedgerData.items.length > 0) {
      const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;
      const formatCsvDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return '""';
        const d = parseUTCDate(dateStr);
        if (isNaN(d.getTime())) return escapeCsv(dateStr);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `"${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}"`;
      };
      const formatExcelText = (val: string | null | undefined) => {
        if (!val) return '""';
        return `="` + String(val).replace(/"/g, '""') + `"`;
      };

      const headers = [
        "Return Number",
        "Return Date",
        "Original Bill",
        "Customer Name",
        "Customer Phone",
        "Item Name",
        "Category",
        "Barcode",
        "Quantity",
        "Unit",
        "Unit Price",
        "MRP",
        "Line Refund (INR)",
        "Reason",
        "Payment Method",
        "Is Exchange"
      ];
      const rows = itemLedgerData.items.map((r) => [
        escapeCsv(r.return_number),
        formatCsvDate(r.return_date),
        escapeCsv(r.original_bill_number),
        escapeCsv(r.customer_name || "Walk-In"),
        formatExcelText(r.customer_phone),
        escapeCsv(r.item_name),
        escapeCsv(r.category_name || ""),
        formatExcelText(r.barcode),
        r.quantity,
        escapeCsv(r.selected_unit || ""),
        r.unit_price.toFixed(2),
        r.mrp ? r.mrp.toFixed(2) : "",
        r.line_refund.toFixed(2),
        escapeCsv(r.reason),
        escapeCsv(r.refund_payment_method),
        r.is_exchange ? "YES" : "NO"
      ]);
      const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `returned_items_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Merge active date bills with 30-day server-searched bills (deduplicating by ID)
  const combinedBills = useMemo(() => {
    const map = new Map<string, ManualBill>();
    (billsList || []).forEach((b) => map.set(b.id, b));
    serverSearchedBills.forEach((b) => {
      if (!map.has(b.id)) map.set(b.id, b);
    });
    return Array.from(map.values());
  }, [billsList, serverSearchedBills]);

  // Filter bills by customer search
  const filteredUserBills = useMemo(() => {
    return (combinedBills || []).filter((b) => {
      if (!customerSearch.trim()) return true;
      const q = customerSearch.toLowerCase();
      return (
        (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
        (b.customer_phone && b.customer_phone.includes(q)) ||
        b.id.toLowerCase().includes(q) ||
        (b.basket_number && b.basket_number.toLowerCase().includes(q))
      );
    });
  }, [combinedBills, customerSearch]);

  // Filter bill by invoice ID
  const matchingInvoiceBill = useMemo(() => {
    if (!invoiceSearch.trim()) return false;
    const q = invoiceSearch.toLowerCase().trim();
    return (combinedBills || []).find((b) => {
      return b.id.toLowerCase().includes(q) || (b.basket_number && b.basket_number.toLowerCase().includes(q));
    });
  }, [combinedBills, invoiceSearch]);

  // Exchange Items Autocomplete Filter
  const exchangeFilteredMenuItems = useMemo(() => {
    if (!exchangeSearchQuery.trim()) {
      return (activeCatalog || []).slice(0, 8);
    }
    const q = exchangeSearchQuery.toLowerCase().trim();
    return (activeCatalog || [])
      .filter((m) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.barcode && m.barcode.toLowerCase().includes(q)) ||
        ((m as any).category_name && (m as any).category_name.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [activeCatalog, exchangeSearchQuery]);

  /**
   * Deterministic FIFO Batch Allocation for Customer Exchanges:
   * When an exchange item quantity is updated, distribute the requested quantity
   * across available active batches in strict FIFO order (oldest first).
   * - Each batch is filled to its maximum capacity.
   * - The next batch takes only the remaining excess in a new line.
   * - Reduces or removes subsequent batches when quantity decreases.
   */
  const handleExchangeItemQuantityChange = (cartIdx: number, newQty: number) => {
    const ci = exchangeItems[cartIdx];
    if (!ci) return;

    const orig = (activeCatalog || []).find((m) => m.id === ci.menu_item_id);
    const activeBatches = orig?.active_batches || [];

    // Case 1: Quantity <= 0 -> Remove this line
    if (newQty <= 0) {
      setExchangeItems((prev) => prev.filter((_, i) => i !== cartIdx));
      return;
    }

    // Case 2: Item does not track inventory batches or has no active batches
    if (!orig?.inventory_item_id || activeBatches.length === 0) {
      if (orig?.inventory_item_id && activeBatches.length === 0) {
        if (orig.allow_oversell === false) {
          setError(`Item '${orig.name}' is Out of Stock and overselling is disabled.`);
          return;
        }
        const cleanName = ci.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();
        setExchangeItems((prev) =>
          prev.map((item, i) =>
            i === cartIdx
              ? {
                  ...item,
                  item_name: `${cleanName} [Oversold Backorder]`,
                  quantity: newQty,
                  allow_oversell: true,
                  selected_batch_id: null,
                  selected_batch_number: null,
                }
              : item
          )
        );
        return;
      }
      setExchangeItems((prev) =>
        prev.map((item, i) => (i === cartIdx ? { ...item, quantity: newQty } : item))
      );
      return;
    }

    // Case 3: Item tracks batches in FIFO order
    const batchIdx = activeBatches.findIndex(
      (b) => b.id === (ci.selected_batch_id || activeBatches[0]?.id)
    );
    const curBatchEffectiveIdx = batchIdx >= 0 ? batchIdx : 0;
    const curBatch = activeBatches[curBatchEffectiveIdx] || activeBatches[0];

    // Batches available for allocation from curBatch forward
    const allocatableBatches = activeBatches.slice(curBatchEffectiveIdx);

    // Identify stock in allocatableBatches used by OTHER exchange items or strictly older lines before cartIdx
    const otherCartLines = exchangeItems.filter((it, idx) => {
      const isThisItem = it.menu_item_id === ci.menu_item_id && it.variant_id === ci.variant_id;
      if (!isThisItem) return true;
      const bIdx = activeBatches.findIndex((b) => b.id === it.selected_batch_id);
      return bIdx >= 0 && bIdx < curBatchEffectiveIdx && idx < cartIdx;
    });

    let qtyRemaining = newQty;
    const allocations: { batch: typeof activeBatches[0]; qty: number; isBackorder: boolean }[] = [];

    for (let k = 0; k < allocatableBatches.length; k++) {
      if (qtyRemaining <= 0) break;
      const b = allocatableBatches[k];
      const effectiveStock = Number(b.remaining_quantity) || 0;
      const usedByOthers = otherCartLines
        .filter((it) => it.selected_batch_id === b.id)
        .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
      const availForThisBatch = Math.max(0, effectiveStock - usedByOthers);

      const take = Math.min(availForThisBatch, qtyRemaining);
      if (take > 0) {
        allocations.push({ batch: b as any, qty: take, isBackorder: false });
        qtyRemaining -= take;
      }
    }

    // Handle any excess beyond total available stock across all batches
    const messages: string[] = [];
    if (qtyRemaining > 0) {
      if (orig?.allow_oversell === false) {
        messages.push(`Total stock reached. ${qtyRemaining} excess blocked (overselling disabled).`);
        qtyRemaining = 0;
      } else {
        const latestBatch = activeBatches[activeBatches.length - 1] || curBatch;
        allocations.push({ batch: latestBatch, qty: qtyRemaining, isBackorder: true });
        messages.push(`Added ${qtyRemaining} as [Oversold Backorder].`);
        qtyRemaining = 0;
      }
    }

    if (allocations.length === 0) {
      if (orig?.allow_oversell === false) {
        setError(`Lot #${curBatch.batch_number} is out of stock. Overselling is disabled.`);
        setExchangeItems((prev) => prev.filter((_, i) => i !== cartIdx));
        return;
      } else {
        allocations.push({ batch: curBatch, qty: newQty, isBackorder: true });
      }
    }

    // Build the new DraftCartItems from allocations
    const factor = getUnitFactor(orig, ci.selected_unit);
    const cleanName = ci.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();

    const newLines: DraftCartItem[] = allocations.map((alloc) => {
      const basePrice = !ci.is_custom_price && alloc.batch.retail_price != null
        ? Number(alloc.batch.retail_price)
        : (ci.base_unit_price ?? ci.unit_price);
      const baseMrp = !ci.is_custom_price && alloc.batch.mrp != null
        ? Number(alloc.batch.mrp)
        : (ci.base_mrp ?? ci.mrp ?? basePrice);
      const linePrice = !ci.is_custom_price
        ? (factor > 0 ? basePrice / factor : basePrice)
        : ci.unit_price;
      const lineMrp = !ci.is_custom_price
        ? (factor > 0 ? Math.max(baseMrp / factor, linePrice) : Math.max(baseMrp, linePrice))
        : ci.mrp;

      return {
        ...ci,
        item_name: alloc.isBackorder ? `${cleanName} [Oversold Backorder]` : cleanName,
        selected_batch_id: alloc.isBackorder ? null : alloc.batch.id,
        selected_batch_number: alloc.batch.batch_number,
        unit_price: linePrice,
        base_unit_price: basePrice,
        mrp: lineMrp,
        base_mrp: baseMrp,
        quantity: alloc.qty,
        allow_oversell: alloc.isBackorder,
      };
    });

    // Replace old lines for this item/variant at or after cartIdx with the newly allocated lines
    setExchangeItems((prev) => {
      const indicesToRemove = new Set<number>();
      for (let i = cartIdx; i < prev.length; i++) {
        const it = prev[i];
        if (it.menu_item_id === ci.menu_item_id && it.variant_id === ci.variant_id) {
          indicesToRemove.add(i);
        }
      }
      const nextCart: DraftCartItem[] = [];
      let inserted = false;
      for (let i = 0; i < prev.length; i++) {
        if (i === cartIdx) {
          nextCart.push(...newLines);
          inserted = true;
        } else if (!indicesToRemove.has(i)) {
          nextCart.push(prev[i]);
        }
      }
      if (!inserted) {
        nextCart.push(...newLines);
      }
      return nextCart.filter((it) => it.quantity > 0);
    });

    if (allocations.length > 1) {
      const summary = allocations
        .map((a) => `${a.qty}x ${a.isBackorder ? "[Backorder]" : `Lot #${a.batch.batch_number}`}`)
        .join(" + ");
      setExchangeNotice(`FIFO allocated: ${summary}`);
    } else if (messages.length > 0) {
      setExchangeNotice(messages.join(" "));
    }
  };

  const handleUpdateExchangeItemQty = (index: number, newQty: number) => {
    handleExchangeItemQuantityChange(index, newQty);
  };

  const handleAddExchangeItem = (m: AdminMenuItem) => {
    const activeBatches = m.active_batches || [];
    const oldestBatch = activeBatches[0];
    const initialUnit = (m as any).unit || m.unit_label || "piece";
    const factor = getUnitFactor(m, initialUnit);

    const isOos = Boolean(m.inventory_item_id && (activeBatches.length === 0 || activeBatches.every(b => (Number(b.remaining_quantity) || 0) <= 0)));
    const isBackorder = Boolean(m.inventory_item_id && isOos && m.allow_oversell !== false);
    const finalItemName = isBackorder ? `${m.name} [Oversold Backorder]` : m.name;

    const baseBatchPrice = oldestBatch?.retail_price != null ? Number(oldestBatch.retail_price) : Number(m.price || 0);
    const baseBatchMrp = oldestBatch?.mrp != null ? Number(oldestBatch.mrp) : (m.mrp ? Number(m.mrp) : baseBatchPrice);

    const linePrice = factor > 0 ? baseBatchPrice / factor : baseBatchPrice;
    const lineMrp = factor > 0 ? Math.max(baseBatchMrp / factor, linePrice) : Math.max(baseBatchMrp, linePrice);

    // If item already exists in exchange list:
    const existingIndex = exchangeItems.findIndex((it) => it.menu_item_id === m.id && !it.allow_oversell);
    if (existingIndex >= 0) {
      handleExchangeItemQuantityChange(existingIndex, exchangeItems[existingIndex].quantity + 1);
      return;
    }

    if (m.inventory_item_id && isOos && m.allow_oversell === false) {
      setError(`Item '${m.name}' is Out of Stock and overselling is disabled.`);
      return;
    }

    const newItem: DraftCartItem = {
      menu_item_id: m.id,
      selected_batch_id: isBackorder ? null : (oldestBatch?.id || null),
      selected_batch_number: isBackorder ? null : (oldestBatch?.batch_number || null),
      allow_oversell: isBackorder,
      item_name: finalItemName,
      unit_price: linePrice,
      base_unit_price: baseBatchPrice,
      base_mrp: baseBatchMrp,
      mrp: lineMrp,
      tax_rate: m.tax_rate ? Number(m.tax_rate) : 0,
      hsn_code: (m as any).hsn_code || null,
      quantity: 1,
      selected_unit: initialUnit,
      pricing_type: "RETAIL",
      is_complimentary: false,
    };

    setExchangeItems((prev) => [...prev, newItem]);
  };

  const handleRemoveExchangeItem = (index: number) => {
    setExchangeItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Return Item Quantity Handlers (Constrained by max available)
  const handleSetReturnItemQty = (itemId: string, val: number, maxQty: number) => {
    if (isNaN(val) || val <= 0) {
      setReturnItemsMap((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return;
    }
    const clamped = Math.min(maxQty, Math.max(0, val));
    const rounded = Math.round(clamped * 1000) / 1000;
    setReturnItemsMap((prev) => ({
      ...prev,
      [itemId]: rounded,
    }));
  };

  const handleToggleReturnItem = (itemId: string, maxQty: number) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current >= maxQty) return prev;
      const nextVal = Math.min(maxQty, Math.round((current + 1) * 1000) / 1000);
      return { ...prev, [itemId]: nextVal };
    });
  };

  const handleSubReturnItem = (itemId: string, maxQty?: number) => {
    setReturnItemsMap((prev) => {
      const current = prev[itemId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      const nextVal = Math.max(0, Math.round((current - 1) * 1000) / 1000);
      if (nextVal <= 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: nextVal };
    });
  };

  const handleSubmitReturn = async () => {
    if (isSubmitting) return;

    // Validate return items selection first
    if (returnMode === "BILL_REFERENCED") {
      if (!selectedBill) {
        setError("Please select a bill to process return.");
        return;
      }
      const returnItemCount = Object.values(returnItemsMap).reduce((acc, qty) => acc + qty, 0);
      if (returnItemCount <= 0) {
        setError("Please select at least one item to return.");
        return;
      }
    } else {
      if (directReturnItems.length === 0) {
        setError("Please add at least one store item for direct return.");
        return;
      }
    }

    // Compulsory check: If any credit/debit option is engaged or STORE_CREDIT chosen
    const hasCreditDebitEngaged = 
      refundMethod === "STORE_CREDIT" ||
      settleDebit ||
      autoConvertCredit ||
      autoRecordDebitOnShortfall ||
      autoRecordExtraChangeAsDebt ||
      parseFloat(applyCreditAmount || "0") > 0 ||
      parseFloat(creditCashedOut || "0") > 0;

    if (hasCreditDebitEngaged && !isCustomerLinked) {
      setShowPhonePrompt(true);
      setError("Customer Phone Number is required to process Store Credit or Udhaar. Please enter customer phone number.");
      return;
    }

    let finalApplyCredit = appliedCredit;
    let finalCreditCashedOut = cashedOutCredit;
    let finalDebtSettled = 0;
    let finalRecordCredit = 0;
    let finalRecordDebit = 0;

    if (refundMethod === "STORE_CREDIT") {
      const curDebt = (customerAnalytics && customerAnalytics.credit_balance < 0) ? Math.abs(customerAnalytics.credit_balance) : 0;
      if (curDebt > 0) {
        if (rawRefundOwed <= curDebt) {
          finalDebtSettled = rawRefundOwed;
          finalRecordCredit = 0;
        } else {
          finalDebtSettled = curDebt;
          finalRecordCredit = rawRefundOwed - curDebt;
        }
      } else {
        finalRecordCredit = rawRefundOwed;
      }
    } else if (isNetRefund) {
      // Cash/UPI Refund
      if (settleDebit) {
        finalDebtSettled += refundDebtToSettle;
      }
      if (refundMethod === "CASH") {
        const netCashGiven = refundDenomTotal - inwardDenomTotal;
        if (netCashGiven < targetRefundAmt) {
          if (!autoConvertCredit) {
            setError(`Cash refund short by ₹${(targetRefundAmt - netCashGiven).toFixed(2)}. Please tap exact change or enable 'Convert to Store Credit'.`);
            return;
          }
          const unpaidRefund = targetRefundAmt - netCashGiven;
          const curDebt = (customerAnalytics && customerAnalytics.credit_balance < 0)
            ? Math.max(0, Math.abs(customerAnalytics.credit_balance) - finalDebtSettled)
            : 0;
          if (curDebt > 0) {
            if (unpaidRefund <= curDebt) {
              finalDebtSettled += unpaidRefund;
            } else {
              finalDebtSettled += curDebt;
              finalRecordCredit += (unpaidRefund - curDebt);
            }
          } else {
            finalRecordCredit += unpaidRefund;
          }
        } else if (netCashGiven > targetRefundAmt) {
          if (!autoRecordExtraChangeAsDebt) {
            setError(`Extra cash given (₹${(netCashGiven - targetRefundAmt).toFixed(2)} extra). Please adjust notes or enable 'Record extra as Debt'.`);
            return;
          }
          finalRecordDebit += (netCashGiven - targetRefundAmt);
        }
      }
    } else {
      // Exchange (Net Payable by Customer)
      if (settleDebit) {
        finalDebtSettled += payableDebtToAdd;
      }
      if (refundMethod === "CASH") {
        const netCashPaid = inwardDenomTotal - refundDenomTotal;
        if (targetCollectionAmt > 0 && netCashPaid <= 0 && !autoRecordDebitOnShortfall) {
          setError(`Please tap cash denominations received from customer.`);
          return;
        }
        if (netCashPaid < targetCollectionAmt) {
          if (!autoRecordDebitOnShortfall) {
            setError(`Customer cash is short by ₹${(targetCollectionAmt - netCashPaid).toFixed(2)}. Please tap exact cash or enable 'Record shortfall as Debt'.`);
            return;
          }
          finalRecordDebit += (targetCollectionAmt - netCashPaid);
        } else if (netCashPaid > targetCollectionAmt) {
          if (!autoConvertCredit && !settleDebit) {
            setError(`Customer paid ₹${(netCashPaid - targetCollectionAmt).toFixed(2)} extra. Tap change given back or enable 'Convert extra change to Store Credit'.`);
            return;
          }
          if (autoConvertCredit) {
            const extra = netCashPaid - targetCollectionAmt;
            const curDebt = (customerAnalytics && customerAnalytics.credit_balance < 0)
              ? Math.max(0, Math.abs(customerAnalytics.credit_balance) - finalDebtSettled)
              : 0;
            if (curDebt > 0) {
              if (extra <= curDebt) {
                finalDebtSettled += extra;
              } else {
                finalDebtSettled += curDebt;
                finalRecordCredit += (extra - curDebt);
              }
            } else {
              finalRecordCredit += extra;
            }
          }
        }
      }
    }

    const walletPayload = {
      apply_credit: finalApplyCredit,
      record_debit: finalRecordDebit,
      record_credit: finalRecordCredit,
      debt_settled: finalDebtSettled,
      credit_cashed_out: finalCreditCashedOut,
    };

    setIsSubmitting(true);
    setError(null);

    try {
      if (returnMode === "BILL_REFERENCED") {
        if (!selectedBill) return;
        const returnItemsPayload = Object.entries(returnItemsMap).map(([order_item_id, quantity]) => {
          const origItem = selectedBill.items?.find((i: any) => i.id === order_item_id);
          const mItem = origItem?.menu_item_id
            ? menuItemsMap[origItem.menu_item_id]
            : (activeCatalog || []).find((m: any) => m.name?.toLowerCase() === origItem?.item_name?.toLowerCase());
          const billedUnit = origItem?.selected_unit || mItem?.unit_label || "piece";
          const currentUnit = returnItemsUnitMap[order_item_id] || billedUnit;
          const billedPrice = origItem?.unit_price ? Number(origItem.unit_price) : 0;
          const billedFactor = getUnitFactor(mItem, billedUnit);
          const currentFactor = getUnitFactor(mItem, currentUnit);
          const factorRatio = (billedFactor > 0 && currentFactor > 0) ? (currentFactor / billedFactor) : 1;
          const effectiveUnitPrice = factorRatio > 0 ? billedPrice / factorRatio : billedPrice;

          const baseMrp = origItem?.mrp ? Number(origItem.mrp) : (mItem?.mrp ? Number(mItem.mrp) : billedPrice);
          const effectiveMrp = factorRatio > 0 ? baseMrp / factorRatio : baseMrp;

          return {
            order_item_id,
            menu_item_id: origItem?.menu_item_id || null,
            item_name: origItem?.item_name || mItem?.name || "Item",
            quantity,
            selected_unit: currentUnit,
            unit_price: effectiveUnitPrice,
            mrp: effectiveMrp,
            tax_rate: origItem?.tax_rate !== undefined && origItem?.tax_rate !== null ? Number(origItem.tax_rate) : (mItem?.tax_rate ? Number(mItem.tax_rate) : 0),
            hsn_code: origItem?.hsn_code || mItem?.hsn_code || null,
            reason: returnReason,
          };
        });

        if (returnItemsPayload.length === 0) {
          setError("Please select at least one item to return.");
          return;
        }

        const exchangeItemsPayload = exchangeItems.map((item) => ({
          menu_item_id: item.menu_item_id || null,
          variant_id: item.variant_id || null,
          selected_batch_id: item.selected_batch_id || null,
          allow_oversell: !!item.allow_oversell,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          mrp: item.mrp || null,
          tax_rate: item.tax_rate || null,
          hsn_code: item.hsn_code || null,
          pricing_type: item.pricing_type || "RETAIL",
          is_complimentary: item.is_complimentary,
          selected_unit: item.selected_unit || null,
        }));

        await onRequestReturn({
          order_id: selectedBill.id,
          customer_name: effectiveCustomerName || null,
          customer_phone: effectiveCustomerPhone || null,
          return_items: returnItemsPayload,
          exchange_items: exchangeItemsPayload,
          refund_payment_method: refundMethod,
          refund_cash_denominations: refundMethod === "CASH" ? refundCashDenoms : undefined,
          inward_cash_denominations: refundMethod === "CASH" ? inwardCashDenoms : undefined,
          notes: returnReason,
          is_interstate: selectedBill.is_interstate,
          place_of_supply: selectedBill.place_of_supply,
          round_off: activeRoundOff,
          ...walletPayload,
        });
      } else {
        // Direct Unbilled Return
        if (directReturnItems.length === 0) {
          setError("Please add at least one store item for direct return.");
          return;
        }

        const returnItemsPayload = directReturnItems.map((item) => {
          const mItem = menuItemsMap[item.menu_item_id];
          return {
            menu_item_id: item.menu_item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            mrp: mItem?.mrp ? Number(mItem.mrp) : item.unit_price,
            tax_rate: mItem?.tax_rate ? Number(mItem.tax_rate) : 0,
            hsn_code: mItem?.hsn_code || null,
            reason: returnReason,
          };
        });

        const exchangeItemsPayload = exchangeItems.map((item) => ({
          menu_item_id: item.menu_item_id || null,
          variant_id: item.variant_id || null,
          selected_batch_id: item.selected_batch_id || null,
          allow_oversell: !!item.allow_oversell,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          mrp: item.mrp || null,
          tax_rate: item.tax_rate || null,
          hsn_code: item.hsn_code || null,
          pricing_type: item.pricing_type || "RETAIL",
          is_complimentary: item.is_complimentary,
          selected_unit: item.selected_unit || null,
        }));

        await onRequestReturn({
          order_id: null,
          customer_name: effectiveCustomerName || null,
          customer_phone: effectiveCustomerPhone || null,
          return_items: returnItemsPayload,
          exchange_items: exchangeItemsPayload,
          refund_payment_method: refundMethod,
          refund_cash_denominations: refundMethod === "CASH" ? refundCashDenoms : undefined,
          inward_cash_denominations: refundMethod === "CASH" ? inwardCashDenoms : undefined,
          notes: returnReason,
          is_interstate: restaurant?.interstate_mode === "ALWAYS_ON",
          place_of_supply: restaurant?.place_of_supply || null,
          round_off: activeRoundOff,
          ...walletPayload,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to process return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard Shortcuts (3x3 Numpad & Spacebar Deck Switching) Listener
  const latestHandlers = useRef({
    activeCashDeck,
    setActiveCashDeck,
    handleRefundDenomChange,
    handleInwardDenomChange,
    handleResetOutwardNotes,
    handleResetInwardNotes,
    outwardDeckRef,
    inwardDeckRef,
    rightScrollRef,
    cashSectionRef,
    scrollToCashDeck,
    refundMethod,
    showPhonePrompt,
    handleSubmitReturn,
    returnCreditTotal,
    isSubmitting,
    onClose,
  });

  useEffect(() => {
    latestHandlers.current = {
      activeCashDeck,
      setActiveCashDeck,
      handleRefundDenomChange,
      handleInwardDenomChange,
      handleResetOutwardNotes,
      handleResetInwardNotes,
      outwardDeckRef,
      inwardDeckRef,
      rightScrollRef,
      cashSectionRef,
      scrollToCashDeck,
      refundMethod,
      showPhonePrompt,
      handleSubmitReturn,
      returnCreditTotal,
      isSubmitting,
      onClose,
    };
  });

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form inputs, textareas, selects, or editable elements
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const h = latestHandlers.current;

      // Don't intercept if Link Customer popup modal is open or was just closed
      if (h.showPhonePrompt || (Date.now() - lastPhonePromptCloseTime.current < 500)) return;

      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        e.preventDefault();
        h.onClose();
        return;
      }

      if (e.key === "Enter") {
        if (h.returnCreditTotal > 0 && !h.isSubmitting) {
          e.preventDefault();
          void h.handleSubmitReturn();
        }
        return;
      }

      // Denomination shortcuts only apply in CASH refund/exchange mode
      if (h.refundMethod !== "CASH") return;

      // Spacebar switches deck between OUTWARD and INWARD and slides into view
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        h.setActiveCashDeck((prev: "OUTWARD" | "INWARD") => {
          const next = prev === "OUTWARD" ? "INWARD" : "OUTWARD";
          setTimeout(() => {
            h.scrollToCashDeck(next);
          }, 30);
          return next;
        });
        return;
      }

      // Backspace / Delete resets denominations of the active deck
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (h.activeCashDeck === "OUTWARD") {
          h.handleResetOutwardNotes();
        } else {
          h.handleResetInwardNotes();
        }
        return;
      }

      // Numpad & Digit 1-9 mapping to 3x3 denominations
      const denom = NUMPAD_DENOM_MAP[e.code];
      if (denom) {
        e.preventDefault();
        // Immediately slide screen so cash selection deck comes into view
        h.scrollToCashDeck(h.activeCashDeck);

        // Windows Numpad shift detection: Shift + Numpad7 sends e.key="Home", e.shiftKey=false
        const isNumpadShifted = e.code.startsWith("Numpad") && !/^\d$/.test(e.key);
        const isRemoveAction = e.shiftKey || isNumpadShifted;

        if (isRemoveAction) {
          if (h.activeCashDeck === "OUTWARD") {
            h.handleRefundDenomChange(denom, -1);
          } else {
            h.handleInwardDenomChange(denom, -1);
          }
        } else {
          if (h.activeCashDeck === "OUTWARD") {
            h.handleRefundDenomChange(denom, 1);
          } else {
            h.handleInwardDenomChange(denom, 1);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full max-w-none max-h-none flex flex-col rounded-none border-none bg-[var(--bg-surface)] overflow-hidden relative">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-6 py-3.5 flex-shrink-0 gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="rounded-2xl bg-purple-500/10 p-2.5 shadow-sm border border-purple-500/20 shrink-0">
              <RotateCcw className="h-6 w-6 text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-display text-xl font-black tracking-tight text-[var(--text-primary)] truncate">Customer Returns & Exchanges</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs font-semibold text-sky-400 shrink-0">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>POS Filter: {activeDateFilterLabel}</span>
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 tracking-wide truncate">
                Process returns, issue store credit, or direct exchange.
              </p>
            </div>
          </div>

          {/* Header Action / Metric Area */}
          {isProcessingReturn ? (
            /* Prominent Live Financial Summary Header (Return Total, Exchange Total, Net Flow) */
            <div className="hidden sm:flex items-center gap-3 bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border-subtle)] shadow-xs shrink-0">
              {/* Return Total */}
              <div className="flex flex-col items-end pr-3 border-r border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                  <ArrowDownRight className="h-3 w-3" /> Return Total
                </span>
                <span className="font-mono text-base font-extrabold text-rose-500">
                  ₹{returnCreditTotal.toFixed(2)}
                </span>
              </div>

              {/* Exchange Total */}
              <div className="flex flex-col items-end pr-3 border-r border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-500 flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" /> Exchange Total
                </span>
                <span className="font-mono text-base font-extrabold text-sky-500">
                  ₹{exchangeItemsTotal.toFixed(2)}
                </span>
              </div>

              {/* Net Settlement */}
              <div className="flex flex-col items-end pl-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {isNetRefund ? "Net Refund (Mart Owes)" : netBalance > 0 ? "Net Payable (Customer Pays)" : "Net Difference"}
                </span>
                <span className={`font-mono text-lg font-black ${
                  isNetRefund 
                    ? "text-emerald-500" 
                    : netBalance > 0 
                    ? "text-amber-500" 
                    : "text-[var(--text-primary)]"
                }`}>
                  {isNetRefund ? `₹${rawRefundOwed.toFixed(2)}` : netBalance > 0 ? `₹${rawAdditionalPayable.toFixed(2)}` : "₹0.00"}
                </span>
              </div>
            </div>
          ) : (
            /* 4 Executive Summary Boxes (Shown whenever a return bill is not being processed) */
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {/* Gross Returns */}
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 min-w-[105px] text-left">
                <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider block">Gross Returns</span>
                <span className="text-base font-black text-rose-500 font-mono">
                  ₹{vouchersSummary.grossReturns.toFixed(2)}
                </span>
              </div>

              {/* Exchange Value */}
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-1.5 min-w-[105px] text-left">
                <span className="text-[9px] font-bold text-sky-400 uppercase tracking-wider block">Exchange Value</span>
                <span className="text-base font-black text-sky-500 font-mono">
                  ₹{vouchersSummary.totalExchanges.toFixed(2)}
                </span>
              </div>

              {/* Net Refund */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 min-w-[105px] text-left">
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                  {vouchersSummary.netBalance < 0 ? "Net Collected" : vouchersSummary.netBalance > 0 ? "Net Refund" : "Net Settlement"}
                </span>
                <span className={`text-base font-black font-mono ${
                  vouchersSummary.netBalance < 0
                    ? "text-emerald-400"
                    : vouchersSummary.netBalance > 0
                      ? "text-rose-500"
                      : "text-[var(--text-primary)]"
                }`}>
                  {vouchersSummary.netBalance < 0
                    ? `+₹${Math.abs(vouchersSummary.netBalance).toFixed(2)}`
                    : vouchersSummary.netBalance > 0
                      ? `-₹${vouchersSummary.netBalance.toFixed(2)}`
                      : "₹0.00"}
                </span>
                {vouchersSummary.netBalance > 0 && vouchersSummary.netCreditDebit > 0 && (
                  <div className="mt-1 pt-1 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] font-bold flex items-center justify-between">
                    <span>CASH:</span>
                    <span className="text-rose-500 font-mono">-₹{(vouchersSummary.netBalance - vouchersSummary.netCreditDebit).toFixed(2)}</span>
                  </div>
                )}
                {vouchersSummary.netBalance < 0 && vouchersSummary.netCreditDebit < 0 && (
                  <div className="mt-1 pt-1 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] font-bold flex items-center justify-between">
                    <span>CASH:</span>
                    <span className="text-emerald-400 font-mono">+₹{(Math.abs(vouchersSummary.netBalance) - Math.abs(vouchersSummary.netCreditDebit)).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Return Credit-Debit */}
              <div
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 min-w-[115px] text-left cursor-help"
                title={
                  [
                    vouchersSummary.debitApplied > 0 ? `Udhaar Recorded: -₹${vouchersSummary.debitApplied.toFixed(2)}` : null,
                    vouchersSummary.creditApplied > 0 ? `Credit Applied: -₹${vouchersSummary.creditApplied.toFixed(2)}` : null,
                    vouchersSummary.debtSettled > 0 ? `Debt Settled: +₹${vouchersSummary.debtSettled.toFixed(2)}` : null,
                    vouchersSummary.creditAwarded > 0 ? `Wallet Credited: +₹${vouchersSummary.creditAwarded.toFixed(2)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" • ") || "Return Wallet Activity"
                }
              >
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Return Credit-Debit</span>
                <span className={`text-base font-black font-mono ${vouchersSummary.netCreditDebit < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {vouchersSummary.netCreditDebit >= 0 ? "+" : "-"}₹{Math.abs(vouchersSummary.netCreditDebit).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="rounded-xl p-2.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition cursor-pointer shrink-0"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-3 flex items-center justify-between text-sm font-bold text-rose-500 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 rounded-full bg-rose-500 p-1 text-[var(--bg-surface)]">
                <X className="h-3.5 w-3.5" />
              </span>
              {error}
            </div>
            <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100 uppercase text-xs tracking-wider px-2.5 py-1 rounded bg-rose-500/20 cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body: 3:7 ratio */}
        <div className="flex flex-1 overflow-hidden min-h-0 bg-[var(--bg-body)] grid lg:grid-cols-[30%_70%] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left Column (30%): Fixed Header/Tabs/Search, Only Middle Box Scrollable */}
          <div className="p-5 flex flex-col h-full overflow-hidden space-y-4">
            {/* 3 Lookup Options Tabs */}
            <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[var(--bg-surface-elevated)] p-1.5 border border-[var(--border-strong)] flex-shrink-0">
              <button
                type="button"
                onClick={() => setLookupTab("USER_HISTORY")}
                className={`rounded-xl py-2.5 px-1.5 text-sm font-bold transition flex flex-col items-center gap-1.5 cursor-pointer ${
                  lookupTab === "USER_HISTORY"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <UserCheck className="h-4.5 w-4.5" />
                <span>1. User History</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("INVOICE_NO")}
                className={`rounded-xl py-2.5 px-1.5 text-sm font-bold transition flex flex-col items-center gap-1.5 cursor-pointer ${
                  lookupTab === "INVOICE_NO"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Barcode className="h-4.5 w-4.5" />
                <span>2. Invoice No</span>
              </button>
              <button
                type="button"
                onClick={() => setLookupTab("RETURN_HISTORY")}
                className={`rounded-xl py-2.5 px-1.5 text-sm font-bold transition flex flex-col items-center gap-1.5 cursor-pointer ${
                  lookupTab === "RETURN_HISTORY"
                    ? "bg-sky-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <FileText className="h-4.5 w-4.5" />
                <span>3. Return Log</span>
              </button>
            </div>

            {/* Search Input based on active lookup option */}
            {lookupTab === "USER_HISTORY" && (
              <div className="space-y-1 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search customer phone or name..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 pl-10 pr-3.5 text-sm font-medium text-[var(--text-primary)] focus:border-sky-400 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5 px-1">
                  <span className="flex items-center gap-1.5">
                    <span>🔍 Searching returnable bills from the last 30 days</span>
                    {isSearchingServerBills && <RefreshCw className="h-3 w-3 animate-spin text-sky-400 inline" />}
                  </span>
                  {serverSearchedBills.length > 0 && (
                    <span className="text-sky-400 font-bold font-mono text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                      +{serverSearchedBills.length} from 30d
                    </span>
                  )}
                </div>
              </div>
            )}

            {lookupTab === "INVOICE_NO" && (
              <div className="space-y-1 flex-shrink-0">
                <div className="relative">
                  <Barcode className="absolute left-3.5 top-3 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Enter or scan Bill / Invoice ID (e.g. 59C8D...)"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 pl-10 pr-3.5 text-sm font-mono text-[var(--text-primary)] focus:border-sky-400 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5 px-1">
                  <span className="flex items-center gap-1.5">
                    <span>🔍 Searching returnable bills from the last 30 days</span>
                    {isSearchingServerBills && <RefreshCw className="h-3 w-3 animate-spin text-sky-400 inline" />}
                  </span>
                  {serverSearchedBills.length > 0 && (
                    <span className="text-sky-400 font-bold font-mono text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                      +{serverSearchedBills.length} from 30d
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable Middle List Box */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {lookupTab === "RETURN_HISTORY" ? (
                isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-12 text-xs text-[var(--text-muted)] space-y-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                    <span>Loading Return Bills History...</span>
                  </div>
                ) : returnsHistoryList.length === 0 ? (
                  !isAdminRole && !isPunchedIn ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4 space-y-2.5">
                      <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                        <Clock className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold text-amber-500">Shift Inactive</p>
                      <p className="text-[11px] text-[var(--text-muted)] max-w-xs">
                        Punch in to view your current shift return history and processed refunds.
                      </p>
                      {onRequirePunchIn && (
                        <button
                          type="button"
                          onClick={onRequirePunchIn}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer transition shadow-xs"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          Punch In
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)] text-center py-12">No past return bills found.</p>
                  )
                ) : (
                  returnsHistoryList.map((ret) => (
                    <div
                      key={ret.id}
                      onClick={() => {
                        if (itemLedgerSearch === ret.return_number) {
                          setItemLedgerSearch("");
                          void fetchItemLedger("", itemLedgerReason);
                        } else {
                          setItemLedgerSearch(ret.return_number);
                          void fetchItemLedger(ret.return_number, itemLedgerReason);
                        }
                      }}
                      className={`rounded-2xl border p-4 space-y-2.5 shadow-xs cursor-pointer transition ${
                        itemLedgerSearch === ret.return_number
                          ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400"
                      }`}
                    >
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-mono font-black text-sky-400">{ret.return_number}</span>
                        <span className="font-mono font-black text-[var(--text-primary)] text-base">
                          ₹{ret.total_refund_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-[var(--text-secondary)] font-medium">
                        <span>Orig Bill: {ret.original_bill_number}</span>
                        <span>{parseUTCDate(ret.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)]">
                        <span className="text-xs text-[var(--text-primary)] font-bold">
                          {ret.customer_name || "Walk-In Customer"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "view", menuItemsMap)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-bold text-sky-400 hover:bg-sky-500/20 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "download", menuItemsMap)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-sky-400 cursor-pointer"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>Print</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : lookupTab === "INVOICE_NO" ? (
                matchingInvoiceBill ? (
                  <div
                    onClick={() => {
                      if (selectedBill?.id === matchingInvoiceBill.id && returnMode === "BILL_REFERENCED") {
                        setSelectedBill(null);
                        setReturnItemsMap({});
                        setReturnItemsUnitMap({});
                      } else {
                        setReturnMode("BILL_REFERENCED");
                        setSelectedBill(matchingInvoiceBill);
                        setReturnItemsMap({});
                        setReturnItemsUnitMap({});
                      }
                    }}
                    className={`rounded-2xl border p-4 cursor-pointer transition space-y-2 shadow-xs ${
                      selectedBill?.id === matchingInvoiceBill.id && returnMode === "BILL_REFERENCED"
                        ? "border-sky-500/50 bg-sky-500/15 ring-1 ring-sky-500/30"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-mono font-black text-sky-400">
                        Bill #{matchingInvoiceBill.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="font-mono font-black text-base text-[var(--text-primary)]">
                        ₹{matchingInvoiceBill.total_amount.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-primary)] font-bold">
                      {matchingInvoiceBill.customer_name || "Walk-In Customer"} ({matchingInvoiceBill.customer_phone || "No Phone"})
                    </p>
                    {((matchingInvoiceBill as any).credit_applied > 0 || (matchingInvoiceBill as any).debit_applied > 0 || (matchingInvoiceBill as any).debt_settled > 0 || (matchingInvoiceBill as any).credit_awarded > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(matchingInvoiceBill as any).credit_applied > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Cr Used: ₹{(matchingInvoiceBill as any).credit_applied}
                          </span>
                        )}
                        {(matchingInvoiceBill as any).debit_applied > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Udhaar: ₹{(matchingInvoiceBill as any).debit_applied}
                          </span>
                        )}
                        {(matchingInvoiceBill as any).debt_settled > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Debt Settled: ₹{(matchingInvoiceBill as any).debt_settled}
                          </span>
                        )}
                        {(matchingInvoiceBill as any).credit_awarded > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            Cr Added: ₹{(matchingInvoiceBill as any).credit_awarded}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] text-center py-12">
                    Enter a valid invoice ID to view bill details.
                  </p>
                )
              ) : filteredUserBills.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-12">No matching paid bills found.</p>
              ) : (
                filteredUserBills.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => {
                      if (selectedBill?.id === bill.id && returnMode === "BILL_REFERENCED") {
                        setSelectedBill(null);
                        setReturnItemsMap({});
                        setReturnItemsUnitMap({});
                      } else {
                        setReturnMode("BILL_REFERENCED");
                        setSelectedBill(bill);
                        setReturnItemsMap({});
                        setReturnItemsUnitMap({});
                      }
                    }}
                    className={`rounded-2xl border p-4 cursor-pointer transition space-y-2 shadow-xs ${
                      selectedBill?.id === bill.id && returnMode === "BILL_REFERENCED"
                        ? "border-sky-500/50 bg-sky-500/15 ring-1 ring-sky-500/30"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-sky-400/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-mono font-black text-sky-400">
                        Bill #{bill.id.slice(0, 8).toUpperCase()} • {bill.basket_number && bill.basket_number.toUpperCase().includes("WALK") ? "Walk-In" : `Basket #${bill.basket_number}`}
                      </span>
                      <span className="font-mono font-black text-base text-[var(--text-primary)]">
                        ₹{bill.total_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-[var(--text-secondary)] font-medium">
                      <span>{bill.customer_name || "Walk-In"} ({bill.customer_phone || "N/A"})</span>
                      <span>{parseUTCDate(bill.created_at).toLocaleDateString()}</span>
                    </div>
                    {((bill as any).credit_applied > 0 || (bill as any).debit_applied > 0 || (bill as any).debt_settled > 0 || (bill as any).credit_awarded > 0) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(bill as any).credit_applied > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Cr Used: ₹{(bill as any).credit_applied}
                          </span>
                        )}
                        {(bill as any).debit_applied > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Udhaar: ₹{(bill as any).debit_applied}
                          </span>
                        )}
                        {(bill as any).debt_settled > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Debt Settled: ₹{(bill as any).debt_settled}
                          </span>
                        )}
                        {(bill as any).credit_awarded > 0 && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            Cr Added: ₹{(bill as any).credit_awarded}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column (70%): Return Items Selector & Summary, or Item-Level Return Ledger */}
          <div className="p-5 flex flex-col h-full overflow-hidden justify-between space-y-4">
            {lookupTab === "RETURN_HISTORY" ? (
              <div className="flex flex-col h-full overflow-hidden space-y-3">
                {/* Header with Title and Mode Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3 flex-shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                        <Tag className="h-4 w-4" />
                      </span>
                      <h3 className="text-base font-black text-[var(--text-primary)] tracking-tight">
                        Item-Level Return Ledger
                      </h3>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Transactional audit of individual returned items &amp; refund amounts
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)] text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setHistoryViewMode("ITEM_LEDGER")}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          historyViewMode === "ITEM_LEDGER"
                            ? "bg-sky-500 text-white shadow-xs"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Item Ledger ({itemLedgerData?.summary?.total_line_items ?? 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryViewMode("VOUCHERS")}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          historyViewMode === "VOUCHERS"
                            ? "bg-sky-500 text-white shadow-xs"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Vouchers ({returnsHistoryList.length})
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void fetchReturnsHistory();
                        void fetchItemLedger();
                      }}
                      disabled={isLoadingLedger || isLoadingHistory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-xs font-bold text-[var(--text-primary)] hover:border-sky-400 cursor-pointer transition"
                      title="Refresh return records"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLedger ? "animate-spin text-sky-400" : ""}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportLedgerCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer transition"
                      title="Export returned items to CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                {/* Search & Reason Filter Bar */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder="Search by item name, barcode, customer, return #, bill #..."
                      value={itemLedgerSearch}
                      onChange={(e) => {
                        setItemLedgerSearch(e.target.value);
                        void fetchItemLedger(e.target.value, itemLedgerReason);
                      }}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-sky-400 outline-none"
                    />
                  </div>

                  <select
                    value={itemLedgerReason}
                    onChange={(e) => {
                      setItemLedgerReason(e.target.value);
                      void fetchItemLedger(itemLedgerSearch, e.target.value);
                    }}
                    className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 px-3 text-xs font-bold text-[var(--text-primary)] focus:border-sky-400 outline-none cursor-pointer"
                  >
                    <option value="ALL">All Reasons</option>
                    <option value="DEFECTIVE_PRODUCT">Defective Product</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="CUSTOMER_CHANGED_MIND">Customer Changed Mind</option>
                    <option value="WRONG_ITEM">Wrong Item</option>
                    <option value="QUALITY_ISSUE">Quality Issue</option>
                    <option value="CUSTOMER_RETURN">General Return</option>
                  </select>
                </div>

                {/* Summary Metric Cards */}
                {historyViewMode === "ITEM_LEDGER" ? (
                  <div className="grid grid-cols-4 gap-2.5 flex-shrink-0">
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Line Items</span>
                      <span className="text-lg font-black text-[var(--text-primary)] font-mono">
                        {itemLedgerData?.summary?.total_line_items ?? 0}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Qty Returned</span>
                      <span className="text-lg font-black text-amber-500 font-mono">
                        {(itemLedgerData?.summary?.total_quantity_returned ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block">Total Refund</span>
                      <span className="text-lg font-black text-red-500 font-mono">
                        ₹{(itemLedgerData?.summary?.total_refund_amount ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Bills Affected</span>
                      <span className="text-lg font-black text-sky-400 font-mono">
                        {itemLedgerData?.summary?.unique_bills_count ?? 0}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`${isProcessingReturn ? "grid" : "grid md:hidden"} grid-cols-4 gap-2.5 flex-shrink-0`}>
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Gross Returns</span>
                      <span className="text-lg font-black text-rose-500 font-mono">
                        ₹{vouchersSummary.grossReturns.toFixed(2)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Exchange Value</span>
                      <span className="text-lg font-black text-sky-500 font-mono">
                        ₹{vouchersSummary.totalExchanges.toFixed(2)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        {vouchersSummary.netBalance < 0 ? "Net Collected" : vouchersSummary.netBalance > 0 ? "Net Refund" : "Net Settlement"}
                      </span>
                      <span className={`text-lg font-black font-mono ${
                        vouchersSummary.netBalance < 0
                          ? "text-emerald-400"
                          : vouchersSummary.netBalance > 0
                            ? "text-rose-500"
                            : "text-[var(--text-primary)]"
                      }`}>
                        {vouchersSummary.netBalance < 0
                          ? `+₹${Math.abs(vouchersSummary.netBalance).toFixed(2)}`
                          : vouchersSummary.netBalance > 0
                            ? `-₹${vouchersSummary.netBalance.toFixed(2)}`
                            : "₹0.00"}
                      </span>
                      {vouchersSummary.netBalance > 0 && vouchersSummary.netCreditDebit > 0 && (
                        <div className="mt-1 pt-1 border-t border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-bold flex items-center justify-between">
                          <span>CASH:</span>
                          <span className="text-rose-500 font-mono">-₹{(vouchersSummary.netBalance - vouchersSummary.netCreditDebit).toFixed(2)}</span>
                        </div>
                      )}
                      {vouchersSummary.netBalance < 0 && vouchersSummary.netCreditDebit < 0 && (
                        <div className="mt-1 pt-1 border-t border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-bold flex items-center justify-between">
                          <span>CASH:</span>
                          <span className="text-emerald-400 font-mono">+₹{(Math.abs(vouchersSummary.netBalance) - Math.abs(vouchersSummary.netCreditDebit)).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 cursor-help"
                      title={
                        [
                          vouchersSummary.debitApplied > 0 ? `Udhaar Recorded: -₹${vouchersSummary.debitApplied.toFixed(2)}` : null,
                          vouchersSummary.creditApplied > 0 ? `Credit Applied: -₹${vouchersSummary.creditApplied.toFixed(2)}` : null,
                          vouchersSummary.debtSettled > 0 ? `Debt Settled: +₹${vouchersSummary.debtSettled.toFixed(2)}` : null,
                          vouchersSummary.creditAwarded > 0 ? `Wallet Credited: +₹${vouchersSummary.creditAwarded.toFixed(2)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Return Wallet Activity"
                      }
                    >
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Return Credit-Debit</span>
                      <span className={`text-lg font-black font-mono ${vouchersSummary.netCreditDebit < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {vouchersSummary.netCreditDebit >= 0 ? "+" : "-"}₹{Math.abs(vouchersSummary.netCreditDebit).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Content Area: Either Item Ledger Table or Vouchers Summary Grid */}
                <div className="flex-1 overflow-y-auto border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface)] min-h-0">
                  {historyViewMode === "ITEM_LEDGER" ? (
                    isLoadingLedger ? (
                      <div className="flex flex-col items-center justify-center py-20 text-xs text-[var(--text-muted)] space-y-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                        <span>Loading Item-Level Return Ledger...</span>
                      </div>
                    ) : !itemLedgerData || itemLedgerData.items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-xs text-[var(--text-muted)] space-y-2">
                        <Tag className="h-8 w-8 opacity-20" />
                        <p className="font-semibold text-sm">
                          {!isAdminRole && !isPunchedIn
                            ? "Shift Inactive — Punch in to view shift returned items"
                            : "No returned items match the criteria"}
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] z-10">
                          <tr>
                            <th className="p-3">Date &amp; Time</th>
                            <th className="p-3">Return #</th>
                            <th className="p-3">Orig Bill</th>
                            <th className="p-3">Customer</th>
                            <th className="p-3">Item Name</th>
                            <th className="p-3 text-center">Qty</th>
                            <th className="p-3 text-right">Unit Price</th>
                            <th className="p-3 text-right text-red-500">Refund</th>
                            <th className="p-3">Reason</th>
                            <th className="p-3 text-center">Payment</th>
                            <th className="p-3 text-right">Receipt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {itemLedgerData.items.map((row) => {
                            const isDefective = (row.reason || "").includes("DEFECTIVE");
                            const isExpired = (row.reason || "").includes("EXPIRED");
                            const badgeClass = isDefective
                              ? "bg-red-500/10 text-red-500 border-red-500/20"
                              : isExpired
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : "bg-sky-500/10 text-sky-400 border-sky-500/20";

                            const parentVoucher = returnsHistoryList.find(
                              (v) => v.id === row.return_id || v.return_number === row.return_number
                            );

                            return (
                              <tr key={row.id} className="hover:bg-[var(--bg-surface-elevated)]/60 transition">
                                <td className="p-3 whitespace-nowrap text-[var(--text-secondary)] font-mono text-[11px]">
                                  {parseUTCDate(row.return_date).toLocaleString()}
                                </td>
                                <td className="p-3 font-mono font-bold text-sky-400 whitespace-nowrap">
                                  {row.return_number}
                                </td>
                                <td className="p-3 font-mono text-[var(--text-secondary)] whitespace-nowrap text-[11px]">
                                  {row.original_bill_number}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span className="font-bold text-[var(--text-primary)] block">
                                    {row.customer_name || "Walk-In"}
                                  </span>
                                  {row.customer_phone && (
                                    <span className="text-[10px] text-[var(--text-muted)] font-mono block">
                                      {row.customer_phone}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <span className="font-bold text-[var(--text-primary)] block">
                                    {row.item_name}
                                  </span>
                                  {row.category_name && (
                                    <span className="text-[10px] text-[var(--text-muted)] block">
                                      {row.category_name}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                                  {row.quantity} {row.selected_unit || "pc"}
                                </td>
                                <td className="p-3 text-right font-mono text-[var(--text-secondary)] whitespace-nowrap">
                                  ₹{row.unit_price.toFixed(2)}
                                </td>
                                <td className="p-3 text-right font-mono font-black text-red-500 whitespace-nowrap">
                                  ₹{row.line_refund.toFixed(2)}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}`}>
                                    {row.reason.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="p-3 text-center whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--bg-surface-elevated)] text-[10px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                                    {row.refund_payment_method}
                                  </span>
                                </td>
                                <td className="p-3 text-right whitespace-nowrap">
                                  {parentVoucher && (
                                    <button
                                      type="button"
                                      onClick={() => generateReturnReceiptPDF(parentVoucher, restaurantName, restaurant, "view", menuItemsMap)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-bold text-sky-400 hover:bg-sky-500/20 cursor-pointer"
                                      title="View PDF Receipt"
                                    >
                                      <Eye className="h-3 w-3" />
                                      <span>PDF</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )
                  ) : (
                    /* Vouchers Grid / Expanded Cards */
                    <div className="p-4 space-y-3">
                      {returnsHistoryList.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-12">No past return vouchers found.</p>
                      ) : (
                        returnsHistoryList.map((ret) => {
                          const gRet = Number(ret.gross_return_amount ?? 0) || (Number(ret.total_refund_amount || 0) + Number(ret.total_exchange_amount || 0));
                          const exVal = Number(ret.total_exchange_amount || 0);
                          const netDiff = gRet - exVal;

                          return (
                            <div
                              key={ret.id}
                              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3 shadow-xs"
                            >
                              <div className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-sky-400 text-base">{ret.return_number}</span>
                                  <span className="text-xs text-[var(--text-muted)]">•</span>
                                  <span className="text-xs font-medium text-[var(--text-secondary)] font-mono">{ret.original_bill_number}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <div className={`font-mono font-black text-lg ${
                                      netDiff < 0 ? "text-emerald-400" : netDiff > 0 ? "text-rose-500" : "text-[var(--text-primary)]"
                                    }`}>
                                      {netDiff < 0 ? `+₹${Math.abs(netDiff).toFixed(2)}` : netDiff > 0 ? `-₹${netDiff.toFixed(2)}` : "₹0.00"}
                                    </div>
                                    <div className={`text-[10px] font-bold ${
                                      netDiff < 0 ? "text-emerald-400/80" : netDiff > 0 ? "text-rose-400/80" : "text-[var(--text-muted)]"
                                    }`}>
                                      {netDiff < 0 ? "Customer Paid" : netDiff > 0 ? "Refund Disbursed" : "Even Exchange"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "view", menuItemsMap)}
                                      className="inline-flex items-center gap-1 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-bold text-sky-400 hover:bg-sky-500/20 cursor-pointer"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      <span>View</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => generateReturnReceiptPDF(ret, restaurantName, restaurant, "download", menuItemsMap)}
                                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-sky-400 cursor-pointer"
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                      <span>Print</span>
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-between items-center text-xs text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                                <span>Customer: <strong className="text-[var(--text-primary)]">{ret.customer_name || "Walk-In"}</strong> {ret.customer_phone ? `(${ret.customer_phone})` : ""}</span>
                                <span>{parseUTCDate(ret.created_at).toLocaleString()}</span>
                              </div>

                              {/* Unrolled Returned Items */}
                              {Array.isArray(ret.returned_items) && ret.returned_items.length > 0 && (
                                <div className="rounded-xl bg-[var(--bg-surface)] p-2.5 border border-rose-500/20 text-xs space-y-1.5">
                                  <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider block">
                                    Returned Items ({ret.returned_items.length}):
                                  </span>
                                  <div className="divide-y divide-[var(--border-subtle)]">
                                    {ret.returned_items.map((item: any, i: number) => (
                                      <div key={i} className="flex justify-between items-center py-1 font-mono">
                                        <span className="text-[var(--text-primary)] font-bold font-sans">{item.item_name} × {item.quantity} {item.selected_unit || "pc"}</span>
                                        <span className="text-rose-400 font-black">₹{(item.line_refund ?? (Number(item.quantity || 0) * Number(item.unit_price || 0))).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Unrolled Exchange Items */}
                              {Array.isArray(ret.exchange_items) && ret.exchange_items.length > 0 && (
                                <div className="rounded-xl bg-[var(--bg-surface)] p-2.5 border border-sky-500/20 text-xs space-y-1.5">
                                  <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider block">
                                    Exchange Items Taken ({ret.exchange_items.length}):
                                  </span>
                                  <div className="divide-y divide-[var(--border-subtle)]">
                                    {ret.exchange_items.map((item: any, i: number) => {
                                      const lineAmt = item.line_total !== undefined ? Number(item.line_total) : (Number(item.quantity || 0) * Number(item.unit_price || 0));
                                      return (
                                        <div key={i} className="flex justify-between items-center py-1 font-mono">
                                          <span className="text-[var(--text-primary)] font-bold font-sans">{item.item_name} × {item.quantity} {item.selected_unit || "pc"}</span>
                                          <span className="text-sky-400 font-black">₹{lineAmt.toFixed(2)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Financial Settlement Footer Bar */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--text-muted)] text-[11px]">Payment Method:</span>
                                  <span className="font-bold text-[var(--text-primary)] text-[11px] px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                                    {ret.refund_payment_method || "CASH"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-mono">
                                  <span className="text-[var(--text-muted)]">Return: <strong className="text-rose-400 font-bold">₹{gRet.toFixed(2)}</strong></span>
                                  {exVal > 0 && <span className="text-[var(--text-muted)]">Exchange: <strong className="text-sky-400 font-bold">₹{exVal.toFixed(2)}</strong></span>}
                                  <span className="text-[var(--text-muted)]">
                                    Net:{" "}
                                    <strong className={netDiff < 0 ? "text-emerald-400 font-black" : netDiff > 0 ? "text-rose-400 font-black" : "text-[var(--text-primary)] font-black"}>
                                      {netDiff < 0 ? `+₹${Math.abs(netDiff).toFixed(2)} (Paid)` : netDiff > 0 ? `-₹${netDiff.toFixed(2)} (Refund)` : "₹0.00 (Even)"}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : !selectedBill ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-[var(--text-muted)] text-center space-y-2 py-16">
                <RotateCcw className="h-8 w-8 text-sky-400/60 animate-bounce" />
                <p className="font-semibold text-sm">Select a bill from the left to initiate Return or Exchange</p>
              </div>
            ) : (
              <div ref={rightScrollRef} className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1 scroll-smooth">
                {/* Header Block */}
                <div className="border-b border-[var(--border-subtle)] pb-3 flex justify-between items-center flex-shrink-0">
                  <div>
                    <span className="text-xs uppercase font-bold text-[var(--text-muted)] tracking-wider block">
                      Selected Original Bill
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono font-black text-sky-400 text-base">
                        #{selectedBill.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-[var(--text-muted)]">•</span>
                      {isCustomerLinked ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="font-bold text-[var(--text-primary)] text-sm">
                            {effectiveCustomerName || "Customer"} ({effectiveCustomerPhone})
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowPhonePrompt(true)}
                            className="text-xs text-sky-400 hover:text-sky-300 font-bold underline cursor-pointer ml-1"
                            title="Edit customer details"
                          >
                            Edit
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-muted)]">
                            Walk-In
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowPhonePrompt(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 hover:bg-sky-500/25 text-xs font-bold transition cursor-pointer"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>+ Link Customer</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-mono font-black text-[var(--text-primary)]">
                      Original Total: ₹{selectedBill.total_amount.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBill(null);
                        setReturnItemsMap({});
                        setReturnItemsUnitMap({});
                      }}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 border border-[var(--border-subtle)] hover:border-rose-500/30 transition cursor-pointer"
                      title="Deselect bill"
                    >
                      Deselect
                    </button>
                  </div>
                </div>

                {/* Line Items to select for return */}
                <div className="space-y-2.5">
                  <span className="text-sm font-black uppercase tracking-wider text-[var(--text-muted)] block">
                    Select Bill Items to Return:
                  </span>

                  {(selectedBill.items || []).map((item: any) => {
                    const retQty = returnItemsMap[item.id] || 0;
                    const origMenuItem = item.menu_item_id
                      ? menuItemsMap[item.menu_item_id]
                      : (activeCatalog || []).find((m: any) => m.name?.toLowerCase() === item.item_name?.toLowerCase());

                    const billedUnit = item.selected_unit || origMenuItem?.unit_label || "piece";
                    const currentUnit = returnItemsUnitMap[item.id] || billedUnit;

                    const billedPrice = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price) || 0;
                    const totalQty = typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity) || 1;
                    const returnedQty = typeof item.returned_quantity === "number" ? item.returned_quantity : parseFloat(item.returned_quantity) || 0;

                    const billedFactor = getUnitFactor(origMenuItem, billedUnit);
                    const currentFactor = getUnitFactor(origMenuItem, currentUnit);
                    const unitRatio = (billedFactor > 0 && currentFactor > 0) ? (currentFactor / billedFactor) : 1;

                    const effectiveUnitPrice = unitRatio > 0 ? billedPrice / unitRatio : billedPrice;
                    const effectiveTotalQty = Math.round(totalQty * unitRatio * 1000) / 1000;
                    const effectiveReturnedQty = Math.round(returnedQty * unitRatio * 1000) / 1000;
                    const maxQty = Math.round(Math.max(0, effectiveTotalQty - effectiveReturnedQty) * 1000) / 1000;
                    const isFullyReturned = maxQty <= 0;

                    // Available units list for selection
                    const availableUnits: string[] = [];
                    if (origMenuItem?.unit_label && !availableUnits.includes(origMenuItem.unit_label)) {
                      availableUnits.push(origMenuItem.unit_label);
                    }
                    if (billedUnit && !availableUnits.includes(billedUnit)) {
                      availableUnits.push(billedUnit);
                    }
                    if (origMenuItem?.alternate_units && Array.isArray(origMenuItem.alternate_units)) {
                      origMenuItem.alternate_units.forEach((au: any) => {
                        if (au?.unit_label && !availableUnits.includes(au.unit_label)) {
                          availableUnits.push(au.unit_label);
                        }
                      });
                    }
                    if (availableUnits.length === 0) availableUnits.push(billedUnit);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-4 flex items-center justify-between gap-4 text-sm transition shadow-xs ${
                          retQty > 0
                            ? "border-sky-500/50 bg-sky-500/15 ring-1 ring-sky-500/30"
                            : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                        } ${isFullyReturned ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        {/* Inline item info: name (+25% text-xl) + bought & max details on the SAME line */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1 flex-wrap">
                          <span className="text-xl font-black text-[var(--text-primary)] shrink-0">
                            {item.item_name}
                            {isFullyReturned && (
                              <span className="text-xs font-bold text-rose-400/80 ml-2 uppercase tracking-wider">(Fully Returned)</span>
                            )}
                          </span>
                          <span className="font-mono text-sm text-[var(--text-secondary)] font-medium flex items-center gap-2 shrink-0">
                            <span>₹{effectiveUnitPrice.toFixed(2)} / {currentUnit} × {effectiveTotalQty} {currentUnit} bought</span>
                            {effectiveReturnedQty > 0 && <span className="text-amber-400/80 font-bold">({effectiveReturnedQty} {currentUnit} returned)</span>}
                            <span className="text-[var(--border-strong)]">•</span>
                            <span className="text-sky-400 font-bold">Max Returnable: {maxQty} {currentUnit}</span>
                          </span>
                        </div>

                        {!isFullyReturned && (
                          <div className="flex items-center gap-3 shrink-0">
                            {/* Quantity steppers (+100% larger) */}
                            <div className="flex items-center gap-1.5">
                              {retQty > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleSubReturnItem(item.id, maxQty)}
                                  className="h-12 w-12 flex items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-sky-400 hover:text-sky-400 text-[var(--text-secondary)] transition cursor-pointer"
                                  title="Decrease return quantity"
                                >
                                  <Minus className="h-6 w-6" />
                                </button>
                              )}

                              <div className="relative">
                                <DecimalQtyInput
                                  value={retQty}
                                  min={0}
                                  max={maxQty}
                                  placeholder="0"
                                  onChange={(val) => handleSetReturnItemQty(item.id, val, maxQty)}
                                  className="w-24 h-12 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-center font-mono text-2xl font-black text-sky-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                                  title={`Enter quantity to return (Max available: ${maxQty})`}
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleToggleReturnItem(item.id, maxQty)}
                                className="h-12 w-12 flex items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-sky-400 hover:text-sky-400 text-[var(--text-secondary)] transition cursor-pointer"
                                title={`Increase return quantity (Max: ${maxQty})`}
                              >
                                <Plus className="h-6 w-6" />
                              </button>

                              {/* Unit Selector or Badge for Returned Item */}
                              {availableUnits.length > 1 ? (
                                <select
                                  value={currentUnit}
                                  onChange={(e) => {
                                    const newUnit = e.target.value;
                                    const oldFactor = getUnitFactor(origMenuItem, currentUnit);
                                    const newFactor = getUnitFactor(origMenuItem, newUnit);
                                    const switchRatio = (oldFactor > 0 && newFactor > 0) ? (newFactor / oldFactor) : 1;
                                    const newMaxQty = Math.round(maxQty * switchRatio * 1000) / 1000;

                                    setReturnItemsUnitMap((prev) => ({ ...prev, [item.id]: newUnit }));
                                    if (retQty > 0) {
                                      const newQty = Math.min(newMaxQty, Math.round(retQty * switchRatio * 1000) / 1000);
                                      setReturnItemsMap((prev) => ({ ...prev, [item.id]: newQty }));
                                    }
                                  }}
                                  className="h-12 text-sm font-bold bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl px-2.5 text-sky-400 focus:outline-none focus:border-sky-400 cursor-pointer"
                                  title="Change unit of return"
                                >
                                  {availableUnits.map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="h-12 flex items-center px-3 text-xs font-bold text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl uppercase tracking-wider">
                                  {currentUnit}
                                </span>
                              )}
                            </div>

                            {/* Line Return Amount (+100% larger) */}
                            <div className="w-28 text-right font-mono font-black text-2xl">
                              {retQty > 0 ? (
                                <span className="text-sky-400">₹{(retQty * effectiveUnitPrice).toFixed(2)}</span>
                              ) : (
                                <span className="text-[var(--text-muted)] opacity-30">₹0.00</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* --- EXCHANGE ITEMS SECTION (Collapsible) --- */}
                {(!showExchangeSection && exchangeItems.length === 0) ? (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExchangeSection(true);
                        setShowExchangePicker(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm font-black transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>+ Add Exchange / Replacement Item</span>
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-4 space-y-3.5 shadow-xs" ref={exchangePickerRef}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                        <span className="text-sm font-black uppercase tracking-wider text-[var(--text-primary)]">
                          Exchange / Replacement Items
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {exchangeItems.length > 0 && (
                          <span className="text-sm font-mono font-black text-emerald-400">
                            {exchangeItems.length} item{exchangeItems.length > 1 ? "s" : ""} • ₹{exchangeItemsTotal.toFixed(2)}
                          </span>
                        )}
                        {exchangeItems.length === 0 && (
                          <button
                            type="button"
                            onClick={() => setShowExchangeSection(false)}
                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Search / Add Item for Exchange */}
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          placeholder="Search items by name, barcode, or category to exchange..."
                          value={exchangeSearchQuery}
                          onChange={(e) => {
                            setExchangeSearchQuery(e.target.value);
                            setShowExchangePicker(true);
                          }}
                          onFocus={() => setShowExchangePicker(true)}
                          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-3 pl-10 pr-4 text-sm font-medium text-[var(--text-primary)] focus:border-emerald-400 outline-none"
                        />
                      </div>

                      {/* Autocomplete dropdown for exchange items */}
                      {showExchangePicker && (
                        <div className="absolute left-0 top-full mt-1.5 z-50 w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 shadow-2xl max-h-60 overflow-y-auto space-y-1">
                          {isLoadingCatalog ? (
                            <div className="py-4 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                              <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                              <span>Loading catalog items...</span>
                            </div>
                          ) : exchangeFilteredMenuItems.length === 0 ? (
                            <div className="py-4 text-center text-xs text-[var(--text-muted)] font-medium">
                              No items found matching "{exchangeSearchQuery}"
                            </div>
                          ) : (
                            exchangeFilteredMenuItems.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  handleAddExchangeItem(m);
                                  setExchangeSearchQuery("");
                                  setShowExchangePicker(false);
                                }}
                                className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-emerald-500/15 hover:border-emerald-500/30 border border-transparent flex items-center justify-between gap-3 transition cursor-pointer"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-[var(--text-primary)] truncate text-sm">{m.name}</p>
                                  <p className="text-xs text-[var(--text-muted)] font-mono">
                                    {(m as any).category_name || "General"} {m.unit_label ? `• per ${m.unit_label}` : ""}
                                    {m.barcode ? ` • ${m.barcode}` : ""}
                                  </p>
                                </div>
                                <span className="font-mono font-black text-emerald-400 text-sm shrink-0">
                                  ₹{Number(m.price || 0).toFixed(2)}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Exchange FIFO Notification Notice */}
                    {exchangeNotice && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 flex items-center justify-between">
                        <span>{exchangeNotice}</span>
                        <button type="button" onClick={() => setExchangeNotice(null)} className="text-emerald-400/80 hover:text-emerald-300">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Added Exchange Items List */}
                    {exchangeItems.length > 0 && (
                      <div className="space-y-2.5 pt-1.5 border-t border-[var(--border-subtle)]">
                        {exchangeItems.map((exItem, idx) => {
                          const originalItem = menuItems.find((m) => m.id === exItem.menu_item_id)
                            || (activeCatalog || []).find((m: any) => m.id === exItem.menu_item_id);
                          const hasAltUnits = originalItem && originalItem.alternate_units && (originalItem.alternate_units as any[]).length > 0;
                          const currentUnit = exItem.selected_unit || originalItem?.unit_label || "piece";

                          return (
                            <div
                              key={`ex-${idx}-${exItem.menu_item_id}-${exItem.selected_batch_id || "nobatch"}`}
                              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 flex items-center justify-between text-sm transition shadow-xs"
                            >
                              <div className="flex-1 min-w-0 pr-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-black text-[var(--text-primary)] truncate text-base">{exItem.item_name}</p>

                                  {/* Multi-batch Lot Selector & FIFO Badge */}
                                  {originalItem?.active_batches && originalItem.active_batches.length > 1 && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {(() => {
                                        if (exItem.allow_oversell) return null;
                                        const bIdx = originalItem.active_batches.findIndex((b) => b.id === exItem.selected_batch_id);
                                        const rank = bIdx >= 0 ? bIdx + 1 : 1;
                                        const isOldest = bIdx === 0;
                                        return (
                                          <span
                                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                              isOldest
                                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                : "bg-sky-500/15 text-sky-400 border-sky-500/30"
                                            }`}
                                            title={`FIFO Sequence Rank: #${rank} (${isOldest ? "Oldest active lot in inventory" : `Lot rank ${rank}`})`}
                                          >
                                            FIFO #{rank}{isOldest ? " · Oldest" : ""}
                                          </span>
                                        );
                                      })()}
                                      {exItem.allow_oversell ? (
                                        <span
                                          className="inline-flex items-center gap-1 text-[11px] font-mono rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-400 font-semibold"
                                          title="Oversold Backorder"
                                        >
                                          Backorder · {exItem.selected_batch_number ? `Lot #${exItem.selected_batch_number}` : "Latest Lot"}
                                        </span>
                                      ) : (
                                        <select
                                          value={exItem.selected_batch_id || (originalItem.active_batches[0]?.id ?? "")}
                                          onChange={(e) => {
                                            const chosenBatch = originalItem.active_batches?.find((b) => b.id === e.target.value);
                                            if (!chosenBatch) return;

                                            const factor = getUnitFactor(originalItem, exItem.selected_unit);
                                            const baseBatchPrice = chosenBatch.retail_price != null
                                              ? Number(chosenBatch.retail_price)
                                              : (exItem.base_unit_price ?? exItem.unit_price);
                                            const baseBatchMrp = chosenBatch.mrp != null
                                              ? Number(chosenBatch.mrp)
                                              : (exItem.base_mrp ?? exItem.mrp ?? baseBatchPrice);

                                            const newPrice = factor > 0 ? baseBatchPrice / factor : baseBatchPrice;
                                            const newMrp = factor > 0 ? Math.max(baseBatchMrp / factor, newPrice) : Math.max(baseBatchMrp, newPrice);

                                            setExchangeItems((prev) =>
                                              prev.map((item, i) => {
                                                if (i !== idx) return item;
                                                return {
                                                  ...item,
                                                  selected_batch_id: chosenBatch.id,
                                                  selected_batch_number: chosenBatch.batch_number,
                                                  unit_price: newPrice,
                                                  base_unit_price: baseBatchPrice,
                                                  mrp: newMrp,
                                                  base_mrp: baseBatchMrp,
                                                  allow_oversell: false,
                                                };
                                              })
                                            );
                                            const effectiveStock = Number(chosenBatch.remaining_quantity) || 0;
                                            const avail = getUnallocatedBatchStock(chosenBatch.id, effectiveStock, exchangeItems, idx);
                                            if (exItem.quantity > avail) {
                                              setTimeout(() => {
                                                handleExchangeItemQuantityChange(idx, exItem.quantity);
                                              }, 0);
                                            }
                                          }}
                                          className="text-[11px] font-mono rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-secondary)] hover:border-emerald-500 focus:outline-none cursor-pointer"
                                          title="Select Inventory Lot"
                                        >
                                          {originalItem.active_batches.map((b, optIdx) => {
                                            const effectiveStock = Number(b.remaining_quantity) || 0;
                                            const unallocated = getUnallocatedBatchStock(b.id, effectiveStock, exchangeItems, idx);
                                            const factor = getUnitFactor(originalItem, exItem.selected_unit);
                                            const bBasePrice = Number(b.retail_price ?? originalItem.price);
                                            const bDisplayPrice = factor > 0 ? bBasePrice / factor : bBasePrice;
                                            return (
                                              <option key={b.id} value={b.id}>
                                                #{optIdx + 1} · Lot: {b.batch_number} · ₹{bDisplayPrice.toFixed(2)} ({unallocated} left){b.is_oldest ? " (oldest)" : ""}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      )}
                                    </div>
                                  )}

                                  {/* Single-batch item indicator */}
                                  {originalItem?.active_batches && originalItem.active_batches.length === 1 && (() => {
                                    const singleBatch = originalItem.active_batches[0];
                                    const effectiveStock = Number(singleBatch.remaining_quantity) || 0;
                                    const unallocated = getUnallocatedBatchStock(singleBatch.id, effectiveStock, exchangeItems, idx);
                                    return (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                                          Lot #{singleBatch.batch_number} ({unallocated} left)
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <p className="font-mono text-sm text-[var(--text-secondary)] font-medium mt-0.5">
                                  ₹{exItem.unit_price.toFixed(2)} per {currentUnit}
                                </p>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateExchangeItemQty(idx, exItem.quantity - 1)}
                                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-emerald-400 text-[var(--text-secondary)] transition cursor-pointer"
                                    title="Decrease exchange quantity"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>

                                  <DecimalQtyInput
                                    value={exItem.quantity}
                                    min={0.001}
                                    placeholder="1"
                                    onChange={(val) => handleUpdateExchangeItemQty(idx, val)}
                                    onRemove={() => handleRemoveExchangeItem(idx)}
                                    className="w-20 h-9 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-1.5 text-center font-mono text-base font-black text-emerald-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                                    title="Editable exchange quantity (supports decimals)"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => handleUpdateExchangeItemQty(idx, exItem.quantity + 1)}
                                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-emerald-400 text-[var(--text-secondary)] transition cursor-pointer"
                                    title="Increase exchange quantity"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>

                                  {/* Unit Selector or Badge */}
                                  {hasAltUnits ? (
                                    <select
                                      value={currentUnit}
                                      onChange={(e) => {
                                        const newUnit = e.target.value;
                                        const factor = getUnitFactor(originalItem, newUnit);
                                        const basePrice = exItem.base_unit_price ?? exItem.unit_price;
                                        const baseMrp = exItem.base_mrp ?? exItem.mrp ?? basePrice;
                                        const newPrice = factor > 0 ? basePrice / factor : basePrice;
                                        const newMrp = factor > 0 ? Math.max(baseMrp / factor, newPrice) : Math.max(baseMrp, newPrice);

                                        setExchangeItems((prev) =>
                                          prev.map((item, i) =>
                                            i === idx ? {
                                              ...item,
                                              selected_unit: newUnit,
                                              unit_price: newPrice,
                                              mrp: newMrp,
                                              base_unit_price: basePrice,
                                              base_mrp: baseMrp,
                                            } : item
                                          )
                                        );
                                      }}
                                      className="h-9 text-xs font-bold bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl px-2 text-[var(--text-primary)] focus:outline-none focus:border-emerald-400 cursor-pointer"
                                      title="Change exchange unit"
                                    >
                                      <option value={originalItem.unit_label || "piece"}>{originalItem.unit_label || "piece"}</option>
                                      {(originalItem.alternate_units as any[]).map((au: any) => (
                                        <option key={au.unit_label} value={au.unit_label}>{au.unit_label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="h-9 flex items-center text-xs font-bold text-[var(--text-secondary)] px-2.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl uppercase tracking-wider">
                                      {currentUnit}
                                    </span>
                                  )}
                                </div>

                                <span className="font-mono font-black text-base w-24 text-right text-[var(--text-primary)]">
                                  ₹{(exItem.quantity * exItem.unit_price).toFixed(2)}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveExchangeItem(idx)}
                                  className="text-[var(--text-muted)] hover:text-rose-400 p-2 rounded-xl hover:bg-rose-500/15 transition cursor-pointer"
                                  title="Remove exchange item"
                                >
                                  <X className="h-4.5 w-4.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Return Reason & Refund Method */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Return Reason</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-3.5 text-sm font-bold text-[var(--text-primary)] focus:border-sky-400 outline-none"
                    >
                      <option value="DEFECTIVE_PRODUCT">Defective / Damaged</option>
                      <option value="EXPIRED_ITEM">Expired Item</option>
                      <option value="WRONG_ITEM">Wrong Item Purchased</option>
                      <option value="CUSTOMER_CHANGE_OF_MIND">Customer Changed Mind</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Refund Method</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2.5 px-3.5 text-sm font-bold text-[var(--text-primary)] focus:border-sky-400 outline-none"
                    >
                      <option value="CASH">Cash Refund</option>
                      <option value="UPI">UPI Refund</option>
                      <option value="STORE_CREDIT">Store Credit Voucher</option>
                    </select>
                  </div>
                </div>

                {/* Store Credit Voucher Explanation Banner */}
                {refundMethod === "STORE_CREDIT" && (
                  <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4 space-y-2.5 text-sm shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-sky-400 text-sm">
                      <Wallet className="h-5 w-5" />
                      <span>Store Credit Voucher Selected</span>
                    </div>
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                      No cash will be dispensed from the cash drawer. The net refund amount of{" "}
                      <span className="font-mono font-bold text-sky-400">₹{rawRefundOwed.toFixed(2)}</span> will be safely deposited into the customer's store credit wallet.
                    </p>
                    {customerAnalytics && customerAnalytics.credit_balance < 0 && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
                        <div>
                          <p className="font-bold">Automatic Debt Clearance:</p>
                          <p>
                            Customer has an outstanding debt of ₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)}.{" "}
                            {rawRefundOwed <= Math.abs(customerAnalytics.credit_balance) ? (
                              <>₹{rawRefundOwed.toFixed(2)} will be used to clear existing debt (remaining debt: ₹{(Math.abs(customerAnalytics.credit_balance) - rawRefundOwed).toFixed(2)}).</>
                            ) : (
                              <>₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)} will completely clear the debt, and remaining ₹{(rawRefundOwed - Math.abs(customerAnalytics.credit_balance)).toFixed(2)} will be added as positive Store Credit.</>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {!isCustomerLinked && (
                      <p className="text-rose-400 font-bold text-xs flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" />
                        Please enter customer mobile number above to issue Store Credit.
                      </p>
                    )}
                  </div>
                )}

                {/* Denomination Note Tapping Section (CASH Mode) */}
                {refundMethod === "CASH" && (
                  <div ref={cashSectionRef} className="pt-2 border-t border-[var(--border-subtle)] space-y-4">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Outward Cash Section (Cash Given to Customer) */}
                      <div
                        ref={outwardDeckRef}
                        onClick={() => {
                          setActiveCashDeck("OUTWARD");
                          scrollToCashDeck("OUTWARD");
                        }}
                        className={`rounded-2xl border p-4 space-y-3 shadow-xs transition-all cursor-pointer ${
                          activeCashDeck === "OUTWARD"
                            ? "border-sky-500 ring-2 ring-sky-500/50 bg-sky-500/5 shadow-sky-500/10 shadow-lg"
                            : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] opacity-75 hover:opacity-100"
                        }`}
                      >
                        <div className="flex justify-between items-center text-sm font-black uppercase tracking-wider">
                          <span className="flex items-center gap-2 text-[var(--text-primary)]">
                            {isNetRefund ? "Refund Given (Outward)" : "Change Given Back (Outward)"}
                            {activeCashDeck === "OUTWARD" ? (
                              <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/15 border border-sky-500/40 px-2 py-0.5 rounded-md animate-pulse">
                                kbd active [space ⇄]
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                                click or [space]
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-base font-black text-sky-400">Total: ₹{refundDenomTotal}</span>
                        </div>

                        {remainingNeededOutward > 0 ? (
                          <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-xl py-2 px-3.5 border border-[var(--border-strong)]">
                            <span className="font-mono text-sm font-bold text-[var(--text-secondary)]">
                              Need <span className="text-xl font-black text-sky-400">₹{remainingNeededOutward.toFixed(2)}</span> more
                            </span>
                            {hasDecimalOutward && (
                              <button
                                type="button"
                                onClick={() => setIsRoundOffActive(prev => !prev)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black font-mono transition flex items-center gap-1 shadow-xs cursor-pointer ${
                                  isRoundOffActive
                                    ? "bg-amber-500 text-slate-950 font-black ring-2 ring-amber-500/40"
                                    : "bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25"
                                }`}
                                title="Round off net return sum to nearest rupee"
                              >
                                <span>⚡ {isRoundOffActive ? `Rounded: ₹${roundedTargetOutward.toFixed(2)}` : `Round Off (${deltaLabelOutward})`}</span>
                              </button>
                            )}
                          </div>
                        ) : targetRefundAmt > 0 && refundDenomTotal > 0 && (refundDenomTotal - inwardDenomTotal === targetRefundAmt) ? (
                          <div className="flex items-center justify-between bg-emerald-500/15 rounded-xl py-2 px-3.5 border border-emerald-500/40 text-emerald-300 animate-in fade-in duration-200">
                            <span className="font-mono text-sm font-black flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                              <span>Net Dispense Satisfied: <span className="text-xl font-black text-emerald-200">₹{targetRefundAmt.toFixed(2)}</span></span>
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-500/30">
                              Exact Change ✓
                            </span>
                          </div>
                        ) : null}

                        {/* Quick Auto-Tap Shortcuts Bar */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                          <span className="text-xs uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                            Quick Auto-Tap:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAutoTapOutwardExact(targetRefundAmt)}
                            className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-mono font-black text-sky-400 hover:border-sky-400 hover:bg-sky-500/10 transition whitespace-nowrap cursor-pointer"
                            title="Auto-fill exact note breakdown"
                          >
                            Exact ₹{targetRefundAmt.toFixed(2)}
                          </button>
                          {smallestSingleNoteForOutward && (
                            <button
                              type="button"
                              onClick={() => handleAutoTapOutwardExact(smallestSingleNoteForOutward)}
                              className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-mono font-black text-[var(--text-primary)] hover:border-sky-400 hover:text-sky-400 transition whitespace-nowrap cursor-pointer"
                              title={`Auto-fill single ₹${smallestSingleNoteForOutward} note`}
                            >
                              1× ₹{smallestSingleNoteForOutward} Note
                            </button>
                          )}
                          {hasDecimalOutward && (
                            <button
                              type="button"
                              onClick={() => setIsRoundOffActive(prev => !prev)}
                              className={`rounded-xl px-2.5 py-1 text-xs font-mono font-black transition whitespace-nowrap cursor-pointer ${
                                isRoundOffActive
                                  ? "bg-amber-500 text-slate-950 font-black"
                                  : "border border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                              }`}
                            >
                              ⚡ {isRoundOffActive ? "Rounded Active" : `Round Off (${deltaLabelOutward})`}
                            </button>
                          )}
                        </div>

                        {/* 3x3 Grid */}
                        <div className="grid grid-cols-3 gap-2.5">
                          {DENOMINATIONS.map((d) => {
                            const isSmartHighlight = smartHighlightedDenoms.has(d);
                            const count = refundCashDenoms[d] || 0;
                            return (
                              <div
                                key={`outward-${d}`}
                                className={`relative rounded-xl flex font-mono transition font-black border-2 ${
                                  count > 0
                                    ? "border-sky-500 bg-sky-500 text-white ring-2 ring-sky-500/30 shadow-md"
                                    : isSmartHighlight
                                      ? "border-sky-500 bg-sky-500/10 text-sky-400 ring-2 ring-sky-500/50 shadow-sm scale-[1.02] hover:bg-sky-500/20"
                                      : activeCashDeck === "OUTWARD"
                                        ? "border-sky-500/50 bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-sky-400 hover:bg-sky-500/10"
                                        : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-70 hover:opacity-100 hover:border-[var(--text-muted)]"
                                }`}
                              >
                                {count > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRefundDenomChange(d, -1);
                                    }}
                                    className="flex items-center justify-center px-2 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md cursor-pointer"
                                    title={`Remove 1× ₹${d} (Shift+${DENOM_KEY_MAP[d]})`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRefundDenomChange(d, 1)}
                                  className="flex-1 py-3 px-2 text-center text-lg cursor-pointer flex items-center justify-center gap-1.5"
                                  title={`Add 1× ₹${d} (Numpad ${DENOM_KEY_MAP[d]})`}
                                >
                                  <span className="text-[11px] font-mono font-medium opacity-50 px-1 py-0.5 rounded bg-black/15 border border-white/10">
                                    {DENOM_KEY_MAP[d]}
                                  </span>
                                  <span>₹{d}</span>
                                </button>
                                {count > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-950 text-white text-xs font-black border border-white pointer-events-none shadow-md">
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Active Breakdown Chips */}
                        {activeOutwardNotesList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                            <span className="text-xs uppercase font-bold text-[var(--text-muted)] mr-1">
                              Breakdown:
                            </span>
                            {activeOutwardNotesList.map(([denomStr, count]) => {
                              const denomNum = Number(denomStr);
                              return (
                                <span
                                  key={`outward-chip-${denomStr}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-1 text-xs font-mono font-bold text-[var(--text-primary)]"
                                >
                                  ₹{denomStr} × {count}
                                  <button
                                    type="button"
                                    onClick={() => handleRefundDenomChange(denomNum, -1)}
                                    className="ml-0.5 text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                            <button
                              type="button"
                              onClick={handleResetOutwardNotes}
                              className="ml-auto text-xs font-bold text-rose-400 hover:underline cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inward Cash Section (Cash Received from Customer) */}
                      <div
                        ref={inwardDeckRef}
                        onClick={() => {
                          setActiveCashDeck("INWARD");
                          scrollToCashDeck("INWARD");
                        }}
                        className={`rounded-2xl border p-4 space-y-3 shadow-xs transition-all cursor-pointer ${
                          activeCashDeck === "INWARD"
                            ? "border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-500/5 shadow-emerald-500/10 shadow-lg"
                            : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] opacity-75 hover:opacity-100"
                        }`}
                      >
                        <div className="flex justify-between items-center text-sm font-black uppercase tracking-wider">
                          <span className="flex items-center gap-2 text-[var(--text-primary)]">
                            {isNetRefund ? "Change / Cash Received (Inward)" : "Cash Received from Customer (Inward)"}
                            {activeCashDeck === "INWARD" ? (
                              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 rounded-md animate-pulse">
                                kbd active [space ⇄]
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                                click or [space]
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-base font-black text-emerald-400">Total: ₹{inwardDenomTotal}</span>
                        </div>

                        {remainingNeededInward > 0 ? (
                          <div className="flex items-center justify-between bg-[var(--bg-surface)] rounded-xl py-2 px-3.5 border border-[var(--border-strong)]">
                            <span className="font-mono text-sm font-bold text-[var(--text-secondary)]">
                              Need <span className="text-xl font-black text-emerald-400">₹{remainingNeededInward.toFixed(2)}</span> more
                            </span>
                            {hasDecimalInward && (
                              <button
                                type="button"
                                onClick={() => setIsRoundOffActive(prev => !prev)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black font-mono transition flex items-center gap-1 shadow-xs cursor-pointer ${
                                  isRoundOffActive
                                    ? "bg-amber-500 text-slate-950 font-black ring-2 ring-amber-500/40"
                                    : "bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25"
                                }`}
                                title="Round off net exchange collection to nearest rupee"
                              >
                                <span>⚡ {isRoundOffActive ? `Rounded: ₹${roundedTargetInward.toFixed(2)}` : `Round Off (${deltaLabelInward})`}</span>
                              </button>
                            )}
                          </div>
                        ) : targetCollectionAmt > 0 && inwardDenomTotal > 0 && (inwardDenomTotal - refundDenomTotal === targetCollectionAmt) ? (
                          <div className="flex items-center justify-between bg-emerald-500/15 rounded-xl py-2 px-3.5 border border-emerald-500/40 text-emerald-300 animate-in fade-in duration-200">
                            <span className="font-mono text-sm font-black flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                              <span>Net Collection Satisfied: <span className="text-xl font-black text-emerald-200">₹{targetCollectionAmt.toFixed(2)}</span></span>
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-500/30">
                              Exact Cash ✓
                            </span>
                          </div>
                        ) : null}

                        {/* Quick Auto-Tap Shortcuts Bar */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                          <span className="text-xs uppercase font-bold text-[var(--text-muted)] whitespace-nowrap">
                            Quick Auto-Tap:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAutoTapInwardExact(targetCollectionAmt > 0 ? targetCollectionAmt : remainingNeededInward)}
                            className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-mono font-black text-emerald-400 hover:border-emerald-400 hover:bg-emerald-500/10 transition whitespace-nowrap cursor-pointer"
                            title="Auto-fill exact note breakdown"
                          >
                            Exact ₹{(targetCollectionAmt > 0 ? targetCollectionAmt : remainingNeededInward).toFixed(2)}
                          </button>
                          {smallestSingleNoteForInward && (
                            <button
                              type="button"
                              onClick={() => handleAutoTapInwardExact(smallestSingleNoteForInward)}
                              className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-mono font-black text-[var(--text-primary)] hover:border-emerald-400 hover:text-emerald-400 transition whitespace-nowrap cursor-pointer"
                              title={`Auto-fill single ₹${smallestSingleNoteForInward} note`}
                            >
                              1× ₹{smallestSingleNoteForInward} Note
                            </button>
                          )}
                          {hasDecimalInward && (
                            <button
                              type="button"
                              onClick={() => setIsRoundOffActive(prev => !prev)}
                              className={`rounded-xl px-2.5 py-1 text-xs font-mono font-black transition whitespace-nowrap cursor-pointer ${
                                isRoundOffActive
                                  ? "bg-amber-500 text-slate-950 font-black"
                                  : "border border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                              }`}
                            >
                              ⚡ {isRoundOffActive ? "Rounded Active" : `Round Off (${deltaLabelInward})`}
                            </button>
                          )}
                        </div>

                        {/* 3x3 Grid */}
                        <div className="grid grid-cols-3 gap-2.5">
                          {DENOMINATIONS.map((d) => {
                            const isSmartHighlight = smartHighlightedInwardDenoms.has(d);
                            const count = inwardCashDenoms[d] || 0;
                            return (
                              <div
                                key={`inward-${d}`}
                                className={`relative rounded-xl flex font-mono transition font-black border-2 ${
                                  count > 0
                                    ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-500/30 shadow-md"
                                    : isSmartHighlight
                                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-2 ring-emerald-500/50 shadow-sm scale-[1.02] hover:bg-emerald-500/20"
                                      : activeCashDeck === "INWARD"
                                        ? "border-emerald-500/50 bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-emerald-400 hover:bg-emerald-500/10"
                                        : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] opacity-70 hover:opacity-100 hover:border-[var(--text-muted)]"
                                }`}
                              >
                                {count > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInwardDenomChange(d, -1);
                                    }}
                                    className="flex items-center justify-center px-2 hover:bg-black/20 transition-colors border-r border-white/20 rounded-l-md cursor-pointer"
                                    title={`Remove 1× ₹${d} (Shift+${DENOM_KEY_MAP[d]})`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleInwardDenomChange(d, 1)}
                                  className="flex-1 py-3 px-2 text-center text-lg cursor-pointer flex items-center justify-center gap-1.5"
                                  title={`Add 1× ₹${d} (Numpad ${DENOM_KEY_MAP[d]})`}
                                >
                                  <span className="text-[11px] font-mono font-medium opacity-50 px-1 py-0.5 rounded bg-black/15 border border-white/10">
                                    {DENOM_KEY_MAP[d]}
                                  </span>
                                  <span>₹{d}</span>
                                </button>
                                {count > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-950 text-white text-xs font-black border border-white pointer-events-none shadow-md">
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Active Breakdown Chips */}
                        {activeInwardNotesList.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                            <span className="text-xs uppercase font-bold text-[var(--text-muted)] mr-1">
                              Breakdown:
                            </span>
                            {activeInwardNotesList.map(([denomStr, count]) => {
                              const denomNum = Number(denomStr);
                              return (
                                <span
                                  key={`inward-chip-${denomStr}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] px-2 py-1 text-xs font-mono font-bold text-[var(--text-primary)]"
                                >
                                  ₹{denomStr} × {count}
                                  <button
                                    type="button"
                                    onClick={() => handleInwardDenomChange(denomNum, -1)}
                                    className="ml-0.5 text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                            <button
                              type="button"
                              onClick={handleResetInwardNotes}
                              className="ml-auto text-xs font-bold text-rose-400 hover:underline cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Balance Card */}
                <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 space-y-2.5 text-sm font-mono shadow-xs">
                  <div className="flex justify-between items-center text-[var(--text-secondary)]">
                    <span>Return Items Total:</span>
                    <span className="font-bold text-base text-sky-400">₹{returnCreditTotal.toFixed(2)}</span>
                  </div>
                  {exchangeItemsTotal > 0 && (
                    <div className="flex justify-between items-center text-[var(--text-secondary)]">
                      <span>Exchange Items Total:</span>
                      <span className="font-bold text-base text-[var(--text-primary)]">₹{exchangeItemsTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[var(--text-secondary)]">
                    <span>Net Transaction Base:</span>
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-base text-[var(--text-primary)]">
                        {isNetRefund ? `Refund Owed: ₹${rawRefundOwed.toFixed(2)}` : `Payable by Customer: ₹${rawAdditionalPayable.toFixed(2)}`}
                      </span>
                      {hasDecimal && (
                        <button
                          type="button"
                          onClick={() => setIsRoundOffActive(prev => !prev)}
                          className={`rounded-xl px-2.5 py-1 text-xs font-mono font-black transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                            isRoundOffActive
                              ? "bg-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-400"
                              : "border border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                          }`}
                          title="Toggle round off to nearest rupee"
                        >
                          ⚡ {isRoundOffActive ? `Rounded: ₹${(isNetRefund ? roundedTargetOutward : roundedTargetInward).toFixed(2)}` : `Round Off (${isNetRefund ? deltaLabelOutward : deltaLabelInward})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Wallet Adjustments in Breakdown */}
                  {refundDebtToSettle > 0 && (
                    <div className="flex justify-between text-emerald-400 text-xs font-bold">
                      <span>Less Debt Settled from Refund:</span>
                      <span>-₹{refundDebtToSettle.toFixed(2)}</span>
                    </div>
                  )}
                  {cashedOutCredit > 0 && (
                    <div className="flex justify-between text-amber-400 text-xs font-bold">
                      <span>Add Store Credit Cash-Out:</span>
                      <span>+₹{cashedOutCredit.toFixed(2)}</span>
                    </div>
                  )}
                  {appliedCredit > 0 && (
                    <div className="flex justify-between text-emerald-400 text-xs font-bold">
                      <span>Less Store Credit Applied:</span>
                      <span>-₹{appliedCredit.toFixed(2)}</span>
                    </div>
                  )}
                  {isRoundOffActive && Math.abs(activeRoundOff) > 0.001 && (
                    <div className="flex justify-between text-amber-400 text-xs font-bold">
                      <span>Round Off Adjustment:</span>
                      <span>{activeRoundOff > 0 ? "+" : ""}₹{activeRoundOff.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Live Net Cash Tapped Status */}
                  {refundMethod === "CASH" && (refundDenomTotal > 0 || inwardDenomTotal > 0) && (
                    <div className="flex justify-between items-center text-sm border-t border-[var(--border-subtle)] pt-2 font-bold font-mono">
                      <span className="text-[var(--text-secondary)]">
                        {isNetRefund ? "Net Cash Dispensed (Out - In):" : "Net Cash Received (In - Out):"}
                      </span>
                      {netSatisfactionStatus.isSatisfied && (netSatisfactionStatus.reason === "EXACT_CASH" || netSatisfactionStatus.reason === "BALANCED_CREDIT" || netSatisfactionStatus.reason === "BALANCED_DEBT") ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-black text-base font-mono">
                            ₹{Math.abs(refundDenomTotal - inwardDenomTotal).toFixed(2)}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-in fade-in">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Satisfied
                          </span>
                        </div>
                      ) : (
                        <span className="text-amber-400 font-black text-base font-mono">
                          ₹{Math.abs(refundDenomTotal - inwardDenomTotal).toFixed(2)}
                          {isNetRefund && (refundDenomTotal - inwardDenomTotal !== targetRefundAmt) && (
                            <span className="text-xs font-semibold text-amber-400/80 ml-1.5 font-sans">
                              ({refundDenomTotal - inwardDenomTotal > targetRefundAmt ? `₹${(refundDenomTotal - inwardDenomTotal - targetRefundAmt).toFixed(2)} extra given` : `₹${(targetRefundAmt - (refundDenomTotal - inwardDenomTotal)).toFixed(2)} short`})
                            </span>
                          )}
                          {!isNetRefund && (inwardDenomTotal - refundDenomTotal !== targetCollectionAmt) && (
                            <span className="text-xs font-semibold text-amber-400/80 ml-1.5 font-sans">
                              ({inwardDenomTotal - refundDenomTotal > targetCollectionAmt ? `₹${(inwardDenomTotal - refundDenomTotal - targetCollectionAmt).toFixed(2)} extra paid` : `₹${(targetCollectionAmt - (inwardDenomTotal - refundDenomTotal)).toFixed(2)} short`})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-[var(--border-subtle)] pt-2.5 font-bold font-sans">
                    <span className="text-[var(--text-primary)] text-sm">
                      {refundMethod === "STORE_CREDIT"
                        ? "Total Store Credit Awarded:"
                        : isNetRefund
                        ? "Net Cash to Dispense to Customer:"
                        : "Net Cash to Collect from Customer:"}
                    </span>
                    <span className={`font-mono text-2xl font-black transition-colors ${
                      netSatisfactionStatus.isSatisfied ? "text-emerald-400" : "text-sky-400"
                    }`}>
                      ₹{refundMethod === "STORE_CREDIT"
                        ? rawRefundOwed.toFixed(2)
                        : isNetRefund
                        ? targetRefundAmt.toFixed(2)
                        : targetCollectionAmt.toFixed(2)}
                    </span>
                  </div>

                  {/* Visual Status Indicator: Visible as soon as net is satisfied */}
                  {netSatisfactionStatus.isSatisfied ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 animate-in fade-in duration-200 shadow-sm mt-1">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-slate-950 font-black">
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                        <div>
                          <span className="font-bold text-sm block text-emerald-200 leading-tight">
                            Net Transaction Satisfied
                          </span>
                          <span className="text-xs text-emerald-300/80 block font-mono">
                            {netSatisfactionStatus.label}
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 text-xs font-black tracking-wider uppercase flex items-center gap-1">
                        Ready ↵
                      </span>
                    </div>
                  ) : (
                    refundMethod === "CASH" && (refundDenomTotal > 0 || inwardDenomTotal > 0) && (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono mt-1">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            {netSatisfactionStatus.reason === "CASH_SHORT"
                              ? `Cash ${isNetRefund ? "refund" : "payment"} short by ₹${netSatisfactionStatus.diff?.toFixed(2)}`
                              : netSatisfactionStatus.reason === "CASH_EXTRA"
                              ? `Extra ₹${netSatisfactionStatus.diff?.toFixed(2)} cash given`
                              : netSatisfactionStatus.label}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* --- CUSTOMER WALLET & CASH ADJUSTMENTS --- */}
                {isCustomerLinked && customerAnalytics && (
                  <div className="space-y-3 mt-3 border-t border-[var(--border-subtle)] pt-3">
                    {/* Live Wallet Balance UI */}
                    {(() => {
                      let projectedBalance = customerAnalytics.credit_balance || 0;

                      if (refundMethod === "STORE_CREDIT") {
                        const debt = customerAnalytics.credit_balance < 0 ? Math.abs(customerAnalytics.credit_balance) : 0;
                        if (debt > 0) {
                          const settled = Math.min(rawRefundOwed, debt);
                          const added = Math.max(0, rawRefundOwed - debt);
                          projectedBalance = -debt + settled + added;
                        } else {
                          projectedBalance += rawRefundOwed;
                        }
                      } else if (isNetRefund) {
                        if (refundDebtToSettle > 0) {
                          projectedBalance += refundDebtToSettle;
                        }
                        if (cashedOutCredit > 0) {
                          projectedBalance -= cashedOutCredit;
                        }
                        if (refundMethod === "CASH") {
                          const netCashGiven = refundDenomTotal - inwardDenomTotal;
                          if (netCashGiven < targetRefundAmt && autoConvertCredit) {
                            projectedBalance += (targetRefundAmt - netCashGiven);
                          } else if (netCashGiven > targetRefundAmt && autoRecordExtraChangeAsDebt) {
                            projectedBalance -= (netCashGiven - targetRefundAmt);
                          }
                        }
                      } else {
                        if (appliedCredit > 0) {
                          projectedBalance -= appliedCredit;
                        }
                        if (payableDebtToAdd > 0 && settleDebit) {
                          projectedBalance += payableDebtToAdd;
                        }
                        if (refundMethod === "CASH") {
                          const netCashPaid = inwardDenomTotal - refundDenomTotal;
                          if (netCashPaid < targetCollectionAmt && autoRecordDebitOnShortfall) {
                            projectedBalance -= (targetCollectionAmt - netCashPaid);
                          } else if (netCashPaid > targetCollectionAmt) {
                            const extra = netCashPaid - targetCollectionAmt;
                            if (autoConvertCredit) projectedBalance += extra;
                          }
                        }
                      }

                      const isModified = Math.abs(projectedBalance - (customerAnalytics.credit_balance || 0)) > 0.001;

                      return (
                        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3.5 flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-3">
                            <Wallet className="h-5 w-5 text-sky-400" />
                            <div>
                              <span className="text-sm font-bold text-[var(--text-primary)] block">
                                Customer Wallet
                              </span>
                              <span className="text-xs text-[var(--text-muted)] font-mono font-medium">
                                {customerAnalytics.customer_name || effectiveCustomerName || "Customer"} • {customerAnalytics.customer_phone || effectiveCustomerPhone}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-[var(--text-muted)] font-bold mb-0.5">
                              {isModified ? "Projected Balance After Return:" : "Current Balance:"}
                            </div>
                            {projectedBalance > 0.001 ? (
                              <span className={`font-mono text-base font-black transition-colors ${isModified ? "text-amber-400" : "text-emerald-400"}`}>
                                ₹{projectedBalance.toFixed(2)} <span className={`text-xs font-bold ${isModified ? "text-amber-400/80" : "text-emerald-500/80"}`}>(Cr)</span>
                              </span>
                            ) : projectedBalance < -0.001 ? (
                              <span className={`font-mono text-base font-black transition-colors ${isModified ? "text-amber-400" : "text-rose-400"}`}>
                                -₹{Math.abs(projectedBalance).toFixed(2)} <span className={`text-xs font-bold ${isModified ? "text-amber-400/80" : "text-rose-500/80"}`}>(Dr / Udhaar)</span>
                              </span>
                            ) : (
                              <span className={`font-mono text-base font-black transition-colors ${isModified ? "text-amber-400" : "text-[var(--text-muted)]"}`}>
                                ₹0.00
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Options when Refund Method is NOT Store Credit */}
                    {refundMethod !== "STORE_CREDIT" && (
                      <div className="space-y-2.5">
                        {/* NET REFUND CASES */}
                        {isNetRefund ? (
                          <>
                            {/* Case A: Customer has debt, allow settling debt from refund */}
                            {customerAnalytics.credit_balance < 0 && (
                              <label className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/15 transition">
                                <input
                                  type="checkbox"
                                  checked={settleDebit}
                                  onChange={(e) => setSettleDebit(e.target.checked)}
                                  className="mt-1 h-4 w-4 rounded accent-emerald-500"
                                />
                                <div className="space-y-0.5">
                                  <span className="text-sm font-bold text-emerald-400 block">
                                    Settle ₹{Math.min(rawRefundOwed, Math.abs(customerAnalytics.credit_balance)).toFixed(2)} of existing Debt (Udhaar)
                                  </span>
                                  <span className="text-xs text-emerald-400/90 font-medium block">
                                    Deduct up to outstanding debt from the refund amount instead of giving cash.
                                  </span>
                                </div>
                              </label>
                            )}

                            {/* Case B: Customer has store credit, allow cashing out */}
                            {customerAnalytics.credit_balance > 0 && (
                              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-3 flex items-center justify-between gap-3 border border-[var(--border-strong)]">
                                <span className="font-bold text-[var(--text-secondary)] text-xs uppercase tracking-wider">Cash Out Store Credit:</span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max={customerAnalytics.credit_balance}
                                    value={creditCashedOut}
                                    onChange={(e) => setCreditCashedOut(e.target.value)}
                                    placeholder="₹0"
                                    className="w-24 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] font-mono font-bold text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setCreditCashedOut(customerAnalytics.credit_balance.toString())}
                                    className="text-xs bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 font-black px-3 py-1.5 rounded-md transition"
                                  >
                                    MAX
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Case C: Cash Denominations Edge Cases */}
                            {refundMethod === "CASH" && (() => {
                              const netCashGiven = refundDenomTotal - inwardDenomTotal;

                              if (netCashGiven < targetRefundAmt && targetRefundAmt > 0) {
                                const unpaid = targetRefundAmt - netCashGiven;
                                return (
                                  <label className="flex items-start gap-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 cursor-pointer hover:bg-sky-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoConvertCredit}
                                      onChange={(e) => setAutoConvertCredit(e.target.checked)}
                                      className="mt-1 h-4 w-4 rounded accent-sky-500"
                                    />
                                    <div className="space-y-0.5">
                                      <span className="text-sm font-bold text-sky-400 block">
                                        Convert remaining ₹{unpaid.toFixed(2)} refund to Store Credit
                                      </span>
                                      <span className="text-xs text-sky-400/90 font-medium block">
                                        Dispensed ₹{netCashGiven.toFixed(2)} cash. Save the remaining change in customer's store credit.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }

                              if (netCashGiven > targetRefundAmt) {
                                const extraCash = netCashGiven - targetRefundAmt;
                                return (
                                  <label className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 cursor-pointer hover:bg-rose-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoRecordExtraChangeAsDebt}
                                      onChange={(e) => setAutoRecordExtraChangeAsDebt(e.target.checked)}
                                      className="mt-1 h-4 w-4 rounded accent-rose-500"
                                    />
                                    <div className="space-y-0.5">
                                      <span className="text-sm font-bold text-rose-400 block">
                                        Record extra ₹{extraCash.toFixed(2)} cash given as Debt (Udhaar)
                                      </span>
                                      <span className="text-xs text-rose-400/90 font-medium block">
                                        Gave customer more cash than owed. Add the excess to their debt balance.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }
                              return null;
                            })()}
                          </>
                        ) : (
                          /* NET PAYABLE CASES (EXCHANGE) */
                          <>
                            {/* Case A: Apply Store Credit towards exchange */}
                            {customerAnalytics.credit_balance > 0 && (
                              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-3 flex items-center justify-between gap-3 border border-[var(--border-strong)]">
                                <span className="font-bold text-[var(--text-secondary)] text-xs uppercase tracking-wider">Apply Store Credit:</span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max={Math.min(customerAnalytics.credit_balance, rawAdditionalPayable)}
                                    value={applyCreditAmount}
                                    onChange={(e) => setApplyCreditAmount(e.target.value)}
                                    placeholder="₹0"
                                    className="w-24 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] font-mono font-bold text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setApplyCreditAmount(Math.min(customerAnalytics.credit_balance, rawAdditionalPayable).toString())}
                                    className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-black px-3 py-1.5 rounded-md transition"
                                  >
                                    MAX
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Case B: Settle old debt alongside exchange */}
                            {customerAnalytics.credit_balance < 0 && (
                              <label className="flex items-start gap-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 cursor-pointer hover:bg-sky-500/15 transition">
                                <input
                                  type="checkbox"
                                  checked={settleDebit}
                                  onChange={(e) => setSettleDebit(e.target.checked)}
                                  className="mt-1 h-4 w-4 rounded accent-sky-500"
                                />
                                <div className="space-y-0.5">
                                  <span className="text-sm font-bold text-sky-400 block">
                                    Collect &amp; Settle ₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)} of old Debt (Udhaar)
                                  </span>
                                  <span className="text-xs text-sky-400/90 font-medium block">
                                    Collect customer's outstanding debt alongside this exchange payment.
                                  </span>
                                </div>
                              </label>
                            )}

                            {/* Case C: Exchange Cash Collection Edge Cases */}
                            {refundMethod === "CASH" && (() => {
                              const netCashPaid = inwardDenomTotal - refundDenomTotal;

                              if (netCashPaid < targetCollectionAmt && targetCollectionAmt > 0) {
                                const shortfall = targetCollectionAmt - netCashPaid;
                                return (
                                  <label className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 cursor-pointer hover:bg-amber-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoRecordDebitOnShortfall}
                                      onChange={(e) => setAutoRecordDebitOnShortfall(e.target.checked)}
                                      className="mt-1 h-4 w-4 rounded accent-amber-500"
                                    />
                                    <div className="space-y-0.5">
                                      <span className="text-sm font-bold text-amber-400 block">
                                        Record ₹{shortfall.toFixed(2)} shortfall as Debt (Udhaar)
                                      </span>
                                      <span className="text-xs text-amber-400/90 font-medium block">
                                        Customer paid less cash than required. Record remaining balance as udhaar.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }

                              if (netCashPaid > targetCollectionAmt) {
                                const extraCash = netCashPaid - targetCollectionAmt;
                                return (
                                  <label className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/15 transition">
                                    <input
                                      type="checkbox"
                                      checked={autoConvertCredit}
                                      onChange={(e) => setAutoConvertCredit(e.target.checked)}
                                      className="mt-1 h-4 w-4 rounded accent-emerald-500"
                                    />
                                    <div className="space-y-0.5">
                                      <span className="text-sm font-bold text-emerald-400 block">
                                        Convert ₹{extraCash.toFixed(2)} extra cash into Store Credit
                                      </span>
                                      <span className="text-xs text-emerald-400/90 font-medium block">
                                        Customer paid extra cash and did not take change. Add to their wallet.
                                      </span>
                                    </div>
                                  </label>
                                );
                              }
                              return null;
                            })()}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer Action */}
            <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-[var(--border-strong)] px-6 py-3 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={returnCreditTotal <= 0 || isSubmitting || (!isAdminRole && !isPunchedIn)}
                onClick={() => {
                  if (!isAdminRole && !isPunchedIn) {
                    onRequirePunchIn?.();
                    return;
                  }
                  handleSubmitReturn();
                }}
                className={`rounded-2xl px-7 py-3.5 text-base font-black text-white shadow-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                  netSatisfactionStatus.isSatisfied
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25 ring-2 ring-emerald-400/40"
                    : "bg-sky-500 hover:bg-sky-600"
                }`}
              >
                {isSubmitting ? (
                  <RotateCcw className="h-5 w-5 animate-spin" />
                ) : netSatisfactionStatus.isSatisfied ? (
                  <CheckCircle2 className="h-5 w-5 text-white" />
                ) : (
                  <RotateCcw className="h-5 w-5" />
                )}
                <span>{isSubmitting ? "Processing Return..." : "Process Return & Restock"}</span>
                {returnCreditTotal > 0 && !isSubmitting && (
                  <span className="ml-1 opacity-75 font-mono text-xs bg-black/20 px-1.5 py-0.5 rounded border border-white/20">
                    ↵ Enter
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Link Customer Modal Dialog */}
      {showPhonePrompt && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-md bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] rounded-3xl p-6 shadow-2xl space-y-5"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                lastPhonePromptCloseTime.current = Date.now();
                setShowPhonePrompt(false);
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-sky-500/15 text-sky-400">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[var(--text-primary)]">Link Customer</h3>
                  <p className="text-xs text-[var(--text-muted)]">Required for Store Credit &amp; Udhaar records</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  lastPhonePromptCloseTime.current = Date.now();
                  setShowPhonePrompt(false);
                }}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer Mobile */}
              <div className="relative" ref={suggestionsRef}>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Customer Mobile (10 digits) *
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  autoFocus
                  placeholder="e.g. 9876543210"
                  value={customerPhoneOverride}
                  onChange={(e) => handlePhoneInputChange(e.target.value)}
                  onFocus={() => {
                    const currentVal = customerPhoneOverride.trim();
                    if (currentVal.length >= 2) {
                      setShowSuggestions(true);
                      if (customerSuggestions.length === 0) {
                        void handlePhoneInputChange(currentVal);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "ArrowDown" && showSuggestions && customerSuggestions.length > 0) {
                      e.preventDefault();
                      setHighlightedSuggestionIndex((prev) => Math.min(prev + 1, customerSuggestions.length - 1));
                    } else if (e.key === "ArrowUp" && showSuggestions && customerSuggestions.length > 0) {
                      e.preventDefault();
                      setHighlightedSuggestionIndex((prev) => Math.max(prev - 1, -1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (showSuggestions && highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < customerSuggestions.length) {
                        handleSelectCustomerSuggestion(customerSuggestions[highlightedSuggestionIndex]);
                      } else {
                        handleSaveAndLinkCustomer();
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      if (showSuggestions) {
                        setShowSuggestions(false);
                      } else {
                        lastPhonePromptCloseTime.current = Date.now();
                        setShowPhonePrompt(false);
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-base font-mono font-bold text-[var(--text-primary)] focus:border-sky-400 focus:outline-none"
                />
                {customerPhoneOverride && customerPhoneOverride.length < 10 && (
                  <span className="text-xs text-rose-400 block mt-1 font-medium">
                    Min 10 digits ({customerPhoneOverride.length}/10)
                  </span>
                )}

                {/* Suggestions dropdown */}
                {showSuggestions && customerSuggestions.length > 0 && (
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2 shadow-2xl max-h-56 overflow-y-auto space-y-1.5">
                    {customerSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectCustomerSuggestion(s)}
                        onMouseEnter={() => setHighlightedSuggestionIndex(i)}
                        className={`w-full text-left rounded-xl px-3 py-2 text-sm transition cursor-pointer flex items-center justify-between gap-3 ${
                          highlightedSuggestionIndex === i
                            ? "bg-sky-500/20 border border-sky-500/40 text-white"
                            : "hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {(s.name || "C").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate text-[var(--text-primary)] text-sm">{s.name || "Customer"}</p>
                            <p className="font-mono text-xs text-[var(--text-muted)]">{s.phone}</p>
                          </div>
                        </div>
                        {typeof s.credit_balance === "number" && s.credit_balance !== 0 && (
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                            s.credit_balance > 0
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}>
                            {s.credit_balance > 0 ? `+₹${s.credit_balance.toFixed(2)} Cr` : `-₹${Math.abs(s.credit_balance).toFixed(2)} Debt`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Customer Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={customerNameOverride}
                  onChange={(e) => setCustomerNameOverride(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveAndLinkCustomer();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      lastPhonePromptCloseTime.current = Date.now();
                      setShowPhonePrompt(false);
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-primary)] focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  lastPhonePromptCloseTime.current = Date.now();
                  setShowPhonePrompt(false);
                }}
                className="px-4 py-2 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl border border-[var(--border-strong)] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={customerPhoneOverride.replace(/\D/g, "").length < 10}
                onClick={handleSaveAndLinkCustomer}
                className="px-5 py-2 text-sm font-black text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
              >
                Save &amp; Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
