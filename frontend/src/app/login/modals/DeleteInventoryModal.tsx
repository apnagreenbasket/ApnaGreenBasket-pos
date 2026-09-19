"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Layers,
  Loader2,
  Package,
  Trash2,
  X,
} from "lucide-react";
import type { InventoryItem, BatchDetail } from "@/types";

interface DeleteInventoryModalProps {
  isOpen: boolean;
  item: InventoryItem | null;
  batches?: BatchDetail[];
  onClose: () => void;
  onConfirm: (itemId: string) => Promise<void>;
  onOpenBatchDrawer?: (item: InventoryItem) => void;
}

export function DeleteInventoryModal({
  isOpen,
  item,
  batches = [],
  onClose,
  onConfirm,
  onOpenBatchDrawer,
}: DeleteInventoryModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const itemBatches = batches.filter((b) => b.item_id === item.id);
  const totalBatchRemaining = itemBatches.reduce(
    (sum, b) => sum + parseFloat(String(b.remaining_quantity || 0)),
    0
  );
  const stockNum = parseFloat(String(item.current_stock || 0));
  const effectiveRemainingStock = Math.max(stockNum, totalBatchRemaining);
  const hasActiveStock = effectiveRemainingStock > 0;
  const activeBatches = itemBatches.filter(
    (b) => parseFloat(String(b.remaining_quantity || 0)) > 0
  );

  const handleDelete = async () => {
    if (hasActiveStock) return;
    setErrorMsg(null);
    setIsDeleting(true);
    try {
      await onConfirm(item.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message || "Cannot delete item. Please verify batches and try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-rose-500/25 shadow-2xl shadow-rose-950/30 text-left transition-all animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Strip */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-rose-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30 shadow-inner">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Delete Inventory Item
              </h2>
              <p className="text-xs text-rose-400/90 font-medium">
                Permanent catalog removal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition disabled:opacity-50 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Item Spec Card */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <Package className="h-4 w-4 text-[var(--accent-brand)] shrink-0" />
              <span className="font-bold text-base text-[var(--text-primary)] truncate">
                {item.name}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)] font-mono">
                <Barcode className="h-3 w-3 text-[var(--text-muted)]" />
                {item.barcode || "No Barcode"}
              </span>

              {item.category && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  <Layers className="h-3 w-3 text-[var(--text-muted)]" />
                  {item.category}
                </span>
              )}

              <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)] font-mono">
                Unit: {item.unit}
              </span>

              {item.cost_per_unit && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  Cost: ₹{parseFloat(String(item.cost_per_unit)).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Active Stock Diagnostic Banner */}
          {hasActiveStock ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3 text-xs">
              <div className="flex gap-3 items-start">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-amber-200/90 leading-relaxed">
                  <p className="font-bold text-amber-300">
                    Cannot Delete: {effectiveRemainingStock} {item.unit} Remaining
                  </p>
                  <p className="text-[11px]">
                    To maintain accounting accuracy, all active batches must reach{" "}
                    <strong className="text-white">0 remaining stock</strong> before an item can be removed.
                  </p>
                </div>
              </div>

              {activeBatches.length > 0 && (
                <div className="rounded-xl bg-black/20 p-2.5 space-y-1.5 border border-amber-500/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80 block">
                    Active Batches ({activeBatches.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeBatches.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono text-amber-200 border border-amber-500/30"
                      >
                        #{b.batch_number}: {parseFloat(String(b.remaining_quantity)).toFixed(1)} {item.unit}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {onOpenBatchDrawer && (
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onOpenBatchDrawer(item);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 py-2 px-3 font-semibold text-xs transition cursor-pointer"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Manage Batches & Adjust Stock
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex gap-3 items-center text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="text-emerald-200/90 text-[11px] leading-relaxed">
                <span className="font-bold text-emerald-300 block">
                  0 Stock Remaining
                </span>
                Item has no active batch stock and is ready for safe deletion.
              </div>
            </div>
          )}

          {/* Inline Error Message */}
          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/15 p-3.5 flex gap-2.5 items-start text-xs text-rose-200 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="font-medium text-[11px] leading-relaxed">{errorMsg}</p>
            </div>
          )}

          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed px-1">
            This action will permanently unregister this product and its
            associated barcodes from the store. This cannot be undone.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 bg-[var(--bg-surface-elevated)] border-t border-[var(--border-subtle)] px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || hasActiveStock}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition cursor-pointer ${
              hasActiveStock
                ? "bg-stone-700/60 text-stone-400 opacity-60 cursor-not-allowed shadow-none"
                : "bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-950/40 hover:from-rose-500 hover:to-red-500 active:scale-95"
            }`}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                {hasActiveStock ? "Stock Must Be 0 to Delete" : "Delete Permanently"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
