"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Package,
  Download,
  Eye,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import type { OrderResponse, OrderStatus } from "@/types";
import { generateReceiptPDF } from "@/lib/pdfGenerator";

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

interface SessionOrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SessionOrdersDrawer({
  isOpen,
  onClose,
}: SessionOrdersDrawerProps) {
  const { sessionOrders, refreshSession, customerName, tableNumber } =
    useSession();

  // Auto-refresh orders while drawer is open
  useEffect(() => {
    if (!isOpen) return;
    refreshSession();
    const interval = setInterval(() => {
      refreshSession();
    }, 10000);
    return () => clearInterval(interval);
  }, [isOpen, refreshSession]);

  if (!isOpen) return null;

  const grandTotal = sessionOrders.reduce(
    (sum, o) => sum + parseFloat(o.total_amount),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl transition-all max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5 pb-3">
          <div>
            <h2 className="font-sans text-base font-bold text-[var(--text-primary)]">
              Your Orders
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {customerName} · Basket #{tableNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Orders List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {sessionOrders.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                No orders yet
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Add items from the menu and place your first order
              </p>
            </div>
          ) : (
            sessionOrders.map((order) => {
              const badge = STATUS_BADGE[order.status] || STATUS_BADGE.PENDING;
              const orderTotal = parseFloat(order.total_amount);

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-2xs"
                >
                  {/* Order header */}
                  <div className="flex items-center justify-between mb-2">
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
                    <span className="font-mono text-xs font-black text-[var(--text-primary)]">
                      ₹{orderTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Order items */}
                  {order.items && order.items.length > 0 && (
                    <div className="space-y-1">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-[var(--text-secondary)]">
                            {item.quantity}× Item
                          </span>
                          <span className="font-mono text-[var(--text-muted)]">
                            ₹
                            {(
                              parseFloat(String(item.unit_price)) * Number(item.quantity)
                            ).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Track & Bill Download actions */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
                    <Link
                      href={`/order/${order.id}`}
                      className="flex items-center gap-1 text-[11px] font-bold text-[var(--accent-brand)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Track status
                    </Link>
                    {(order.status === "PAID" || order.status === "COMPLETED") && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => generateReceiptPDF(order, "ApnaGreen Basket", {}, "view")}
                          className="flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer"
                          title="View Bill PDF"
                        >
                          <Eye className="h-3 w-3 text-cyan-500" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateReceiptPDF(order, "ApnaGreen Basket", {}, "download")}
                          className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                          title="Download Bill PDF"
                        >
                          <Download className="h-3 w-3 text-emerald-500" />
                          <span>Download</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with grand total */}
        {sessionOrders.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] p-5 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Session Total ({sessionOrders.length}{" "}
                {sessionOrders.length === 1 ? "order" : "orders"})
              </span>
              <span className="font-sans text-lg font-black text-[var(--text-primary)]">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
