"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  User,
  Phone,
  Clock,
  CheckCircle2,
  Package,
  XCircle,
  ExternalLink,
  Filter,
  CalendarDays,
  Download,
  Eye,
} from "lucide-react";
import { getApiBaseUrl, parseUTCDate } from "@/lib/api";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import type {
  OrderResponse,
  OrderStatus,
  SessionStatusResponse,
  CustomerHistoryResponse,
} from "@/types";

const STATUS_BADGE: Record<
  OrderStatus,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  PENDING: {
    label: "Pending",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  PENDING_VERIFICATION: {
    label: "Awaiting Confirmation",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  PAID: {
    label: "Paid",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  PAYMENT_PENDING: {
    label: "Payment Pending",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  COMPLETED: {
    label: "Fulfilled",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: <Package className="h-3.5 w-3.5" />,
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  REFUNDED: {
    label: "Refunded",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    text: "text-violet-700 dark:text-violet-300",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  PARTIALLY_REFUNDED: {
    label: "Partially Refunded",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

const FILTER_OPTIONS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "Last year", value: 365 },
];

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

function AccountContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "apnagreenbasket-jammu";
  const table = searchParams.get("basket") || "";

  // Session data from localStorage
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [sessionOrders, setSessionOrders] = useState<OrderResponse[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // History data
  const [historyOrders, setHistoryOrders] = useState<OrderResponse[]>([]);
  const [filterDays, setFilterDays] = useState(30);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Load session from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedId = localStorage.getItem(`session_${slug}_${table}_id`);
    const storedName = localStorage.getItem(`session_${slug}_${table}_name`);
    const storedPhone = localStorage.getItem(`session_${slug}_${table}_phone`);

    if (storedId) setSessionId(storedId);
    if (storedName) setCustomerName(storedName);
    if (storedPhone) setCustomerPhone(storedPhone);
  }, [slug, table]);

  // Fetch current session orders
  useEffect(() => {
    if (!sessionId) {
      setIsLoadingSession(false);
      return;
    }

    async function fetchSession() {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
          headers: { "bypass-tunnel-reminder": "true" },
        });
        if (res.ok) {
          const data: SessionStatusResponse = await res.json();
          setSessionOrders(data.orders || []);
          setIsSessionActive(data.is_active);
          setCustomerName(data.customer_name);
        }
      } catch {
        // Silently fail
      } finally {
        setIsLoadingSession(false);
      }
    }

    fetchSession();

    // Auto-refresh every 15s
    const interval = setInterval(fetchSession, 15000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Fetch order history by phone
  const fetchHistory = useCallback(async () => {
    if (!customerPhone) return;

    setIsLoadingHistory(true);
    try {
      const apiBase = getApiBaseUrl();
      const params = new URLSearchParams({
        phone: customerPhone,
        outlet_slug: slug,
        days: filterDays.toString(),
      });
      const res = await fetch(
        `${apiBase}/api/sessions/customer/history?${params}`,
        { headers: { "bypass-tunnel-reminder": "true" } }
      );
      if (res.ok) {
        const data: CustomerHistoryResponse = await res.json();
        setHistoryOrders(data.past_orders || []);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingHistory(false);
    }
  }, [customerPhone, slug, filterDays]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const grandTotal = sessionOrders.reduce(
    (sum, o) => sum + parseFloat(o.total_amount),
    0
  );

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-base)] pb-12">
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
        </div>
      </header>

      <main className="px-4 pt-6 space-y-6">
        {/* Profile Card */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <User className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h1 className="font-sans text-lg font-bold text-[var(--text-primary)]">
                {customerName || "Guest"}
              </h1>
              {customerPhone && (
                <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <Phone className="h-3.5 w-3.5" />
                  {customerPhone}
                </div>
              )}
              {table && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                  Basket #{table}
                  {isSessionActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Current Session Orders */}
        {sessionOrders.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Current Session
              </h2>
              <span className="text-xs font-bold text-[var(--accent-brand)]">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>

            <div className="space-y-2.5">
              {sessionOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </section>
        )}

        {isLoadingSession && (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-20 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
              />
            ))}
          </div>
        )}

        {/* Past Order History */}
        {customerPhone && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Order History
              </h2>
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <select
                  value={filterDays}
                  onChange={(e) => setFilterDays(Number(e.target.value))}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-hidden"
                >
                  {FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isLoadingHistory ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-20 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                  />
                ))}
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
                <p className="text-sm font-medium text-[var(--text-secondary)]">
                  No orders found
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  No orders in the last {filterDays} days for this phone number
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {historyOrders.map((order) => (
                  <OrderCard key={order.id} order={order} showDate />
                ))}
              </div>
            )}
          </section>
        )}

        {!customerPhone && !isLoadingSession && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
            <Phone className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Add a phone number to track order history
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Re-scan the QR and enter your phone number to see past orders
              across visits
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  showDate,
}: {
  order: OrderResponse;
  showDate?: boolean;
}) {
  const badge = STATUS_BADGE[order.status] || STATUS_BADGE.PENDING;
  const total = parseFloat(order.total_amount);

  return (
    <Link
      href={`/order/${order.id}`}
      className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-2xs transition-all hover:border-[var(--border-strong)] hover:shadow-xs"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-[var(--accent-brand)]">
            #{order.id.slice(0, 8)}
          </span>
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}
          >
            {badge.icon}
            {badge.label}
          </div>
        </div>
        <span className="font-mono text-sm font-black text-[var(--text-primary)]">
          ₹{total.toFixed(2)}
        </span>
      </div>

      {showDate && (
        <p className="text-[11px] text-[var(--text-muted)] mb-1">
          {formatDateTime(order.created_at)} · Basket #{order.basket_number}
        </p>
      )}

      {order.items && order.items.length > 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          {order.items.length} {order.items.length === 1 ? "item" : "items"} ·{" "}
          {order.items.reduce((sum, i) => sum + Number(i.quantity), 0)} total quantity
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
        <div className="flex items-center gap-1 text-[11px] font-bold text-[var(--accent-brand)]">
          <ExternalLink className="h-3 w-3" />
          View details
        </div>
        {(order.status === "PAID" || order.status === "COMPLETED") && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                generateReceiptPDF(order, "ApnaGreen Basket", {}, "view");
              }}
              className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer"
              title="View Bill PDF"
            >
              <Eye className="h-3 w-3 text-cyan-500" />
              <span>View</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                generateReceiptPDF(order, "ApnaGreen Basket", {}, "download");
              }}
              className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
              title="Download Bill PDF"
            >
              <Download className="h-3 w-3 text-emerald-500" />
              <span>Download</span>
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center bg-[var(--bg-base)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-brand)]" />
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
