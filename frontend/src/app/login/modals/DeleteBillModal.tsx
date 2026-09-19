"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import type { AdminOrder } from "../adminTypes";
import type { ManualBill } from "@/types";
import { formatRupees } from "../adminUtils";

type DeleteBillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  order: AdminOrder | ManualBill;
  onConfirm: (orderId: string) => Promise<void>;
};

export function DeleteBillModal({
  isOpen,
  onClose,
  order,
  onConfirm,
}: DeleteBillModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md scale-100 overflow-hidden rounded-2xl bg-[var(--bg-surface)] text-left shadow-xl transition-all border border-red-500/20">
        <div className="bg-red-500/10 px-6 py-4 flex items-center gap-3 border-b border-red-500/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-600">Delete Bill</h3>
            <p className="text-sm text-red-600/80">This action cannot be undone</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to permanently delete this bill? It will be removed from all active orders and reports. A record of this deletion will be stored in the audit logs.
          </p>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2 mb-2">
              <span className="font-medium text-sm">
                {order.basket_number && order.basket_number.toUpperCase().includes("WALK")
                  ? "Walk-In"
                  : `Basket #${order.basket_number}`}
              </span>
              <span className="text-xs text-[var(--text-muted)]">ID: {order.id.slice(0,8)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Amount:</span>
              <span className="font-bold text-[var(--accent-brand)]">{formatRupees(order.total_amount)}</span>
            </div>
            {order.customer_name && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-[var(--text-secondary)]">Customer:</span>
                <span className="font-medium">{order.customer_name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--bg-surface-elevated)] px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(order.id)}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-700 transition"
          >
            <Trash2 className="h-4 w-4" />
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}
