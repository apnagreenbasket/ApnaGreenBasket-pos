"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Flame,
  Package,
  RefreshCw,
  ShoppingBag,
  XCircle,
  Eye,
} from "lucide-react";
import { getApiBaseUrl, parseUTCDate } from "@/lib/api";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import type { OrderResponse, OrderStatus } from "@/types";

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    icon: typeof Clock;
    bgColor: string;
    textColor: string;
    borderColor: string;
    description: string;
  }
> = {
  PENDING: {
    label: "Order Placed",
    icon: Clock,
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    description: "Your order has been placed. Awaiting payment.",
  },
  PENDING_VERIFICATION: {
    label: "Order Confirmation Pending",
    icon: Clock,
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    description: "Your order is placed. Awaiting outlet confirmation.",
  },
  PAID: {
    label: "Order Confirmation Pending",
    icon: Clock,
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    description: "Payment received. Awaiting outlet confirmation.",
  },
  PAYMENT_PENDING: {
    label: "Payment Pending",
    icon: CreditCard,
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    borderColor: "border-orange-200",
    description: "Your order is confirmed & packed. Please make your payment at the counter.",
  },
  COMPLETED: {
    label: "Order Fulfilled",
    icon: Package,
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    description: "Your order is completed. Thank you for shopping with us!",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: XCircle,
    bgColor: "bg-rose-50",
    textColor: "text-rose-700",
    borderColor: "border-rose-200",
    description: "This order has been cancelled.",
  },
  REFUNDED: {
    label: "Refunded",
    icon: XCircle,
    bgColor: "bg-violet-50",
    textColor: "text-violet-700",
    borderColor: "border-violet-200",
    description: "Payment for this order has been refunded.",
  },
  PARTIALLY_REFUNDED: {
    label: "Partially Refunded",
    icon: XCircle,
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    description: "Items in this order have been partially returned/refunded.",
  },
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatRupees(value: string): string {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? `₹${value}` : money.format(numeric);
}

function formatDateTime(value: string): string {
  const parsed = parseUTCDate(value);
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchOrder = async () => {
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/orders/${orderId}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "Order not found."
        );
      }

      const data = await response.json();
      setOrder(data);
      setError(null);
      setLastRefreshed(new Date());

      // Fetch official receipt data if order is paid
      const isPaidStatus = data.status === "PAID" || data.status === "COMPLETED";
      if (isPaidStatus) {
        const receiptRes = await fetch(`${apiBase}/api/orders/${orderId}/receipt`).catch(() => null);
        if (receiptRes && receiptRes.ok) {
          const receiptObj = await receiptRes.json();
          setReceiptData(receiptObj);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load order.");
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!orderId) return;
    void fetchOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Auto-refresh every 10 seconds if order is not terminal
  useEffect(() => {
    if (!order) return;

    const isTerminal =
      order.status === "COMPLETED" ||
      order.status === "CANCELLED" ||
      order.status === "REFUNDED";

    if (isTerminal) return;

    const interval = setInterval(() => {
      void fetchOrder();
    }, 10000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status, orderId]);

  const statusConfig = useMemo(() => {
    if (!order) return null;
    const base = STATUS_CONFIG[order.status];
    if (!base) return null;

    if (order.status === "PENDING_VERIFICATION") {
      return {
        ...base,
        label: "Pending Exit Check",
        description: "Payment Successful! Please show this screen to staff at the exit for a quick item check.",
      };
    }
    if (order.status === "PAYMENT_PENDING") {
      return {
        ...base,
        label: "Counter Queue",
        description: order.is_auto_verified
          ? "Please proceed to the billing counter to pay."
          : "Please proceed to the billing counter to pay and verify your items.",
      };
    }
    if (order.status === "COMPLETED") {
      return {
        ...base,
        label: "Paid & Verified",
        description: "You are verified and good to go. Thank you for shopping!",
      };
    }
    return base;
  }, [order]);
  const StatusIcon = statusConfig?.icon || Clock;

  // Check if order is paid (download & detailed cash memo only appear when paid)
  const isPaid = order ? (order.status === "PAID" || order.status === "COMPLETED") : false;

  const timeline = order && (order.status === "PENDING_VERIFICATION" || order.status === "PAYMENT_PENDING")
    ? (["PENDING_VERIFICATION", "PAYMENT_PENDING", "COMPLETED"] as OrderStatus[])
    : (["PENDING", "PAID", "COMPLETED"] as OrderStatus[]);

  const currentStep = order ? timeline.indexOf(order.status) : -1;
  const isTerminal =
    order?.status === "COMPLETED" ||
    order?.status === "CANCELLED" ||
    order?.status === "REFUNDED";

  const storeName = receiptData?.restaurant?.name || "Restaurant";
  const subtotalWithoutTax = receiptData?.subtotal_without_tax ?? (Number(order?.total_amount || 0) / 1.05);
  const totalTax = receiptData?.total_tax ?? (Number(order?.total_amount || 0) - subtotalWithoutTax);
  const formattedTime = receiptData?.date_time || (order ? formatDateTime(order.created_at) : "");

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    setRefreshNotice(null);
    await fetchOrder();
    setRefreshNotice("Status updated!");
    setTimeout(() => setRefreshNotice(null), 2500);
    setIsManualRefreshing(false);
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-base)] pb-12 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-brand)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Menu
          </Link>
          <div className="flex items-center gap-2">
            {refreshNotice && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/50 animate-in fade-in">
                {refreshNotice}
              </span>
            )}
            <button
              type="button"
              disabled={isManualRefreshing}
              onClick={() => void handleManualRefresh()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent-brand)] active:scale-95 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isManualRefreshing ? "animate-spin text-[var(--accent-brand)]" : ""}`} />
              <span>{isManualRefreshing ? "Updating..." : "Refresh"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pt-6 space-y-6">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-4 py-12">
            <div className="mx-auto h-16 w-16 animate-pulse rounded-2xl bg-[var(--bg-surface-elevated)]" />
            <div className="mx-auto h-4 w-48 animate-pulse rounded bg-[var(--bg-surface-elevated)]" />
            <div className="mx-auto h-3 w-64 animate-pulse rounded bg-[var(--bg-surface-elevated)]" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="space-y-4 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
              <XCircle className="h-7 w-7" />
            </div>
            <h2 className="font-display text-xl font-bold">{error}</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Please check the order ID or try again later.
            </p>
          </div>
        )}

        {/* Order details */}
        {order && !isLoading && statusConfig && (
          <>
            {/* Current Status Banner */}
            <div className={`rounded-2xl border ${statusConfig.borderColor} ${statusConfig.bgColor} p-5 text-center shadow-xs`}>
              <StatusIcon className={`mx-auto h-10 w-10 ${statusConfig.textColor} mb-3`} />
              <h1 className={`font-display text-2xl font-bold ${statusConfig.textColor}`}>
                {statusConfig.label}
              </h1>
              <p className={`mt-1 text-sm ${statusConfig.textColor} opacity-80`}>
                {statusConfig.description}
              </p>
            </div>

            {/* IF PAID: SHOW OFFICIAL CASH MEMO DIGITAL TAX RECEIPT VIEW */}
            {isPaid ? (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* 1. Cash Memo Top Header */}
                <div className="text-center space-y-2">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                    Cash Memo
                  </p>
                  {receiptData?.restaurant?.logo_url ? (
                    <img
                      src={receiptData.restaurant.logo_url}
                      alt={storeName}
                      className="mx-auto h-16 w-16 object-contain rounded-2xl border border-[var(--border-subtle)] bg-white p-1 shadow-sm"
                    />
                  ) : (
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-brand)] text-white shadow-md font-black text-xl">
                      {storeName.charAt(0)}
                    </div>
                  )}
                </div>

                {/* 2. Restaurant Official Tax Registration Details */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-rose-50/40 dark:bg-rose-950/20 p-4 text-center space-y-1.5 text-xs text-[var(--text-secondary)] shadow-xs">
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    {storeName}
                  </h3>
                  <p className="font-mono text-[11px] text-rose-600 dark:text-rose-400">
                    GST NO.: {receiptData?.restaurant?.gstin || "01AAFCB7044K1ZV"}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono">
                    FSSAI Registration: {receiptData?.restaurant?.fssai_no || "10718026000722"}
                  </p>
                  <div className="mt-2 inline-block rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-3 py-1 text-[11px] font-medium text-[var(--text-primary)]">
                    {receiptData?.restaurant?.address || "Main Branch, INDIA"}
                  </div>
                </div>

                {/* 3. Customer Welcome Banner & PDF Bill Download Button */}
                <div className="rounded-2xl bg-gradient-to-r from-amber-700 to-amber-800 p-4 text-white shadow-md relative overflow-hidden">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm">
                        Hi, {order.customer_name || "Valued Customer"}
                      </h4>
                      <p className="mt-1 text-xs opacity-90 leading-relaxed">
                        Thank you for ordering with us. Your order details are below:
                      </p>
                      {order.customer_phone && (
                        <p className="mt-2 text-xs font-mono opacity-80">
                          📞 {order.customer_phone}
                        </p>
                      )}
                    </div>
                    {/* VIEW & DOWNLOAD BILL BUTTONS — STRICTLY ONLY WHEN PAID */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => generateReceiptPDF(receiptData || order, storeName, {}, "view")}
                        title="View Official Bill PDF"
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-400/40 shadow-sm transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => generateReceiptPDF(receiptData || order, storeName, {}, "download")}
                        title="Download Official Bill PDF"
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                      >
                        <Download className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Amount Paid & Quantity Summary Bar */}
                <div className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
                  <div>
                    <span className="block text-[11px] font-bold text-[var(--text-muted)] uppercase">
                      Amount Paid
                    </span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      {formatRupees(order.total_amount)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] font-bold text-[var(--text-muted)] uppercase">
                      Quantity
                    </span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">
                      {order.items?.reduce((sum, item) => sum + Number(item.quantity), 0) || order.items?.length || 1} items
                    </span>
                  </div>
                </div>

                {/* 5. Bill Meta Details (Type: Sale, Date, Invoice #) */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      Bill Type: Sale
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--accent-brand)]">
                        Basket #{order.basket_number}
                      </span>
                      {(order as any).is_void && (
                        <span className="rounded bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400 uppercase">
                          VOIDED (EDITED)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="block text-[11px] text-[var(--text-muted)]">Date & Order Time</span>
                      <span className="font-bold text-[var(--text-primary)]">{formattedTime}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[11px] text-[var(--text-muted)]">Invoice No.</span>
                      <span className="font-mono font-bold text-[var(--text-primary)]">
                        {receiptData?.invoice_no || order.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6. Itemized Order Items */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-2">
                    Order Items Breakdown
                  </h4>
                  {order.items?.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">
                          {item.quantity}× {item.menu_item_id ? (receiptData?.items?.[idx]?.item_name || `Dish #${item.menu_item_id.slice(0, 6)}`) : "Item"}
                        </p>
                      </div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {formatRupees(String(Number(item.unit_price) * Number(item.quantity)))}
                      </p>
                    </div>
                  ))}
                </div>

                {/* 7. Tax Summary Card */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2.5 shadow-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-brand)] border-b border-[var(--border-subtle)] pb-2">
                    Tax Summary
                  </h4>
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>Subtotal (Without Tax)</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      ₹{subtotalWithoutTax.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>Total Tax (5% GST)</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      ₹{totalTax.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                    <span>Total Amount</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      {formatRupees(order.total_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400 pt-2 border-t border-[var(--border-subtle)]">
                    <span>Amount Paid</span>
                    <span>{formatRupees(order.total_amount)}</span>
                  </div>
                </div>

                {/* 8. Store Thank You Banner Footer */}
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-center space-y-2 shadow-xs">
                  {receiptData?.restaurant?.logo_url && (
                    <img
                      src={receiptData.restaurant.logo_url}
                      alt={storeName}
                      className="mx-auto h-12 w-12 object-contain"
                    />
                  )}
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    Thank you for visiting {storeName}. Please come again!
                  </p>
                </div>
              </div>
            ) : (
              /* IF NOT PAID YET: Standard Order Tracking Card */
              <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Order ID</p>
                  <p className="font-mono text-xs text-[var(--text-secondary)] max-w-[200px] truncate">
                    {order.id}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Basket</p>
                  <p className="text-sm font-semibold">#{order.basket_number}</p>
                </div>
                {order.customer_name && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Name</p>
                    <p className="text-sm font-semibold">{order.customer_name}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Total Amount</p>
                  <p className="text-lg font-bold text-[var(--accent-brand)]">{formatRupees(order.total_amount)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Placed At</p>
                  <p className="text-xs text-[var(--text-secondary)]">{formatDateTime(order.created_at)}</p>
                </div>
                {order.items.length > 0 && (
                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2">Items</p>
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-1">
                        <p className="text-sm text-[var(--text-primary)]">
                          {item.quantity}× Item
                        </p>
                        <p className="text-sm font-semibold">{formatRupees(item.unit_price)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            {order.status !== "CANCELLED" && order.status !== "REFUNDED" && (
              <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-4 text-xs uppercase tracking-wide text-[var(--text-muted)]">Order Progress</h3>
                <div className="space-y-0">
                  {timeline.map((status, index) => {
                    const config = STATUS_CONFIG[status];
                    const StepIcon = config.icon;
                    const isActive = index <= currentStep;
                    const isCurrent = index === currentStep;

                    return (
                      <div key={status} className="flex gap-3">
                        {/* Connector line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                              isActive
                                ? isCurrent
                                  ? "border-[var(--accent-brand)] bg-[var(--accent-brand)] text-white"
                                  : "border-emerald-400 bg-emerald-50 text-emerald-600"
                                : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                            }`}
                          >
                            {isActive && !isCurrent ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <StepIcon className="h-4 w-4" />
                            )}
                          </div>
                          {index < timeline.length - 1 && (
                            <div
                              className={`w-0.5 h-8 ${
                                index < currentStep ? "bg-emerald-400" : "bg-[var(--border-subtle)]"
                              }`}
                            />
                          )}
                        </div>
                        {/* Label */}
                        <div className="pt-1 pb-4">
                          <p
                            className={`text-sm font-semibold ${
                              isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                            }`}
                          >
                            {config.label}
                          </p>
                          {isCurrent && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              {config.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auto-refresh indicator */}
            {!isTerminal && (
              <p className="text-center text-xs text-[var(--text-muted)]">
                Auto-refreshing every 10 seconds · Last updated {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            )}

            {/* Done message */}
            {isTerminal && (
              <div className="text-center py-4">
                <Link
                  href="/menu"
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Order Again
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
