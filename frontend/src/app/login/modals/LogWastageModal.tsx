"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2, DollarSign, Layers, PackageX, Trash2, X } from "lucide-react";
import type { InventoryItem, BatchDetail, WastageReason } from "@/types";

interface LogWastageModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  batch?: BatchDetail | null;
  batches?: BatchDetail[];
  onLogWastage: (data: {
    item_id: string;
    quantity: number;
    reason: WastageReason;
    notes?: string;
    batch_number?: string;
  }) => Promise<void>;
}

const REASONS: { key: WastageReason; label: string; icon: string; desc: string }[] = [
  {
    key: "SPOILED_EXPIRED",
    label: "Spoiled / Expired",
    icon: "🍎",
    desc: "Produce rotted, past shelf expiry, or ruined",
  },
  {
    key: "DAMAGED_TRANSIT",
    label: "Damaged / Broken",
    icon: "📦",
    desc: "Broken packaging, leaking bottles, handling damage",
  },
  {
    key: "AUDIT_CORRECTION",
    label: "Audit Variance",
    icon: "🔍",
    desc: "Physical shelf count lower than system count",
  },
  {
    key: "THEFT_LOST",
    label: "Theft / Missing",
    icon: "🚨",
    desc: "Unaccounted shortage or shoplifting write-off",
  },
  {
    key: "OTHER",
    label: "Other Reason",
    icon: "📝",
    desc: "Kitchen testing, quality rejection, etc.",
  },
];

