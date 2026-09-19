"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  X,
  Package,
  Layers,
  Calendar,
  Building2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  RotateCcw,
  ArrowUpDown,
  Hourglass,
  PackageX,
  Edit,
} from "lucide-react";
import type { BatchDetail, InventoryItem } from "@/types";
import { parseUTCDate } from "@/lib/api";
import { DeleteBatchModal } from "../modals/DeleteBatchModal";

interface BatchHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  fetchBatches: (itemId?: string) => Promise<BatchDetail[]>;
  onLogWastageClick: (item: InventoryItem, batch?: BatchDetail | null) => void;
  onAddStockClick: (item: InventoryItem) => void;
  onAdjustBatchClick?: (batch: BatchDetail) => void;
  onEditBatchClick?: (batch: BatchDetail) => void;
  onDeleteBatchClick?: (batch: BatchDetail) => void;
}

export function BatchHistoryDrawer({
  isOpen,
  onClose,
  item,
  fetchBatches,
  onLogWastageClick,
  onAddStockClick,
  onAdjustBatchClick,
  onEditBatchClick,
  onDeleteBatchClick,
}: BatchHistoryDrawerProps) {
  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDepleted, setShowDepleted] = useState(false);
  const [sortOption, setSortOption] = useState<
    "recent" | "oldest" | "expiry_asc" | "shelf_urgency" | "stock_desc" | "stock_asc"
  >("recent");

  // Delete Batch confirmation modal state
  const [deleteTargetBatch, setDeleteTargetBatch] = useState<BatchDetail | null>(null);
  const [isDeleteBatchModalOpen, setIsDeleteBatchModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setIsLoading(true);
      fetchBatches(item.id)
        .then((data) => setBatches(data || []))
        .catch((err) => console.error("Error loading batches for item:", err))
        .finally(() => setIsLoading(false));
    } else {
      setBatches([]);
    }
  }, [isOpen, item, fetchBatches]);

  const isBatchDepleted = (b: BatchDetail) => {
    return b.status === "DEPLETED" || parseFloat(String(b.remaining_quantity || 0)) === 0;
  };

  const depletedCount = useMemo(() => {
    return batches.filter(isBatchDepleted).length;
  }, [batches]);

  const totalBatchStock = useMemo(() => {
    return batches.reduce((sum, b) => sum + Number(b.remaining_quantity || 0), 0);
  }, [batches]);

  const getBatchFreshness = (b: BatchDetail) => {
    let calTime: number | null = null;
    if (b.expiry_date) {
      const t = parseUTCDate(b.expiry_date).getTime();
      if (!isNaN(t)) calTime = t;
    }
    const hrs = b.shelf_life_alert_hrs ?? item?.shelf_life_alert_hrs ?? null;
    let shelfTime: number | null = null;
    if (hrs != null && b.intake_date) {
      const t = parseUTCDate(b.intake_date).getTime();
      if (!isNaN(t)) shelfTime = t + hrs * 3600 * 1000;
    }

    let deadline: number | null = null;
    let leadType: "EXPIRY" | "SHELF_LIFE" | "NONE" = "NONE";
    if (calTime != null && shelfTime != null) {
      if (calTime <= shelfTime) {
        deadline = calTime;
        leadType = "EXPIRY";
      } else {
        deadline = shelfTime;
        leadType = "SHELF_LIFE";
      }
    } else if (calTime != null) {
      deadline = calTime;
      leadType = "EXPIRY";
    } else if (shelfTime != null) {
      deadline = shelfTime;
      leadType = "SHELF_LIFE";
    }

    const now = Date.now();
    let isExpired = false;
    let isExpiringSoon = false;
    let daysLeft: number | null = null;
    let hrsLeft: number | null = null;
    if (deadline != null) {
      const diff = deadline - now;
      daysLeft = Math.ceil(diff / (24 * 3600 * 1000));
      hrsLeft = Math.round(diff / (3600 * 1000));
      if (deadline < now) isExpired = true;
      else if (deadline <= now + 7 * 24 * 3600 * 1000) isExpiringSoon = true;
    }

    return { calTime, shelfTime, deadline, leadType, hrs, isExpired, isExpiringSoon, daysLeft, hrsLeft };
  };

  const sortedBatches = useMemo(() => {
    let list = [...batches];
    if (!showDepleted) {
      list = list.filter((b) => !isBatchDepleted(b));
    }
    list.sort((a, b) => {
      switch (sortOption) {
        case "recent": {
          const tA = a.intake_date ? parseUTCDate(a.intake_date).getTime() : 0;
          const tB = b.intake_date ? parseUTCDate(b.intake_date).getTime() : 0;
          return tB - tA; // Newest first
        }
        case "oldest": {
          const tA = a.intake_date ? parseUTCDate(a.intake_date).getTime() : 0;
          const tB = b.intake_date ? parseUTCDate(b.intake_date).getTime() : 0;
          return tA - tB; // Oldest first
        }
        case "expiry_asc":
        case "shelf_urgency": {
          const uA = getBatchFreshness(a).deadline ?? Infinity;
          const uB = getBatchFreshness(b).deadline ?? Infinity;
          if (uA === Infinity && uB === Infinity) {
            const tA = a.intake_date ? parseUTCDate(a.intake_date).getTime() : 0;
            const tB = b.intake_date ? parseUTCDate(b.intake_date).getTime() : 0;
            return tB - tA;
          }
          return uA - uB;
        }
        case "stock_desc":
          return parseFloat(String(b.remaining_quantity || 0)) - parseFloat(String(a.remaining_quantity || 0));
        case "stock_asc":
          return parseFloat(String(a.remaining_quantity || 0)) - parseFloat(String(b.remaining_quantity || 0));
        default:
          return 0;
      }
    });
    return list;
  }, [batches, showDepleted, sortOption, item]);

  if (!isOpen || !item) return null;

  const getStatusBadge = (status: BatchDetail["status"]) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Active
          </span>
        );
      case "EXPIRING_SOON":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" /> Expiring Soon
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-500/20">
            <XCircle className="h-3 w-3" /> Expired
          </span>
        );
      case "SETTLED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="h-3 w-3" /> Settled Backorder
          </span>
        );
      case "OVERSOLD":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
            <AlertTriangle className="h-3 w-3" /> Backorder
          </span>
        );
      case "DEPLETED":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)] border border-[var(--border-subtle)]">
            Depleted
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs" onClick={onClose}>
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-6" onClick={(e) => e.stopPropagation()}>
        <div className="w-screen max-w-5xl border-l border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5 bg-[var(--bg-surface)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 shadow-xs">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {item.name} — Batch History
                </h2>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                  <span className="font-mono bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                    {item.barcode || "No Barcode"}
                  </span>
                  <span>•</span>
                  <span>Category: {item.category}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-xs">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Total Current Stock</p>
              <p className={`text-sm font-bold mt-0.5 ${totalBatchStock < 0 ? "text-rose-400 font-mono" : "text-emerald-500"}`}>
                {totalBatchStock.toFixed(2)} {item.unit}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Cost / Unit</p>
              <p className="text-sm font-bold text-[var(--text-primary)] font-mono mt-0.5">
                ₹{Number(item.cost_per_unit).toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Retail Price</p>
              <p className="text-sm font-bold text-sky-400 font-mono mt-0.5">
                {item.retail_price ? `₹${Number(item.retail_price).toFixed(2)}` : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">MRP</p>
              <p className="text-sm font-bold text-purple-400 font-mono mt-0.5">
                {item.mrp ? `₹${Number(item.mrp).toFixed(2)}` : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-[var(--text-muted)] font-medium">Tax Rate</p>
              <p className="text-sm font-bold text-amber-500 mt-0.5">
                {item.tax_category || "GST 0%"} ({item.tax_rate ? `${item.tax_rate}%` : "0%"})
              </p>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Arrival Batches ({sortedBatches.length}{batches.length !== sortedBatches.length ? ` / ${batches.length}` : ""})
              </h3>

              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as any)}
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-brand)] cursor-pointer"
                >
                  <option value="recent">⏱️ Newest Arrival (Default)</option>
                  <option value="oldest">🕰️ Oldest Arrival (FIFO)</option>
                  <option value="expiry_asc">⏳ Expiry Date (Earliest)</option>
                  <option value="shelf_urgency">⚡ Freshness Urgency</option>
                  <option value="stock_desc">📦 Stock (High to Low)</option>
                  <option value="stock_asc">📉 Stock (Low to High)</option>
                </select>
              </div>

              {/* Show Depleted Toggle */}
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none px-2.5 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] transition">
                <input
                  type="checkbox"
                  checked={showDepleted}
                  onChange={(e) => setShowDepleted(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="font-medium text-[var(--text-primary)]">Show Depleted</span>
                {depletedCount > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                    {depletedCount}
                  </span>
                )}
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogWastageClick(item);
                }}
                className="flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-500 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Log Wastage</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddStockClick(item);
                }}
                className="flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add New Batch</span>
              </button>
            </div>
          </div>

          {/* Batches Table Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--text-muted)]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-2" />
                <span>Loading arrival batches...</span>
              </div>
            ) : sortedBatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-2xl p-6">
                <Package className="h-8 w-8 text-[var(--text-muted)] mb-2" />
                <p className="font-semibold text-[var(--text-primary)]">
                  {batches.length > 0 ? "No Active Batches" : "No Batches Found"}
                </p>
                <p className="mt-1 max-w-sm">
                  {batches.length > 0
                    ? `All ${batches.length} arrival batches for this item are depleted. Turn on "Show Depleted" above to review historical depleted lots.`
                    : "Add inward stock to record the first batch arrival for this item."}
                </p>
                {batches.length > 0 && !showDepleted && (
                  <button
                    type="button"
                    onClick={() => setShowDepleted(true)}
                    className="mt-3 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:border-emerald-500 font-semibold transition cursor-pointer"
                  >
                    Show {batches.length} Depleted Batch{batches.length > 1 ? "es" : ""}
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] font-semibold text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2.5">Batch # / Date</th>
                      <th className="px-3 py-2.5">Supplier</th>
                      <th className="px-3 py-2.5 text-right">Initial Gross Qty</th>
                      <th className="px-3 py-2.5 text-right">Sorted Usable Qty</th>
                      <th className="px-3 py-2.5 text-right">Remaining Qty</th>
                      <th className="px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-3 py-2.5 text-right">Retail</th>
                      <th className="px-3 py-2.5 text-right">MRP</th>
                      <th className="px-3 py-2.5">Expiry Date</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
                    {sortedBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                        <td className="px-3 py-3">
                          <p className="font-mono font-bold text-xs text-[var(--text-primary)]">{b.batch_number}</p>
                          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {parseUTCDate(b.intake_date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </td>

                        <td className="px-3 py-3 font-medium">
                          {b.supplier_name ? (
                            <span className="inline-flex items-center gap-1 text-[var(--text-primary)]">
                              <Building2 className="h-3 w-3 text-purple-400" />
                              {b.supplier_name}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-medium text-[var(--text-secondary)]">
                          {Number(b.initial_quantity ?? b.quantity).toFixed(2)} {b.unit}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-cyan-400">
                          {Number(b.quantity).toFixed(2)} {b.unit}
                        </td>

                        <td className="px-3 py-3 text-right font-bold text-emerald-500">
                          {Number(b.remaining_quantity).toFixed(2)} {b.unit}
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-semibold">
                          ₹{Number(b.unit_cost).toFixed(2)}
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-semibold text-sky-400">
                          {b.retail_price ? `₹${Number(b.retail_price).toFixed(2)}` : (item.retail_price ? `₹${Number(item.retail_price).toFixed(2)}` : "—")}
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-medium text-purple-400">
                          {b.mrp ? `₹${Number(b.mrp).toFixed(2)}` : (item.mrp ? `₹${Number(item.mrp).toFixed(2)}` : "—")}
                        </td>

                        <td className="px-3 py-3">
                          {(() => {
                            const fresh = getBatchFreshness(b);
                            if (fresh.deadline == null) {
                              return <span className="text-[var(--text-muted)] italic text-[11px]">—</span>;
                            }
                            const formatted = new Date(fresh.deadline).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            });
                            return (
                              <div className="space-y-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                                    fresh.isExpired
                                      ? "text-rose-400 font-bold"
                                      : fresh.isExpiringSoon
                                      ? "text-amber-400 font-bold"
                                      : "text-[var(--text-primary)] font-medium"
                                  }`}
                                >
                                  {fresh.isExpired ? (
                                    <AlertTriangle className="h-3 w-3 text-rose-400 shrink-0" />
                                  ) : fresh.isExpiringSoon ? (
                                    <Clock className="h-3 w-3 text-amber-400 shrink-0" />
                                  ) : (
                                    <Calendar className="h-3 w-3 text-sky-400 shrink-0" />
                                  )}
                                  {formatted} (
                                  {fresh.isExpired
                                    ? `Expired ${Math.abs(fresh.daysLeft!)}d ago`
                                    : fresh.hrsLeft != null && fresh.hrsLeft <= 48
                                    ? `${fresh.hrsLeft}h left`
                                    : `${fresh.daysLeft}d left`}
                                  )
                                </span>
                                {fresh.calTime != null && fresh.shelfTime != null && (
                                  <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                    <span className="text-cyan-400 font-semibold">
                                      {fresh.leadType === "SHELF_LIFE" ? "⚡ Shelf life leads (shorter)" : "⏳ Expiry leads (shorter)"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="px-3 py-3 text-center">
                          {(() => {
                            const fresh = getBatchFreshness(b);
                            const rem = Number(b.remaining_quantity);
                            const isOv = Boolean(
                              b.status === "SETTLED" ||
                              b.status === "OVERSOLD" ||
                              b.batch_number?.includes("-OV-")
                            );

                            if (b.status === "SETTLED" || (isOv && rem === 0)) {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20">
                                  <CheckCircle2 className="h-3 w-3" /> Settled Backorder
                                </span>
                              );
                            }
                            if (b.status === "OVERSOLD" || (isOv && rem < 0)) {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
                                  <AlertTriangle className="h-3 w-3" /> Backorder ({rem.toFixed(2)})
                                </span>
                              );
                            }
                            if (rem <= 0) {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                  Depleted
                                </span>
                              );
                            }
                            if (fresh.isExpired) {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20">
                                  <XCircle className="h-3 w-3" /> Expired
                                </span>
                              );
                            }
                            if (fresh.isExpiringSoon) {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                                  <AlertTriangle className="h-3 w-3" /> Expiring Soon
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                            );
                          })()}
                        </td>

                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(() => {
                              const isSettledBackorder = b.status === "SETTLED" || (b.batch_number?.includes("-OV-") && Number(b.remaining_quantity) === 0);
                              const isOversold = b.status === "OVERSOLD" || (b.batch_number?.includes("-OV-") && Number(b.remaining_quantity) < 0);
                              const isDeficit = isSettledBackorder || isOversold;

                              return (
                                <>
                                  {onEditBatchClick && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onEditBatchClick(b);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
                                      title="Edit batch lot number, arrival date, expiry, or notes"
                                    >
                                      <Edit className="h-3 w-3" />
                                      Edit
                                    </button>
                                  )}

                                  {onAdjustBatchClick && !isDeficit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onClose();
                                        onAdjustBatchClick(b);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition cursor-pointer"
                                      title="Adjust stock, return to supplier, or void batch"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Adjust
                                    </button>
                                  )}

                                  {onLogWastageClick && !isDeficit && (
                                    <button
                                      type="button"
                                      disabled={parseFloat(String(b.remaining_quantity)) <= 0}
                                      onClick={() => {
                                        onClose();
                                        onLogWastageClick(item, b);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                      title={
                                        parseFloat(String(b.remaining_quantity)) <= 0
                                          ? "Cannot log wastage for depleted batch"
                                          : "Log wastage write-off for this batch"
                                      }
                                    >
                                      <PackageX className="h-3 w-3" />
                                      Wastage
                                    </button>
                                  )}

                                  {onDeleteBatchClick && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteTargetBatch(b);
                                        setIsDeleteBatchModalOpen(true);
                                      }}
                                      className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition cursor-pointer"
                                      title="Delete this batch completely"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Batch Confirmation Modal */}
      <DeleteBatchModal
        isOpen={isDeleteBatchModalOpen}
        batch={deleteTargetBatch}
        onClose={() => {
          setIsDeleteBatchModalOpen(false);
          setDeleteTargetBatch(null);
        }}
        onConfirm={async (batchId) => {
          if (onDeleteBatchClick && deleteTargetBatch) {
            await onDeleteBatchClick(deleteTargetBatch);
            // Refresh batches inside drawer
            if (item) {
              const updated = await fetchBatches(item.id);
              setBatches(updated || []);
            }
          }
        }}
      />
    </div>
  );
}
