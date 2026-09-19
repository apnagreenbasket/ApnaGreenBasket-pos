"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { X, CheckCircle2, Clock, BellRing, Sparkles, RefreshCw, ShieldCheck, ExternalLink, Package, Download, FileText, Eye } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSession } from "@/context/SessionContext";
import { OrderStatus, OrderResponse } from "@/types";
import { generateReceiptPDF } from "@/lib/pdfGenerator";

export function OrderTicketSlip() {
  const { activeOrder, isTicketOpen, setIsTicketOpen } = useCart();
  const { sessionOrders, refreshSession, customerName } = useSession();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [callStaffSuccess, setCallStaffSuccess] = useState(false);

  // Timer counter for live reassurance
  useEffect(() => {
    if (!activeOrder) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeOrder]);

  // Refresh session orders when ticket opens
  useEffect(() => {
    if (isTicketOpen) {
      refreshSession();
    }
  }, [isTicketOpen, refreshSession]);

  if (!isTicketOpen || !activeOrder) return null;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeFormatted = `${minutes}m ${seconds < 10 ? "0" : ""}${seconds}s ago`;

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "PAID":
      case "COMPLETED":
        return {
          label: "Order Paid & Confirmed",
          bg: "bg-[var(--status-paid-bg)]",
          text: "text-[var(--status-paid-text)]",
          border: "border-[var(--status-paid-border)]",
          icon: <CheckCircle2 className="h-4 w-4 text-[var(--status-paid-text)]" />,
        };
      case "PENDING_VERIFICATION":
        return {
          label: "Awaiting Staff Verification",
          bg: "bg-[var(--status-pending-bg)]",
          text: "text-[var(--status-pending-text)]",
          border: "border-[var(--status-pending-border)]",
          icon: <Clock className="h-4 w-4 text-[var(--status-pending-text)] animate-spin-slow" />,
        };
      case "PAYMENT_PENDING":
        return {
          label: "Payment Pending",
          bg: "bg-[var(--status-pending-bg)]",
          text: "text-[var(--status-pending-text)]",
          border: "border-[var(--status-pending-border)]",
          icon: <Clock className="h-4 w-4 text-[var(--status-pending-text)]" />,
        };
      default:
        return {
          label: "Order Received",
          bg: "bg-[var(--bg-surface-elevated)]",
          text: "text-[var(--text-primary)]",
          border: "border-[var(--border-subtle)]",
          icon: <Sparkles className="h-4 w-4 text-[var(--accent-brand)]" />,
        };
    }
  };

  const statusConfig = getStatusBadge(activeOrder.status);

  const handleCallStaff = () => {
    setCallStaffSuccess(true);
    setTimeout(() => setCallStaffSuccess(false), 3000);
  };

  // Other session orders (not the current active one)
  const otherOrders = sessionOrders.filter((o) => o.id !== activeOrder.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 transition-opacity">
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xl transition-all max-h-[92vh] flex flex-col justify-between overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--status-paid-text)]" />
            <h2 className="font-sans text-base font-bold text-[var(--text-primary)]">
              Digital Order Ticket
            </h2>
          </div>
          <button
            onClick={() => setIsTicketOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The Receipt Slip Card */}
        <div className="my-4 flex-1 overflow-y-auto pr-1 space-y-4">
          {/* View / Download Receipt Buttons — ONLY WHEN PAID */}
          {(activeOrder.status === "PAID" || activeOrder.status === "COMPLETED") && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => generateReceiptPDF(activeOrder, "Outlet Bill", {}, "view")}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 py-2.5 px-3 text-xs font-bold shadow-xs transition-all active:scale-98 cursor-pointer"
              >
                <Eye className="h-4 w-4 text-cyan-500" />
                <span>View Bill (PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => generateReceiptPDF(activeOrder, "Outlet Bill", {}, "download")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 text-xs font-bold shadow-xs transition-all active:scale-98 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download (PDF)</span>
              </button>
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 shadow-xs">
            {/* Top Bar on Receipt */}
            <div className="flex items-center justify-between border-b border-dashed border-[var(--border-strong)] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                  Basket Ticket
                </span>
                <span className="font-sans text-base font-black text-[var(--text-primary)]">
                  Basket #{activeOrder.basket_number}
                </span>
                {customerName && (
                  <span className="block text-xs text-[var(--text-secondary)]">
                    {customerName}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                  Ticket ID
                </span>
                <span className="font-mono text-xs font-bold text-[var(--accent-brand)]">
                  #{activeOrder.id.slice(0, 8)}
                </span>
              </div>
            </div>

            {/* Live Reassurance Status Badge */}
            <div className="mt-3.5">
              <div
                className={`flex items-center gap-2.5 rounded-xl border p-3 ${statusConfig.bg} ${statusConfig.border}`}
              >
                {statusConfig.icon}
                <div className="flex-1">
                  <span className={`block text-xs font-bold ${statusConfig.text}`}>
                    {statusConfig.label}
                  </span>
                  <span className="block text-[11px] text-[var(--text-secondary)]">
                    Placed {timeFormatted}
                  </span>
                </div>
              </div>
            </div>

            {/* Order Items List */}
            <div className="mt-4 border-t border-dashed border-[var(--border-strong)] pt-3 space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Items Ordered
              </h4>
              {activeOrder.items && activeOrder.items.length > 0 ? (
                activeOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--accent-brand)]">
                        {item.quantity}x
                      </span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {item.item_name || (item.menu_item_id ? `Item ${item.menu_item_id.slice(0, 6)}` : "Item")}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      ₹{(parseFloat(String(item.unit_price)) * Number(item.quantity)).toFixed(2)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-secondary)] italic">
                  Items sent to order dashboard
                </p>
              )}

              {/* Total Row */}
              <div className="flex items-center justify-between border-t border-dashed border-[var(--border-strong)] pt-2.5 mt-2">
                <span className="font-bold text-xs text-[var(--text-primary)]">
                  Total Amount Paid / Payable
                </span>
                <span className="font-sans text-base font-black text-[var(--text-primary)]">
                  ₹{parseFloat(activeOrder.total_amount).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

            {/* Other session orders */}
            {otherOrders.length > 0 && (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Other Orders This Session ({otherOrders.length})
                </h4>
                <div className="space-y-2">
                  {otherOrders.map((order) => {
                    const badge = getStatusBadge(order.status);
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-[var(--accent-brand)]">
                            #{order.id.slice(0, 8)}
                          </span>
                          <div className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badge.bg} ${badge.text}`}>
                            {badge.icon}
                            {badge.label}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                          ₹{parseFloat(order.total_amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Past Orders in Session (Multi-Order Bill Accumulation) */}
          {sessionOrders.length > 1 && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                All Orders This Visit ({sessionOrders.length})
              </span>
              <div className="space-y-1.5">
                {sessionOrders.map((so, idx) => {
                  const isCurrent = so.id === activeOrder.id;
                  return (
                    <div
                      key={so.id}
                      className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 transition ${
                        isCurrent
                          ? "bg-[var(--accent-brand-subtle)] text-[var(--accent-brand)] font-bold"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px]">#{idx + 1}</span>
                        <span className="font-mono text-[10px] opacity-60">
                          {so.id.slice(0, 6)}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] bg-[var(--accent-brand)] text-white px-1.5 py-0.2 rounded-full font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase opacity-75">
                          {so.status}
                        </span>
                        <span className="font-mono font-bold">
                          ₹{Number(so.total_amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Table Staff Call Action */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-[var(--text-primary)]">
                Need anything at Basket #{activeOrder.basket_number}?
              </span>
              <span className="block text-[11px] text-[var(--text-secondary)]">
                Water, cutlery, or napkins
              </span>
            </div>

            <button
              onClick={handleCallStaff}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                callStaffSuccess
                  ? "bg-[var(--status-paid-bg)] text-[var(--status-paid-text)]"
                  : "bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
              }`}
            >
              <BellRing className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
              <span>{callStaffSuccess ? "Staff Notified!" : "Call Staff"}</span>
            </button>
          </div>
        </div>

        {/* Footer Action */}
        <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
          {activeOrder?.id && (
            <Link
              href={`/order/${activeOrder.id}`}
              onClick={() => setIsTicketOpen(false)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Track Order Status Live</span>
            </Link>
          )}
          <button
            onClick={() => setIsTicketOpen(false)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] py-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <span>Keep Browsing Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
