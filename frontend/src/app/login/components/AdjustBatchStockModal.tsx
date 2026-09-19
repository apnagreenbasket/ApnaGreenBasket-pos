"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  RotateCcw,
  PackageX,
  Trash2,
  Building2,
  FileText,
  CheckCircle2,
  Layers,
  TrendingUp,
  Sliders,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { BatchDetail, Supplier, InventoryItem } from "@/types";

interface AdjustBatchStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: BatchDetail | null;
  item?: InventoryItem | null;
  suppliers?: Supplier[];
  onSuccess: (data: {
    batch_id: string;
    adjustment_type: string;
    return_id?: string | null;
    return_number?: string | null;
  }) => void;
  authToken?: string;
}

type AdjustmentMode = "PURCHASE_RETURN" | "MANUAL_ADJUSTMENT" | "VOID_BATCH" | "INTAKE_CORRECTION";

export function AdjustBatchStockModal({
  isOpen,
  onClose,
  batch,
  item,
  suppliers = [],
  onSuccess,
  authToken,
}: AdjustBatchStockModalProps) {
  const [mode, setMode] = useState<AdjustmentMode>("PURCHASE_RETURN");
  const [returnRateMode, setReturnRateMode] = useState<"PURCHASE_COST" | "SORTED_COST">("PURCHASE_COST");
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("DEFECTIVE");
  const [supplierName, setSupplierName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inward & Cost Correction States
  const [qtyMode, setQtyMode] = useState<"SET_TOTAL" | "APPEND">("SET_TOTAL");
  const [correctedTotalQty, setCorrectedTotalQty] = useState<string>("");
  const [appendQty, setAppendQty] = useState<string>("0");
  const [totalBilled, setTotalBilled] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [customRetailPrice, setCustomRetailPrice] = useState<string>("");
  const [customMrp, setCustomMrp] = useState<string>("");
  const [customWholesalePrice, setCustomWholesalePrice] = useState<string>("");
  const [syncCatalogPrice, setSyncCatalogPrice] = useState<boolean>(true);
  const [correctionReason, setCorrectionReason] = useState<string>("INWARD_CORRECTION");

  const [originalBilled, setOriginalBilled] = useState<string>("");

  useEffect(() => {
    if (batch) {
      setQuantity(String(batch.remaining_quantity || "0"));
      setSupplierName(batch.supplier_name || (suppliers[0]?.name ?? ""));
      setError(null);

      const bQty = parseFloat(String(batch.quantity || 0));
      const bInitQty = parseFloat(String(batch.initial_quantity || bQty || 0));
      const bSortedCost = parseFloat(String(batch.unit_cost || 0));
      const rawCost =
        (batch as any).purchase_unit_cost !== undefined && (batch as any).purchase_unit_cost !== null
          ? parseFloat(String((batch as any).purchase_unit_cost))
          : bInitQty > 0
            ? (bSortedCost * bQty) / bInitQty
            : bSortedCost;
      const bPurchaseCost = Math.round(rawCost * 100) / 100;
      const initBilled = (bPurchaseCost * (bInitQty || bQty)).toFixed(2);

      setCorrectedTotalQty(String(bQty));
      setAppendQty("0");
      setTotalBilled(initBilled);
      setOriginalBilled(initBilled);
      setUnitCost(bPurchaseCost.toFixed(2));
      setSyncCatalogPrice(true);

      const bRetail = (batch as any).retail_price != null ? String((batch as any).retail_price) : (item?.retail_price != null ? String(item.retail_price) : "");
      const bMrp = (batch as any).mrp != null ? String((batch as any).mrp) : (item?.mrp != null ? String(item.mrp) : "");
      const bWholesale = (batch as any).wholesale_price != null ? String((batch as any).wholesale_price) : (item?.wholesale_price != null ? String(item.wholesale_price) : "");
      setCustomRetailPrice(bRetail);
      setCustomMrp(bMrp);
      setCustomWholesalePrice(bWholesale);

      if (parseFloat(String(batch.remaining_quantity || 0)) < 0) {
        setMode("INTAKE_CORRECTION");
        setQtyMode("APPEND");
        setAppendQty("");
        setTotalBilled("");
        setOriginalBilled("");
        setUnitCost(bPurchaseCost > 0 ? bPurchaseCost.toFixed(2) : "");
        setCorrectionReason("INWARD_CORRECTION");
      } else {
        setCorrectionReason("INWARD_CORRECTION");
      }
    }
  }, [batch, item, suppliers]);

  if (!isOpen || !batch) return null;

  const remainingQty = parseFloat(String(batch.remaining_quantity || 0));
  const sortedQty = parseFloat(String(batch.quantity || 0));
  const initialQty = parseFloat(String(batch.initial_quantity || sortedQty || 0));
  const sortedUnitCost = parseFloat(String(batch.unit_cost || 0));

  const rawPurchaseUnitCost =
    (batch as any).purchase_unit_cost !== undefined && (batch as any).purchase_unit_cost !== null
      ? parseFloat(String((batch as any).purchase_unit_cost))
      : initialQty > 0
        ? (sortedUnitCost * sortedQty) / initialQty
        : sortedUnitCost;

  const purchaseUnitCost = Math.round(rawPurchaseUnitCost * 100) / 100;
  const sortedUnitCostRounded = Math.round(sortedUnitCost * 100) / 100;
  const activeReturnRate = returnRateMode === "PURCHASE_COST" ? purchaseUnitCost : sortedUnitCostRounded;

  const isOversoldBatch = remainingQty < 0 || (Boolean(batch.batch_number) && batch.batch_number.includes("-OV-"));

  // Inward derived calculations
  const effectiveNewTotalQty = isOversoldBatch
    ? (parseFloat(appendQty) || 0)
    : qtyMode === "APPEND"
      ? sortedQty + (parseFloat(appendQty) || 0)
      : parseFloat(correctedTotalQty) || 0;

  const deltaQty = isOversoldBatch
    ? (parseFloat(appendQty) || 0)
    : (effectiveNewTotalQty - sortedQty);

  const effectiveNewRemaining = remainingQty + deltaQty;
  const effectiveCost = parseFloat(unitCost) || purchaseUnitCost || sortedUnitCost;

  // Item Margin & Catalog Price Projections
  const marginType = item?.margin_type || (batch as any)?.margin_type || "MARKUP";
  const retailMargin = parseFloat(String(item?.retail_margin_pct ?? (batch as any)?.retail_margin_pct ?? 0));
  const mrpMargin = parseFloat(String(item?.mrp_margin_pct ?? (batch as any)?.mrp_margin_pct ?? 0));
  const wholesaleMargin = parseFloat(String(item?.wholesale_margin_pct ?? (batch as any)?.wholesale_margin_pct ?? 0));
  const currentItemRetail = parseFloat(String(item?.retail_price ?? (batch as any)?.item_retail_price ?? 0));

  const calcProjectedPrice = (cost: number, marginPct: number, type: string) => {
    if (!marginPct || cost <= 0) return null;
    if (type === "MARKUP") return Math.round((cost + (cost * marginPct) / 100) * 100) / 100;
    if (type === "MARGIN") {
      if (marginPct >= 100) return null;
      return Math.round((cost / (1 - marginPct / 100)) * 100) / 100;
    }
    return null;
  };

  const projectedRetail = retailMargin > 0 ? calcProjectedPrice(effectiveCost, retailMargin, marginType) : null;
  const projectedMrp = mrpMargin > 0 ? calcProjectedPrice(effectiveCost, mrpMargin, marginType) : null;
  const projectedWholesale = wholesaleMargin > 0 ? calcProjectedPrice(effectiveCost, wholesaleMargin, marginType) : null;

  // Suggested billed amount if newly adjusted quantity was billed at the original purchase unit cost
  const suggestedBilled =
    effectiveNewTotalQty > 0
      ? Math.round(effectiveNewTotalQty * purchaseUnitCost * 100) / 100
      : 0;
  const showBilledSuggestion =
    effectiveNewTotalQty > 0 &&
    suggestedBilled > 0 &&
    Math.abs((parseFloat(totalBilled) || 0) - suggestedBilled) >= 0.01;

  // Linked inputs
  const handleTotalBilledChange = (val: string) => {
    setTotalBilled(val);
    const num = parseFloat(val);
    if (!isNaN(num) && effectiveNewTotalQty > 0) {
      const calc = Math.round((num / effectiveNewTotalQty) * 100) / 100;
      setUnitCost(calc.toFixed(2));
    }
  };

  const handleUnitCostChange = (val: string) => {
    setUnitCost(val);
    const num = parseFloat(val);
    if (!isNaN(num) && effectiveNewTotalQty > 0) {
      const calc = Math.round(num * effectiveNewTotalQty * 100) / 100;
      setTotalBilled(calc.toFixed(2));
    }
  };

  // When quantity changes: keep totalBilled as-is (batch was billed at once), and recalculate unitCost = totalBilled / newTotalQty
  const handleQtyChange = (newTotal: number) => {
    const billed = parseFloat(totalBilled);
    if (!isNaN(billed) && newTotal > 0) {
      const calc = Math.round((billed / newTotal) * 100) / 100;
      setUnitCost(calc.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "INTAKE_CORRECTION") {
      if (isNaN(effectiveNewTotalQty) || effectiveNewTotalQty <= 0) {
        setError("Total inward quantity must be greater than 0");
        return;
      }
      if (effectiveNewRemaining < 0) {
        setError(
          `Cannot reduce inward quantity by ${Math.abs(deltaQty).toFixed(2)} ${batch.unit}. Only ${remainingQty.toFixed(2)} ${batch.unit} remaining in batch (${(sortedQty - remainingQty).toFixed(2)} ${batch.unit} already sold or consumed).`
        );
        return;
      }
    } else {
      if (remainingQty <= 0) {
        setError("This batch lot is already depleted (0 remaining stock). No further adjustments or returns can be processed.");
        return;
      }
      const qtyNum = parseFloat(quantity);
      if (mode !== "VOID_BATCH") {
        if (isNaN(qtyNum) || qtyNum <= 0) {
          setError("Please enter a valid quantity greater than 0");
          return;
        }
        if (qtyNum > remainingQty) {
          setError(`Quantity cannot exceed remaining batch stock (${remainingQty} ${batch.unit})`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token =
        authToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem("admin_access_token") ||
            localStorage.getItem("admin_token") ||
            localStorage.getItem("token")
          : "");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const bodyData =
        mode === "INTAKE_CORRECTION"
          ? {
              adjustment_type: "INTAKE_CORRECTION",
              quantity: effectiveNewTotalQty,
              new_total_quantity: effectiveNewTotalQty,
              quantity_delta: deltaQty,
              total_billed: parseFloat(totalBilled) || undefined,
              new_unit_cost: parseFloat(unitCost) || undefined,
              new_retail_price: customRetailPrice ? parseFloat(customRetailPrice) : undefined,
              new_mrp: customMrp ? parseFloat(customMrp) : undefined,
              new_wholesale_price: customWholesalePrice ? parseFloat(customWholesalePrice) : undefined,
              sync_catalog_price: syncCatalogPrice,
              reason: correctionReason,
              notes: notes || undefined,
            }
          : {
              adjustment_type: mode,
              quantity: mode === "VOID_BATCH" ? remainingQty : parseFloat(quantity),
              reason: mode === "VOID_BATCH" ? "VOIDED_BY_ADMIN" : reason,
              supplier_name: supplierName || undefined,
              return_rate: mode === "PURCHASE_RETURN" ? activeReturnRate : undefined,
              notes: notes || undefined,
            };

      const res = await fetch(`${apiBase}/api/admin/inventory/batches/${batch.id}/adjust`, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to process stock adjustment");
      }

      const resData = await res.json();
      onSuccess({
        batch_id: batch.id,
        adjustment_type: mode,
        return_id: resData.return_id,
        return_number: resData.return_number,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to process stock adjustment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-xl rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
              mode === "INTAKE_CORRECTION"
                ? "bg-indigo-500/10 text-indigo-400"
                : mode === "PURCHASE_RETURN"
                ? "bg-emerald-500/10 text-emerald-500"
                : mode === "MANUAL_ADJUSTMENT"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-rose-500/10 text-rose-500"
            }`}>
              {mode === "INTAKE_CORRECTION" ? (
                <Layers className="h-5 w-5" />
              ) : mode === "PURCHASE_RETURN" ? (
                <RotateCcw className="h-5 w-5" />
              ) : mode === "MANUAL_ADJUSTMENT" ? (
                <PackageX className="h-5 w-5" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                {mode === "INTAKE_CORRECTION" ? "Inward Qty & Cost Correction" : "Adjust / Return Batch Stock"}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Batch #{batch.batch_number} • {batch.item_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Batch Info Badge */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Remaining Stock</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {remainingQty.toFixed(2)} {batch.unit}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Purchase Unit Cost</span>
              <span className="font-mono font-bold text-emerald-300 text-sm">
                ₹{purchaseUnitCost.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">Sorted Unit Cost</span>
              <span className="font-mono font-bold text-[var(--text-primary)] text-sm">
                ₹{sortedUnitCost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Mode Selection */}
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Select Adjustment Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setMode("PURCHASE_RETURN")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition text-center gap-1 ${
                  mode === "PURCHASE_RETURN"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold shadow-xs"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="text-[11px]">Return to Supplier</span>
                <span className="text-[9px] opacity-75 font-normal">Issue Return Bill</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("MANUAL_ADJUSTMENT")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition text-center gap-1 ${
                  mode === "MANUAL_ADJUSTMENT"
                    ? "border-amber-500 bg-amber-500/10 text-amber-400 font-bold shadow-xs"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <PackageX className="h-4 w-4" />
                <span className="text-[11px]">Audit / Damage</span>
                <span className="text-[9px] opacity-75 font-normal">Loss / Stock Audit</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("VOID_BATCH")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition text-center gap-1 ${
                  mode === "VOID_BATCH"
                    ? "border-rose-500 bg-rose-500/10 text-rose-400 font-bold shadow-xs"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-[11px]">Void Batch</span>
                <span className="text-[9px] opacity-75 font-normal">Zero out batch</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("INTAKE_CORRECTION")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition text-center gap-1 ${
                  mode === "INTAKE_CORRECTION"
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold shadow-xs ring-1 ring-indigo-500/50"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Layers className="h-4 w-4" />
                <span className="text-[11px]">Inward / Cost</span>
                <span className="text-[9px] opacity-75 font-normal">Qty & Pricing</span>
              </button>
            </div>
          </div>

          {/* Inward Stock Correction & Margin Recalculation */}
          {mode === "INTAKE_CORRECTION" && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {isOversoldBatch && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <p className="font-bold">Oversold Deficit Lot: {Math.abs(remainingQty)} {batch.unit} owed</p>
                    <p className="text-[11px] text-amber-300/80 mt-0.5">
                      Enter the actual physical quantity arriving from your supplier. This batch will retain your full incoming quantity as its inward record, clear the {Math.abs(remainingQty)} {batch.unit} deficit, and put the balance into active store stock.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 1: Quantity Adjustment Mode */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {isOversoldBatch ? "Inward Stock Arrival" : "Inward Quantity Adjustment"}
                  </label>
                  <div className="flex rounded-lg bg-[var(--bg-surface-elevated)] p-0.5 border border-[var(--border-subtle)] text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setQtyMode("SET_TOTAL");
                        setCorrectedTotalQty(String(sortedQty));
                        handleQtyChange(sortedQty);
                      }}
                      className={`px-2.5 py-1 rounded-md font-medium transition ${
                        qtyMode === "SET_TOTAL"
                          ? "bg-indigo-600 text-white font-bold shadow-xs"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Set Corrected Total
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQtyMode("APPEND");
                        setAppendQty("0");
                        handleQtyChange(sortedQty);
                      }}
                      className={`px-2.5 py-1 rounded-md font-medium transition ${
                        qtyMode === "APPEND"
                          ? "bg-indigo-600 text-white font-bold shadow-xs"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Append Stock (+Δ)
                    </button>
                  </div>
                </div>

                {qtyMode === "SET_TOTAL" ? (
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={correctedTotalQty}
                      onChange={(e) => {
                        setCorrectedTotalQty(e.target.value);
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) handleQtyChange(val);
                      }}
                      placeholder={`Current: ${sortedQty.toFixed(2)} ${batch.unit}`}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-indigo-500 focus:outline-hidden"
                      required
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                      Original inward lot was {sortedQty.toFixed(2)} {batch.unit}. Enter the actual corrected total inward quantity.
                    </span>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-indigo-400 font-bold text-xs font-mono">+</span>
                      <input
                        type="number"
                        step="0.01"
                        value={appendQty}
                        onChange={(e) => {
                          setAppendQty(e.target.value);
                          const added = parseFloat(e.target.value) || 0;
                          handleQtyChange(sortedQty + added);
                        }}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] pl-7 p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-indigo-500 focus:outline-hidden"
                        required
                      />
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                      Enter additional stock arriving or found for this batch lot to append to current stock.
                    </span>
                  </div>
                )}

                {item?.alternate_units && (item.alternate_units as any[]).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-[var(--text-muted)] font-mono">
                    <span className="font-semibold text-[var(--text-secondary)]">Configured Alt Units:</span>
                    {(item.alternate_units as any[]).map((au: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-indigo-300">
                        1 {item.unit || batch.unit} = {au.conversion_factor} {au.unit_label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stock Live Delta Badge */}
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block font-semibold">
                      {isOversoldBatch ? "Inward Arrived" : "Inward Total"}
                    </span>
                    <span className="font-mono font-bold text-indigo-300">
                      {isOversoldBatch
                        ? `+${effectiveNewTotalQty.toFixed(2)}`
                        : `${sortedQty.toFixed(2)} → ${effectiveNewTotalQty.toFixed(2)}`}
                    </span>
                    <span className={`text-[9px] font-mono block ${deltaQty >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                      {deltaQty >= 0 ? `+${deltaQty.toFixed(2)}` : deltaQty.toFixed(2)} {batch.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block font-semibold">Remaining Batch</span>
                    <span className="font-mono font-bold text-indigo-300">
                      {remainingQty.toFixed(2)} → {effectiveNewRemaining.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] block font-mono">
                      {batch.unit} in lot
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block font-semibold">Store Inventory</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {deltaQty >= 0 ? `+${deltaQty.toFixed(2)}` : deltaQty.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] block font-mono">
                      net stock delta
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 2: Billed Amount & Unit Cost Recalculation */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Total Billed Invoice (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalBilled}
                      onChange={(e) => handleTotalBilledChange(e.target.value)}
                      placeholder="Total invoice amount"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                    <span className="text-[9px] text-[var(--text-muted)] mt-1 block">
                      Retains original invoice • auto-divides across {effectiveNewTotalQty.toFixed(2)} {batch.unit}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      New Batch Unit Cost (₹ / {batch.unit})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={unitCost}
                      onChange={(e) => handleUnitCostChange(e.target.value)}
                      placeholder="Unit cost"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-indigo-300 font-bold font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                    <span className="text-[9px] text-[var(--text-muted)] mt-1 block">
                      Original was ₹{purchaseUnitCost.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Auto Suggestion & Reset Controls */}
                {(showBilledSuggestion || (originalBilled && originalBilled !== totalBilled)) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {showBilledSuggestion && (
                      <button
                        type="button"
                        onClick={() => {
                          setTotalBilled(suggestedBilled.toFixed(2));
                          setUnitCost(purchaseUnitCost.toFixed(2));
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-[10px] font-medium text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-pointer group"
                        title={`Supplier invoiced extra stock at original purchase rate? Scale invoice to ₹${suggestedBilled.toFixed(2)} to retain ₹${purchaseUnitCost.toFixed(2)}/${batch.unit} unit cost`}
                      >
                        <Sparkles className="w-3 h-3 text-indigo-400 group-hover:rotate-12 transition-transform" />
                        <span>Suggestion: Apply ₹{suggestedBilled.toFixed(2)}</span>
                        <span className="text-[9px] text-[var(--text-muted)]">(retains ₹{purchaseUnitCost.toFixed(2)}/{batch.unit})</span>
                      </button>
                    )}
                    {originalBilled && originalBilled !== totalBilled && (
                      <button
                        type="button"
                        onClick={() => {
                          setTotalBilled(originalBilled);
                          if (effectiveNewTotalQty > 0) {
                            const billedNum = parseFloat(originalBilled);
                            if (!isNaN(billedNum)) {
                              setUnitCost((billedNum / effectiveNewTotalQty).toFixed(2));
                            }
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle-hover)] transition-all cursor-pointer font-mono"
                        title="Reset to batch initial invoice amount"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset to original ₹{originalBilled}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Margin & Retail Pricing Impact Card */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                    <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Margin & Pricing Ripple Effect</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      Cost: ₹{purchaseUnitCost.toFixed(2)} → <span className="font-bold text-white">₹{effectiveCost.toFixed(2)}</span>
                    </span>
                    {(projectedMrp !== null || projectedRetail !== null || projectedWholesale !== null) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (projectedMrp !== null) setCustomMrp(projectedMrp.toFixed(2));
                          if (projectedRetail !== null) setCustomRetailPrice(projectedRetail.toFixed(2));
                          if (projectedWholesale !== null) setCustomWholesalePrice(projectedWholesale.toFixed(2));
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold underline decoration-dotted cursor-pointer flex items-center gap-1"
                        title="Fill inputs with projected margin prices"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Apply Projected</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                      <span>Batch MRP (₹)</span>
                      {projectedMrp !== null && (
                        <button
                          type="button"
                          onClick={() => setCustomMrp(projectedMrp.toFixed(2))}
                          className="text-[10px] text-[var(--text-muted)] hover:text-white font-mono underline decoration-dotted cursor-pointer"
                          title="Click to apply projected MRP"
                        >
                          Proj: ₹{projectedMrp.toFixed(2)}
                        </button>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customMrp}
                      onChange={(e) => setCustomMrp(e.target.value)}
                      placeholder="e.g. 25.00"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                      <span>Retail Price (₹)</span>
                      {projectedRetail !== null && (
                        <button
                          type="button"
                          onClick={() => setCustomRetailPrice(projectedRetail.toFixed(2))}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono underline decoration-dotted cursor-pointer"
                          title="Click to apply projected retail price"
                        >
                          Proj: ₹{projectedRetail.toFixed(2)}
                        </button>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customRetailPrice}
                      onChange={(e) => setCustomRetailPrice(e.target.value)}
                      placeholder="e.g. 20.00"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-emerald-400 font-bold focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                      <span>Wholesale Price (₹)</span>
                      {projectedWholesale !== null && (
                        <button
                          type="button"
                          onClick={() => setCustomWholesalePrice(projectedWholesale.toFixed(2))}
                          className="text-[10px] text-purple-300 hover:text-purple-200 font-mono underline decoration-dotted cursor-pointer"
                          title="Click to apply projected wholesale price"
                        >
                          Proj: ₹{projectedWholesale.toFixed(2)}
                        </button>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customWholesalePrice}
                      onChange={(e) => setCustomWholesalePrice(e.target.value)}
                      placeholder="e.g. 18.00"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-purple-300 font-bold focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Catalog Sync Toggle */}
                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncCatalogPrice}
                    onChange={(e) => setSyncCatalogPrice(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border-subtle)] text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-[11px] leading-tight">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Sync new cost and updated prices in Product Catalog
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Updates item master default cost to ₹{effectiveCost.toFixed(2)} and active POS checkout prices.
                    </span>
                  </div>
                </label>
              </div>

              {/* Step 4: Reason */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Reason for Inward Correction
                </label>
                <select
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="INWARD_CORRECTION">Inward Count / Weight Mismatch</option>
                  <option value="SUPPLIER_ADDITIONAL_DISPATCH">Supplier Added Extra Stock (Dispatched)</option>
                  <option value="INVOICE_RATE_REVISION">Invoice Billed Rate Revision</option>
                  <option value="MISSED_INWARD">Missed Scans / Deferred Stock Entry</option>
                  <option value="OTHER">Other Internal Correction</option>
                </select>
              </div>
            </div>
          )}

          {/* Inputs for Return to Supplier */}
          {mode === "PURCHASE_RETURN" && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Supplier Name (For Debit Note)
                </label>
                {suppliers.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name} {s.phone ? `(${s.phone})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Enter supplier / vendor name"
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
                    required
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                    Return Quantity ({batch.unit})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingQty}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-emerald-500 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                    Reason for Return
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="DEFECTIVE">Defective / Damaged</option>
                    <option value="EXPIRED">Expired Stock</option>
                    <option value="EXCESS_STOCK">Excess Supply</option>
                    <option value="WRONG_ITEM">Incorrect Specification</option>
                    <option value="OTHER">Other Reason</option>
                  </select>
                </div>
              </div>

              {/* Debit Note Rate Selection */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[var(--text-primary)]">
                  Debit Note Return Rate Calculation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnRateMode("PURCHASE_COST")}
                    className={`p-2.5 rounded-xl border text-left text-[11px] transition ${
                      returnRateMode === "PURCHASE_COST"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-bold shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="block font-bold">Purchase Billed Rate</span>
                    <span className="font-mono text-xs text-emerald-400">₹{purchaseUnitCost.toFixed(2)} / {batch.unit}</span>
                    <span className="block text-[9px] opacity-75 font-normal">Original invoice cost</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReturnRateMode("SORTED_COST")}
                    className={`p-2.5 rounded-xl border text-left text-[11px] transition ${
                      returnRateMode === "SORTED_COST"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-bold shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="block font-bold">Sorted Usable Rate</span>
                    <span className="font-mono text-xs text-emerald-400">₹{sortedUnitCost.toFixed(2)} / {batch.unit}</span>
                    <span className="block text-[9px] opacity-75 font-normal">Effective post-sorting cost</span>
                  </button>
                </div>
              </div>

              {/* Total Refund Estimate */}
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-300 font-medium block">Estimated Return Value:</span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {(parseFloat(quantity) || 0).toFixed(2)} {batch.unit} × ₹{activeReturnRate.toFixed(2)}
                  </span>
                </div>
                <span className="font-mono font-black text-emerald-400 text-base">
                  ₹{((parseFloat(quantity) || 0) * activeReturnRate).toFixed(2)}
                </span>
              </div>
            </>
          )}

          {/* Inputs for Audit Adjustment */}
          {mode === "MANUAL_ADJUSTMENT" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Adjust / Deduct Quantity ({batch.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remainingQty}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] font-mono focus:border-amber-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Adjustment Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-hidden"
                >
                  <option value="AUDIT_CORRECTION">Inventory Audit Mismatch</option>
                  <option value="SPOILED_EXPIRED">Spoilage / Expiry Loss</option>
                  <option value="DAMAGED_TRANSIT">Transit Damage</option>
                  <option value="THEFT_LOST">Theft / Loss</option>
                </select>
              </div>
            </div>
          )}

          {/* Void Batch Prompt */}
          {mode === "VOID_BATCH" && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Confirm Void Batch Entry</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This will set the remaining stock for Batch #{batch.batch_number} to <strong className="font-mono text-white">0.00 {batch.unit}</strong> and subtract <strong className="font-mono text-white">{remainingQty} {batch.unit}</strong> from your total item stock. The batch will be preserved in audit logs as VOIDED.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
              Notes / Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add optional internal details..."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                (mode === "INTAKE_CORRECTION"
                  ? effectiveNewTotalQty <= 0 || effectiveNewRemaining < 0
                  : remainingQty <= 0)
              }
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === "PURCHASE_RETURN"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : mode === "MANUAL_ADJUSTMENT"
                  ? "bg-amber-600 hover:bg-amber-500"
                  : mode === "VOID_BATCH"
                  ? "bg-rose-600 hover:bg-rose-500"
                  : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              {isSubmitting ? (
                "Processing..."
              ) : mode === "INTAKE_CORRECTION" ? (
                <>
                  <Layers className="h-4 w-4" />
                  Save Inward Correction
                </>
              ) : remainingQty <= 0 ? (
                "Batch Depleted"
              ) : mode === "PURCHASE_RETURN" ? (
                <>
                  <FileText className="h-4 w-4" />
                  Process Return & Issue Bill
                </>
              ) : mode === "MANUAL_ADJUSTMENT" ? (
                "Save Adjustment"
              ) : (
                "Void Batch Now"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
