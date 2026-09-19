"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Calendar,
  Layers,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import type { BatchDetail } from "@/types";

interface DeleteBatchModalProps {
  isOpen: boolean;
  batch: BatchDetail | null;
  onClose: () => void;
  onConfirm: (batchId: string) => Promise<void>;
}

export function DeleteBatchModal({
  isOpen,
  batch,
  onClose,
  onConfirm,
}: DeleteBatchModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !batch) return null;

  const remQty = parseFloat(String(batch.remaining_quantity || 0));

  const handleDelete = async () => {
    setErrorMsg(null);
    setIsDeleting(true);
    try {
      await onConfirm(batch.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Cannot delete batch. Please try again.");
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
                Delete Batch Lot
              </h2>
              <p className="text-xs text-rose-400/90 font-medium">
                Remove intake lot & deduct remaining stock
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
          {/* Batch Details Card */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                #{batch.batch_number}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {batch.item_name}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)] font-mono">
                Stock: {remQty.toFixed(2)} {batch.unit}
              </span>

              {batch.expiry_date && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)] font-mono">
                  <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                  Exp: {new Date(batch.expiry_date).toLocaleDateString()}
                </span>
              )}

              {batch.unit_cost && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  Cost: ₹{parseFloat(String(batch.unit_cost)).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Stock Impact Banner */}
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex gap-3 items-start text-xs">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-rose-200/90 leading-relaxed">
              <p className="font-bold text-rose-300">
                Stock Impact Warning
              </p>
              <p className="text-[11px]">
                Deleting this batch will permanently remove it and deduct{" "}
                <strong className="text-white font-mono">
                  {remQty.toFixed(2)} {batch.unit}
                </strong>{" "}
                from the overall inventory current stock count.
              </p>
            </div>
          </div>

          {/* Inline Error Message */}
          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/15 p-3.5 flex gap-2.5 items-start text-xs text-rose-200 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="font-medium text-[11px] leading-relaxed">{errorMsg}</p>
            </div>
          )}

          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed px-1">
            Historical stock movements and invoices referencing this batch will
            retain ledger records, but the batch itself will be deleted.
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
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-950/40 hover:from-rose-500 hover:to-red-500 active:scale-95 transition disabled:opacity-60 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Delete Batch
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