export function LogWastageModal({
  isOpen,
  onClose,
  item,
  batch,
  batches = [],
  onLogWastage,
}: LogWastageModalProps) {
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<WastageReason>("SPOILED_EXPIRED");
  const [notes, setNotes] = useState("");
  const [selectedBatchNumber, setSelectedBatchNumber] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemBatches = useMemo(() => {
    if (!item || !batches) return [];
    return batches.filter(
      (b) => b.item_id === item.id && parseFloat(String(b.remaining_quantity || 0)) > 0
    );
  }, [item, batches]);

  useEffect(() => {
    if (isOpen) {
      setQuantity("1");
      setReason("SPOILED_EXPIRED");
      setNotes("");
      setError(null);
      if (batch) {
        setSelectedBatchNumber(batch.batch_number);
      } else if (itemBatches.length === 1) {
        setSelectedBatchNumber(itemBatches[0].batch_number);
      } else {
        setSelectedBatchNumber("");
      }
    }
  }, [isOpen, item, batch, itemBatches]);

  if (!isOpen || !item) return null;

  const activeBatch =
    batch || itemBatches.find((b) => b.batch_number === selectedBatchNumber) || null;

  const currentStockNum = parseFloat(String(item.current_stock)) || 0;
  const maxAvailable = activeBatch
    ? parseFloat(String(activeBatch.remaining_quantity)) || 0
    : currentStockNum;

  const costNum =
    activeBatch && activeBatch.unit_cost != null
      ? parseFloat(String(activeBatch.unit_cost)) || 0
      : parseFloat(String(item.cost_per_unit)) || 0;

  const wasteQtyNum = parseFloat(quantity) || 0;
  const estimatedLoss = wasteQtyNum * costNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (maxAvailable <= 0) {
      setError("Cannot write off stock: Available stock is 0.");
      return;
    }
    if (wasteQtyNum <= 0) {
      setError("Please enter a valid quantity greater than 0");
      return;
    }
    if (wasteQtyNum > maxAvailable) {
      const sourceLabel = activeBatch
        ? `batch #${activeBatch.batch_number}`
        : "available stock";
      setError(
        `Quantity to write off (${wasteQtyNum} ${item.unit}) exceeds available stock in ${sourceLabel} (${maxAvailable} ${item.unit})`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onLogWastage({
        item_id: item.id,
        quantity: wasteQtyNum,
        reason,
        notes: notes.trim() || undefined,
        batch_number: activeBatch?.batch_number || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to log wastage write-off");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
              <PackageX className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Log Stock Wastage / Loss
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Write off lost, damaged, or expired stock with full audit tracking.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Item & Batch Info Banner */}
        <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-3.5 border border-[var(--border-strong)] space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-[var(--text-primary)] block">
                {item.name}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Category: <span className="font-medium text-[var(--text-primary)]">{item.category}</span>
                </span>
                {item.barcode && (
                  <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                    {item.barcode}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] text-[var(--text-muted)] block">
                {activeBatch ? `Batch Available` : `Total Available`}
              </span>
              <span className={`font-mono text-sm font-bold ${maxAvailable <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                {maxAvailable} {item.unit}
              </span>
            </div>
          </div>

          {/* Active Batch Indicator Badge */}
          {activeBatch && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-mono text-red-400">
                <Layers className="h-3.5 w-3.5" />
                <span className="font-bold">Batch #{activeBatch.batch_number}</span>
                {activeBatch.expiry_date && (
                  <span className="text-[10px] text-[var(--text-muted)] font-sans">
                    • Exp: {new Date(activeBatch.expiry_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                Cost: ₹{parseFloat(String(activeBatch.unit_cost || 0)).toFixed(2)}/{item.unit}
              </span>
            </div>
          )}
        </div>

        {maxAvailable <= 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400 font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold block">Out of Stock</span>
              <span>This item/batch currently has 0 available stock. Add stock before logging wastage.</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Batch Lot Selector (when opened from item level and multiple batches exist) */}
          {!batch && itemBatches.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--text-primary)]">
                  Select Batch Lot to Write Off *
                </label>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {itemBatches.length} active {itemBatches.length === 1 ? "lot" : "lots"}
                </span>
              </div>
              <select
                value={selectedBatchNumber}
                onChange={(e) => setSelectedBatchNumber(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs font-mono text-[var(--text-primary)] focus:border-red-500 focus:outline-none cursor-pointer"
              >
                <option value="">-- Choose specific batch lot (or FEFO) --</option>
                {itemBatches.map((b) => (
                  <option key={b.id} value={b.batch_number}>
                    #{b.batch_number} — Remaining: {b.remaining_quantity} {b.unit} {b.expiry_date ? `| Exp: ${new Date(b.expiry_date).toLocaleDateString()}` : ""} | ₹{parseFloat(String(b.unit_cost || 0)).toFixed(2)}/unit
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity to Write Off */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Quantity to Write Off ({item.unit}) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.001"
                required
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono text-[var(--text-primary)] focus:border-red-500 focus:outline-none"
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-bold text-[var(--text-muted)]">
                {item.unit}
              </span>
            </div>
          </div>

          {/* Reason Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Reason for Wastage / Write-Off *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REASONS.map((r) => {
                const isSelected = reason === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setReason(r.key)}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                      isSelected
                        ? "border-red-500/80 bg-red-500/10 text-[var(--text-primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <span className="text-base">{r.icon}</span>
                    <div>
                      <span className="text-xs font-bold block">{r.label}</span>
                      <span className="text-[10px] text-[var(--text-muted)] leading-tight block">
                        {r.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Detailed Notes / Incident Report (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Broken packaging found during morning shelf restocking..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-red-500 focus:outline-none resize-none"
            />
          </div>

          {/* Financial Loss Summary */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <div>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Estimated Financial Loss
                </span>
                <span className="text-[11px] text-[var(--text-muted)] block">
                  {wasteQtyNum} {item.unit} @ ₹{costNum.toFixed(2)}/unit
                </span>
              </div>
            </div>
            <span className="font-mono text-sm font-bold text-red-400">
              ₹{estimatedLoss.toFixed(2)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || wasteQtyNum <= 0 || wasteQtyNum > maxAvailable || maxAvailable <= 0}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
              {isSubmitting ? "Writing Off..." : maxAvailable <= 0 ? "Out of Stock" : "Confirm & Write Off Stock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
