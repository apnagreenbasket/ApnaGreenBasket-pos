"use client";

import React from "react";
import { ShoppingBag, ArrowRight, Clock } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function CartFloatingBar() {
  const {
    totalItemCount,
    totalAmount,
    setIsCartOpen,
    activeOrder,
    setIsTicketOpen,
  } = useCart();

  // If there's an active order ticket, prioritize showing the reassurance ticket pill
  if (activeOrder && totalItemCount === 0) {
    return (
      <div className="fixed bottom-4 left-0 right-0 z-30 mx-auto max-w-lg px-4">
        <button
          onClick={() => setIsTicketOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl border border-[var(--status-preparing-border)] bg-[var(--status-preparing-bg)] p-3.5 shadow-xl transition-transform active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--status-preparing-text)] text-white shadow-xs">
              <Clock className="h-5 w-5 animate-spin-slow" />
            </div>
            <div className="text-left">
              <span className="block text-xs font-semibold text-[var(--status-preparing-text)]">
                Active Table Order #{activeOrder.id.slice(0, 6)}
              </span>
              <span className="block text-xs font-bold text-[var(--text-primary)]">
                Status: {activeOrder.status.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs font-bold text-[var(--status-preparing-text)]">
            <span>View Receipt</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        </button>
      </div>
    );
  }

  if (totalItemCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-30 mx-auto max-w-lg px-4">
      <button
        onClick={() => setIsCartOpen(true)}
        className="flex w-full items-center justify-between rounded-2xl bg-[var(--accent-brand)] p-3.5 text-white shadow-xl transition-all duration-200 active:scale-[0.98] hover:bg-[var(--accent-brand-hover)]"
      >
        {/* Left: Count Badge & Bag Icon */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-black text-[var(--accent-brand)] shadow-xs">
              {totalItemCount}
            </span>
          </div>
          <div className="text-left">
            <span className="block text-[11px] font-medium text-rose-100 uppercase tracking-wider">
              {totalItemCount} {totalItemCount === 1 ? "Item" : "Items"} added
            </span>
            <span className="font-sans text-base font-black tracking-tight">
              ₹{totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Right: CTA Arrow */}
        <div className="flex items-center gap-1.5 rounded-xl bg-white/20 px-3.5 py-2 text-xs font-bold shadow-2xs">
          <span>Review Order</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </button>
    </div>
  );
}
