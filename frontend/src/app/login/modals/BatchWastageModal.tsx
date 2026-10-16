"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  PackageCheck,
  RotateCcw,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { BatchDetail, BatchWastageEntry } from "@/types";
import { parseUTCDate } from "@/lib/api";

interface BatchWastageModalProps {
  isOpen: boolean;
  batch: BatchDetail | null;
  onClose: () => void;
  getBatchWastageHistory: (batchId: string) => Promise<BatchWastageEntry[]>;
  deleteAndRestockWastage: (ledgerId: string) => Promise<any>;
  onRestockSuccess?: () => void;
}

export function BatchWastageModal({
  isOpen,
  batch,
  onClose,
  getBatchWastageHistory,
  deleteAndRestockWastage,
  onRestockSuccess,
}: BatchWastageModalProps) {
  const [entries, setEntries] = useState<BatchWastageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Undo confirmation state
  const [pendingUndoEntry, setPendingUndoEntry] = useState<BatchWastageEntry | null>(null);
  const [isRestocking, setIsRestocking] = useState(false);

  useEffect(() => {
    if (isOpen && batch) {
      loadHistory();
    } else {
      setEntries([]);
      setErrorMsg(null);
      setSuccessMsg(null);
      setPendingUndoEntry(null);
    }
  }, [isOpen, batch]);

  const loadHistory = async () => {
    if (!batch) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await getBatchWastageHistory(batch.id);
      setEntries(data || []);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load wastage history for this batch.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRestock = async () => {
    if (!pendingUndoEntry) return;
    setIsRestocking(true);
    setErrorMsg(null);
    try {
      const res = await deleteAndRestockWastage(pendingUndoEntry.id);
      setSuccessMsg(
        res?.message ||
          `Successfully restored ${pendingUndoEntry.quantity} back to batch #${batch?.batch_number || ""}`
      );
      setPendingUndoEntry(null);
      // Reload history
      await loadHistory();
      if (onRestockSuccess) {
        onRestockSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to restock wastage. Please try again.");
    } finally {
      setIsRestocking(false);
    }
  };

  if (!isOpen || !batch) return null;

  const totalWastedUnits = entries.reduce(
    (sum, e) => sum + (parseFloat(String(e.quantity)) || 0),
    0
  );
  const totalWastedCost = entries.reduce(
    (sum, e) => sum + (parseFloat(String(e.wastage_cost)) || 0),
    0
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          onClick={() => {
            if (!isRestocking) onClose();
          }}
        />

        {/* Modal Dialog */}
        <div
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-rose-500/20 shadow-2xl shadow-black/40 text-left transition-all animate-in fade-in zoom-in-95 duration-200"
          role="dialog"
          aria-modal="true"
        >
          {/* Header Strip */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-rose-500/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30 shadow-inner">
                <History className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    Wastage History & Undo Restock
                  </h2>
                  <span className="rounded-md bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-400">
                    #{batch.batch_number}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] font-medium">
                  {batch.item_name} • Remaining:{" "}
                  <span className="font-semibold text-emerald-400">
                    {batch.remaining_quantity} {batch.unit}
                  </span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isRestocking}
              className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition disabled:opacity-50 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-xs text-rose-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-xs text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="mx-6 mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                Logged Records
              </span>
              <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                {entries.length}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3">
              <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">
                Total Written Off
              </span>
              <p className="text-lg font-bold text-rose-400 mt-0.5">
                {totalWastedUnits} {batch.unit}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                Total Loss Value
              </span>
              <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                ₹{totalWastedCost.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Body List */}
          <div className="px-6 py-4 max-h-[50vh] overflow-y-auto space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                <Loader2 className="h-7 w-7 animate-spin text-rose-500 mb-2" />
                <span className="text-xs">Loading wastage logs...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 py-10 text-center">
                <PackageCheck className="h-10 w-10 text-emerald-500/50 mx-auto mb-2" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  No active wastage entries for this batch
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Either no wastage was logged, or all past mistaken entries have already been undone.
                </p>
              </div>
            ) : (
              entries.map((entry) => {
                const dateObj = parseUTCDate(entry.created_at);
                const formattedDate = dateObj.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                const formattedTime = dateObj.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={entry.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 hover:border-rose-500/30 transition shadow-xs"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-rose-400">
                          -{entry.quantity} {batch.unit}
                        </span>
                        <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                          {entry.reason || "Wastage"}
                        </span>
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">
                          (Loss: ₹{parseFloat(String(entry.wastage_cost || 0)).toFixed(2)})
                        </span>
                      </div>

                      {entry.notes && (
                        <p className="text-xs text-[var(--text-muted)] italic truncate" title={entry.notes}>
                          "{entry.notes}"
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] flex-wrap pt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-sky-400" />
                          {formattedDate} {formattedTime}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-amber-400" />
                          {entry.created_by_name || "Admin"}
                        </span>
                      </div>
                    </div>

                    {/* Red Delete & Restock Button */}
                    <div className="shrink-0 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setPendingUndoEntry(entry)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition shadow-xs cursor-pointer active:scale-95"
                        title="Delete mistaken entry and restore stock"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete & Restock
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-6 py-4">
            <span className="text-xs text-[var(--text-muted)]">
              Undoing a record immediately restores stock to this batch and updates reports.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Safety Confirmation Modal */}
      {pendingUndoEntry && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => {
              if (!isRestocking) setPendingUndoEntry(null);
            }}
          />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-rose-500/30 shadow-2xl text-left animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Confirm Restock & Delete Wastage
                </h3>
                <p className="text-xs text-rose-400 font-medium">
                  Undo human error & restore inventory
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 text-xs text-[var(--text-secondary)] space-y-2">
              <p>
                Are you sure you want to undo this wastage?{" "}
                <span className="font-bold text-[var(--text-primary)]">
                  {pendingUndoEntry.quantity} {batch.unit}
                </span>{" "}
                will be restored back to Batch{" "}
                <span className="font-mono font-bold text-rose-400">
                  #{batch.batch_number}
                </span>{" "}
                and product available stock.
              </p>
              <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>Reason: {pendingUndoEntry.reason || "Wastage"}</span>
                <span>Loss: ₹{parseFloat(String(pendingUndoEntry.wastage_cost || 0)).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestocking}
                onClick={() => setPendingUndoEntry(null)}
                className="rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRestocking}
                onClick={handleConfirmRestock}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-500 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                {isRestocking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Restoring Stock...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Confirm Restock
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
