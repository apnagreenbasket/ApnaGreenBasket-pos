"use client";

import React, { useEffect, useMemo } from "react";
import { AlertCircle, Split, Layers, ArrowRight, X, Sparkles, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ItemBatchSummary } from "@/types";

export interface BatchAllocation {
  batch: ItemBatchSummary;
  quantity: number;
  allowOversell: boolean;
}

export interface OversellBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  selectedBatchId?: string | null;
  selectedBatchNumber: string;
  availableQty: number;
  requestedQty: number;
  activeBatches: ItemBatchSummary[];
  unallocatedBatchStockMap?: Record<string, number>;
  onApplyAllocations: (allocations: BatchAllocation[]) => void;
}

export function OversellBatchModal({
  isOpen,
  onClose,
  itemName,
  selectedBatchId,
  selectedBatchNumber,
  availableQty,
  requestedQty,
  activeBatches,
  unallocatedBatchStockMap,
  onApplyAllocations,
}: OversellBatchModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const currentBatchObj = useMemo(() => {
    return (
      activeBatches.find((b) => b.id === selectedBatchId) ||
      activeBatches.find((b) => b.batch_number === selectedBatchNumber) ||
      activeBatches[0]
    );
  }, [activeBatches, selectedBatchId, selectedBatchNumber]);

  // Find alternative positive batches with unallocated stock (excluding the current one)
  const alternativeBatches = useMemo(() => {
    return activeBatches
      .filter((b) => b.id !== selectedBatchId && b.batch_number !== selectedBatchNumber)
      .map((b) => {
        const unalloc =
          unallocatedBatchStockMap && b.id in unallocatedBatchStockMap
            ? unallocatedBatchStockMap[b.id]
            : Number(b.remaining_quantity);
        return {
          batch: b,
          unallocated: Math.max(0, unalloc),
        };
      })
      .filter((b) => b.unallocated > 0);
  }, [activeBatches, selectedBatchId, selectedBatchNumber, unallocatedBatchStockMap]);

  const currentAvail = Math.max(0, availableQty);
  const totalOtherStock = useMemo(() => {
    return alternativeBatches.reduce((acc, b) => acc + b.unallocated, 0);
  }, [alternativeBatches]);

  const totalStoreStock = currentAvail + totalOtherStock;
  const shortage = Math.max(0, requestedQty - totalStoreStock);
  const currentDeficit = Math.max(0, requestedQty - currentAvail);

  // Multi-batch allocation plan (FIFO / across lots)
  const multiBatchPlan = useMemo(() => {
    const allocations: BatchAllocation[] = [];
    let remainingNeeded = requestedQty;

    // 1. Current batch
    const takeFromCurrent = Math.min(remainingNeeded, currentAvail);
    if (currentBatchObj && takeFromCurrent > 0) {
      allocations.push({
        batch: currentBatchObj,
        quantity: takeFromCurrent,
        allowOversell: false,
      });
      remainingNeeded -= takeFromCurrent;
    }

    // 2. Alternative batches with unallocated stock
    for (const alt of alternativeBatches) {
      if (remainingNeeded <= 0) break;
      const take = Math.min(remainingNeeded, alt.unallocated);
      if (take > 0) {
        allocations.push({
          batch: alt.batch,
          quantity: take,
          allowOversell: false,
        });
        remainingNeeded -= take;
      }
    }

    // 3. Shortage beyond all available store stock
    if (remainingNeeded > 0) {
      if (allocations.length > 0) {
        const lastAlloc = allocations[allocations.length - 1];
        lastAlloc.quantity += remainingNeeded;
        lastAlloc.allowOversell = true;
      } else if (currentBatchObj) {
        allocations.push({
          batch: currentBatchObj,
          quantity: requestedQty,
          allowOversell: true,
        });
      }
    }

    return allocations;
  }, [requestedQty, currentAvail, currentBatchObj, alternativeBatches]);

  if (!isOpen) return null;

  const handleApplyMultiBatch = () => {
    onApplyAllocations(multiBatchPlan);
    onClose();
  };

  const handleOversellCurrentLot = () => {
    if (!currentBatchObj) return;
    onApplyAllocations([
      {
        batch: currentBatchObj,
        quantity: requestedQty,
        allowOversell: true,
      },
    ]);
    onClose();
  };

  const handleCapAtAvailable = () => {
    const inStockPlan: BatchAllocation[] = multiBatchPlan
      .map((alloc) => {
        const maxStock =
          alloc.batch.id === selectedBatchId
            ? currentAvail
            : (alternativeBatches.find((ab) => ab.batch.id === alloc.batch.id)?.unallocated || 0);
        return {
          ...alloc,
          quantity: Math.min(alloc.quantity, maxStock),
          allowOversell: false,
        };
      })
      .filter((alloc) => alloc.quantity > 0);

    if (inStockPlan.length > 0) {
      onApplyAllocations(inStockPlan);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Selling Extra Than Batch Stock
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate max-w-[320px]">
                {itemName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-[var(--bg-surface-elevated)] transition text-[var(--text-muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quantity Breakdown Cards */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2.5 bg-[var(--bg-surface-elevated)] p-3 rounded-2xl border border-[var(--border-subtle)] text-center">
            <div className="space-y-0.5">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">Current Lot</div>
              <div className="text-sm font-bold text-[var(--text-primary)] truncate" title={selectedBatchNumber}>
                {selectedBatchNumber || "Current"}
              </div>
              <div className="text-xs text-emerald-600 font-semibold">{currentAvail} left</div>
            </div>

            <div className="space-y-0.5 border-x border-[var(--border-subtle)]">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">Selling Qty</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">{requestedQty}</div>
              <div className="text-xs text-[var(--text-secondary)]">requested</div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[11px] font-medium text-rose-500 font-semibold">
                {shortage > 0 ? "Total Shortage" : "Lot Deficit"}
              </div>
              <div className="text-sm font-bold text-rose-600">
                +{shortage > 0 ? shortage : currentDeficit}
              </div>
              <div className="text-xs text-rose-500 font-medium">
                {shortage > 0 ? "across all lots" : "from this lot"}
              </div>
            </div>
          </div>

          {/* Shortage notice if store stock is less than requested */}
          {shortage > 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Storewide Stock Shortage: </span>
                Total physical stock in store is <span className="font-bold underline">{totalStoreStock} units</span>. Selling {requestedQty} units will oversell inventory by <span className="font-bold">+{shortage} units</span>.
              </div>
            </div>
          )}

          {/* If alternative positive batches exist */}
          {alternativeBatches.length > 0 ? (
            <div className="space-y-3 pt-1">
              {/* Option A: Distribute Across Batches */}
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
                      A
                    </span>
                    <span className="font-bold text-sm text-[var(--text-primary)]">
                      {shortage === 0
                        ? "Draw Difference from Other Lots (Clean Split)"
                        : `Distribute Across Lots & Oversell Remainder (+${shortage})`}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-500/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Recommended
                  </span>
                </div>

                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {shortage === 0
                    ? "Draws stock cleanly across available lots in FIFO order without looping or overselling."
                    : `Exhausts all available lots (${totalStoreStock} units), with the remaining shortage (+${shortage} units) safely tracked as an oversold deficit on the final lot.`}
                </p>

                {/* Plan Preview */}
                <div className="space-y-1.5 rounded-xl bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)] flex justify-between">
                    <span>Generated Cart Allocation ({requestedQty} units total):</span>
                    <span>Status</span>
                  </div>
                  {multiBatchPlan.map((alloc, idx) => (
                    <div key={alloc.batch.id + idx} className="flex justify-between items-center py-0.5">
                      <div className="flex items-center gap-2 truncate">
                        <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-mono truncate">{alloc.batch.batch_number}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-[var(--text-primary)]">
                          {alloc.quantity} units
                        </span>
                        {alloc.allowOversell ? (
                          <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                            +{shortage} Oversold
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 px-1 py-0.5 rounded flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> In Stock
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleApplyMultiBatch}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 text-xs transition shadow-xs cursor-pointer"
                >
                  <Split className="w-4 h-4" />
                  {shortage === 0
                    ? `Split Across Lots (${requestedQty} units)`
                    : `Distribute & Oversell Remainder (+${shortage} units)`}
                </button>
              </div>

              {/* Option B: Oversell Entire Qty on Current Lot */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-muted)] text-white text-xs font-bold">
                    B
                  </span>
                  <span className="font-bold text-sm text-[var(--text-primary)]">
                    Oversell All on {selectedBatchNumber || "Current Lot"}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Keeps all {requestedQty} units on this single lot without splitting into multiple lines. Exhausts this lot to 0 and auto-creates a negative deficit batch (-{currentDeficit}).
                </p>
                <button
                  type="button"
                  onClick={handleOversellCurrentLot}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] font-semibold py-2 text-xs transition cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                  Oversell All {requestedQty} Units on Current Lot
                </button>
              </div>

              {/* Option C: Cap at Available Stock (if shortage > 0 and store has stock) */}
              {shortage > 0 && totalStoreStock > 0 && (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-muted)] text-white text-xs font-bold">
                      C
                    </span>
                    <span className="font-bold text-sm text-[var(--text-primary)]">
                      Sell Physical Stock Only ({totalStoreStock} units)
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Avoids any overselling. Adjusts the cart to sell only the {totalStoreStock} units physically in stock.
                  </p>
                  <button
                    type="button"
                    onClick={handleCapAtAvailable}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 font-semibold py-2 text-xs transition cursor-pointer"
                  >
                    Limit to In-Stock Quantity ({totalStoreStock} units)
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* No other positive batches available */
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                No other active lots exist for this item. Proceeding will sell all{" "}
                <span className="font-bold text-[var(--text-primary)]">{requestedQty} units</span>, exhaust this lot to 0, and auto-create a deficit batch with quantity{" "}
                <span className="font-bold text-rose-600">-{currentDeficit}</span> in inventory.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleOversellCurrentLot}
                  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 text-xs transition shadow-xs cursor-pointer"
                >
                  Confirm Oversell (-{currentDeficit} units)
                </button>
                {currentAvail > 0 && (
                  <button
                    type="button"
                    onClick={handleCapAtAvailable}
                    className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] font-semibold py-2.5 text-xs transition cursor-pointer"
                  >
                    Limit to {currentAvail} In-Stock
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 bg-[var(--bg-surface-elevated)] px-6 py-4 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition cursor-pointer"
          >
            Cancel / Keep Previous
          </button>
        </div>
      </div>
    </div>
  );
}
