import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Edit,
  Clock,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  FileText,
  HelpCircle,
  Tag,
  Plus,
  Trash2,
  TrendingUp,
  Scale,
} from "lucide-react";
import type { BatchDetail, Supplier, InventoryItem } from "@/types";
import { parseUTCDate } from "@/lib/api";

interface EditBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: BatchDetail | null;
  item?: InventoryItem | null;
  suppliers?: Supplier[];
  onSave: (
    batchId: string,
    data: {
      batch_number?: string | null;
      expiry_date?: string | null;
      intake_date?: string | null;
      supplier_id?: string | null;
      notes?: string | null;
      shelf_life_alert_hrs?: number | null;
      mrp?: number | null;
      retail_price?: number | null;
      wholesale_price?: number | null;
      alternate_units?: Array<{ unit_label: string; conversion_factor: number }> | null;
      sync_catalog_price?: boolean;
    }
  ) => Promise<any>;
}

// Convert UTC/ISO string to YYYY-MM-DDThh:mm for datetime-local input
function toLocalDateTimeString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

// Convert UTC/ISO string to YYYY-MM-DD for date input
function toLocalDateString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function EditBatchModal({
  isOpen,
  onClose,
  batch,
  item,
  suppliers = [],
  onSave,
}: EditBatchModalProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [intakeDateLocal, setIntakeDateLocal] = useState("");
  const [expiryDateLocal, setExpiryDateLocal] = useState("");
  const [shelfLifeValue, setShelfLifeValue] = useState<string>("");
  const [shelfLifeUnit, setShelfLifeUnit] = useState<"DAYS" | "HOURS">("DAYS");
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [mrp, setMrp] = useState<string>("");
  const [retailPrice, setRetailPrice] = useState<string>("");
  const [wholesalePrice, setWholesalePrice] = useState<string>("");
  const [syncCatalogPrice, setSyncCatalogPrice] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batch) {
      setBatchNumber(batch.batch_number || "");
      setIntakeDateLocal(toLocalDateTimeString(batch.intake_date));
      setExpiryDateLocal(toLocalDateString(batch.expiry_date));
      if (batch.shelf_life_alert_hrs != null && batch.shelf_life_alert_hrs > 0) {
        if (batch.shelf_life_alert_hrs % 24 === 0) {
          setShelfLifeUnit("DAYS");
          setShelfLifeValue(String(batch.shelf_life_alert_hrs / 24));
        } else {
          setShelfLifeUnit("HOURS");
          setShelfLifeValue(String(batch.shelf_life_alert_hrs));
        }
      } else {
        setShelfLifeValue("");
        setShelfLifeUnit("DAYS");
      }
      setSupplierId(batch.supplier_id || "");
      setNotes(batch.notes || "");

      const bMrp = (batch as any).mrp != null ? String((batch as any).mrp) : (item?.mrp != null ? String(item.mrp) : "");
      const bRetail = (batch as any).retail_price != null ? String((batch as any).retail_price) : (item?.retail_price != null ? String(item.retail_price) : "");
      const bWholesale = (batch as any).wholesale_price != null ? String((batch as any).wholesale_price) : (item?.wholesale_price != null ? String(item.wholesale_price) : "");
      setMrp(bMrp);
      setRetailPrice(bRetail);
      setWholesalePrice(bWholesale);
      setSyncCatalogPrice(true);
      setError(null);
    }
  }, [batch, item]);

  const handleShelfLifeUnitChange = (newUnit: "DAYS" | "HOURS") => {
    if (newUnit === shelfLifeUnit) return;
    const val = parseFloat(shelfLifeValue);
    if (!isNaN(val) && val > 0) {
      if (newUnit === "DAYS") {
        const days = parseFloat((val / 24).toFixed(2));
        setShelfLifeValue(String(days));
      } else {
        const hrs = Math.round(val * 24);
        setShelfLifeValue(String(hrs));
      }
    }
    setShelfLifeUnit(newUnit);
  };

  const shelfLifeEquivalentHint = useMemo(() => {
    const val = parseFloat(shelfLifeValue);
    if (isNaN(val) || val <= 0) return null;
    if (shelfLifeUnit === "DAYS") {
      const hrs = Math.round(val * 24);
      return `≈ ${hrs} hr${hrs === 1 ? "" : "s"}`;
    } else {
      const days = parseFloat((val / 24).toFixed(2));
      return `≈ ${days} day${days === 1 ? "" : "s"}`;
    }
  }, [shelfLifeValue, shelfLifeUnit]);

  // Live Time-Reference Evaluation
  const timeDiagnostics = useMemo(() => {
    if (!intakeDateLocal) return null;
    const arrivalTime = new Date(intakeDateLocal).getTime();
    if (isNaN(arrivalTime)) return null;

    const now = Date.now();
    const elapsedHrs = (now - arrivalTime) / (3600 * 1000);
    const elapsedDays = Math.floor(elapsedHrs / 24);

    let calExpiryTime: number | null = null;
    if (expiryDateLocal) {
      const expDate = new Date(`${expiryDateLocal}T23:59:59`);
      if (!isNaN(expDate.getTime())) {
        calExpiryTime = expDate.getTime();
      }
    }

    let shelfExpiryTime: number | null = null;
    if (shelfLifeValue && !isNaN(parseFloat(shelfLifeValue))) {
      const rawNum = parseFloat(shelfLifeValue);
      const hrs = shelfLifeUnit === "DAYS" ? rawNum * 24 : rawNum;
      if (hrs > 0) {
        shelfExpiryTime = arrivalTime + hrs * 3600 * 1000;
      }
    }

    let effectiveExpiryTime: number | null = null;
    let expirySource: "CALENDAR" | "SHELF_LIFE" | "NONE" = "NONE";
    let bothConfigured = false;

    if (calExpiryTime != null && shelfExpiryTime != null) {
      bothConfigured = true;
      if (calExpiryTime <= shelfExpiryTime) {
        effectiveExpiryTime = calExpiryTime;
        expirySource = "CALENDAR";
      } else {
        effectiveExpiryTime = shelfExpiryTime;
        expirySource = "SHELF_LIFE";
      }
    } else if (calExpiryTime != null) {
      effectiveExpiryTime = calExpiryTime;
      expirySource = "CALENDAR";
    } else if (shelfExpiryTime != null) {
      effectiveExpiryTime = shelfExpiryTime;
      expirySource = "SHELF_LIFE";
    }

    let isExpired = false;
    let isExpiringSoon = false;
    let remainingHrs = 0;

    if (effectiveExpiryTime != null) {
      remainingHrs = (effectiveExpiryTime - now) / (3600 * 1000);
      if (remainingHrs <= 0) {
        isExpired = true;
      } else if (remainingHrs <= 7 * 24) {
        isExpiringSoon = true;
      }
    }

    return {
      arrivalTime,
      elapsedHrs: Math.max(0, Math.round(elapsedHrs * 10) / 10),
      elapsedDays,
      effectiveExpiryTime,
      expirySource,
      bothConfigured,
      isExpired,
      isExpiringSoon,
      remainingDays: Math.ceil(remainingHrs / 24),
    };
  }, [intakeDateLocal, expiryDateLocal, shelfLifeValue, shelfLifeUnit]);

  if (!isOpen || !batch) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!batchNumber.trim()) {
      setError("Batch / Lot number cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: {
        batch_number: string;
        intake_date?: string;
        expiry_date?: string | null;
        supplier_id?: string | null;
        notes?: string | null;
        shelf_life_alert_hrs?: number | null;
        mrp?: number | null;
        retail_price?: number | null;
        wholesale_price?: number | null;
        alternate_units?: Array<{ unit_label: string; conversion_factor: number }> | null;
        sync_catalog_price?: boolean;
      } = {
        batch_number: batchNumber.trim(),
        notes: notes.trim() || null,
        supplier_id: supplierId.trim() || null,
        mrp: mrp.trim() ? parseFloat(mrp.trim()) : null,
        retail_price: retailPrice.trim() ? parseFloat(retailPrice.trim()) : null,
        wholesale_price: wholesalePrice.trim() ? parseFloat(wholesalePrice.trim()) : null,
        sync_catalog_price: syncCatalogPrice,
      };

      if (intakeDateLocal) {
        payload.intake_date = new Date(intakeDateLocal).toISOString();
      }

      if (expiryDateLocal) {
        payload.expiry_date = new Date(`${expiryDateLocal}T00:00:00Z`).toISOString();
      } else {
        payload.expiry_date = null;
      }

      const parsedShelfLife = parseFloat(shelfLifeValue);
      if (!isNaN(parsedShelfLife) && parsedShelfLife > 0) {
        payload.shelf_life_alert_hrs = shelfLifeUnit === "DAYS"
          ? Math.max(1, Math.round(parsedShelfLife * 24))
          : Math.max(1, Math.round(parsedShelfLife));
      } else {
        payload.shelf_life_alert_hrs = null;
      }

      await onSave(batch.id, payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save batch details");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Edit className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                Edit Batch Details
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Update lot metadata, arrival date, expiry, and vendor information
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Product & Batch Summary Chip */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-[var(--text-primary)]">
              {batch.item_name}
            </span>
            {batch.item_barcode && (
              <span className="text-[10px] font-mono text-[var(--text-muted)] ml-2">
                [{batch.item_barcode}]
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
              Stock: {batch.remaining_quantity} {batch.unit}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              Cost: ₹{Number(batch.unit_cost).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Time-Reference Integrity Banner */}
        {timeDiagnostics && (
          <div
            className={`rounded-xl p-3 border text-xs space-y-1 ${
              timeDiagnostics.isExpired
                ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                : timeDiagnostics.isExpiringSoon
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                {timeDiagnostics.isExpired ? (
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                ) : timeDiagnostics.isExpiringSoon ? (
                  <Clock className="h-4 w-4 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
                {timeDiagnostics.isExpired
                  ? "Status: Expired / Shelf Life Elapsed"
                  : timeDiagnostics.isExpiringSoon
                  ? `Status: Expiring Soon (${timeDiagnostics.remainingDays} days left)`
                  : "Status: In Active Rotation"}
              </span>
              <span className="text-[10px] font-mono opacity-80">
                Arrived {timeDiagnostics.elapsedDays}d ({timeDiagnostics.elapsedHrs}h) ago
              </span>
            </div>
            <p className="text-[11px] opacity-90">
              {timeDiagnostics.bothConfigured ? (
                timeDiagnostics.expirySource === "SHELF_LIFE"
                  ? `⚡ Shelf life leads (shorter duration): Physical Arrival + ${shelfLifeValue}${shelfLifeUnit === "DAYS" ? "d" : "h"} (Expires earlier than calendar expiry: ${expiryDateLocal})`
                  : `⏳ Calendar Expiry leads (shorter duration): ${expiryDateLocal} (Expires earlier than arrival shelf life: ${shelfLifeValue}${shelfLifeUnit === "DAYS" ? "d" : "h"})`
              ) : timeDiagnostics.expirySource === "CALENDAR"
                ? `Anchored to Calendar Expiry: ${expiryDateLocal}`
                : timeDiagnostics.expirySource === "SHELF_LIFE"
                ? `Anchored to Physical Arrival + ${shelfLifeValue}${shelfLifeUnit === "DAYS" ? "d" : "h"} shelf life`
                : "No expiry configured (Non-perishable lot)."}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Batch / Lot Number */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Batch / Lot Number *
              </label>
              <input
                type="text"
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. LOT-2026-09A or BAT-01"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Physical Arrival / Intake Date */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                <span>Physical Arrival Date & Time</span>
                <span className="text-[10px] text-[var(--accent-brand)] font-bold">FEFO Anchor</span>
              </label>
              <input
                type="datetime-local"
                value={intakeDateLocal}
                onChange={(e) => setIntakeDateLocal(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                Freshness & shelf-life count from this arrival timestamp.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Calendar Expiry Date */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                <span>Expiry Date (Optional)</span>
                {expiryDateLocal && (
                  <button
                    type="button"
                    onClick={() => setExpiryDateLocal("")}
                    className="text-[10px] text-rose-400 hover:underline font-bold"
                  >
                    Clear Expiry
                  </button>
                )}
              </label>
              <input
                type="date"
                value={expiryDateLocal}
                onChange={(e) => setExpiryDateLocal(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Shelf Life Alert */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1">
                  <span>Shelf Life Alert</span>
                  {shelfLifeEquivalentHint && (
                    <span className="text-[10px] text-amber-400 font-mono font-normal">
                      ({shelfLifeEquivalentHint})
                    </span>
                  )}
                </label>
                <div className="inline-flex rounded-md p-0.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[10px]">
                  <button
                    type="button"
                    onClick={() => handleShelfLifeUnitChange("DAYS")}
                    className={`px-1.5 py-0.5 rounded transition ${
                      shelfLifeUnit === "DAYS"
                        ? "bg-amber-500 text-black font-bold shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShelfLifeUnitChange("HOURS")}
                    className={`px-1.5 py-0.5 rounded transition ${
                      shelfLifeUnit === "HOURS"
                        ? "bg-amber-500 text-black font-bold shadow-xs"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    Hrs
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step={shelfLifeUnit === "DAYS" ? "any" : "1"}
                  value={shelfLifeValue}
                  onChange={(e) => setShelfLifeValue(e.target.value)}
                  placeholder={shelfLifeUnit === "DAYS" ? "e.g. 2 or 0.5" : "e.g. 48"}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 pr-12 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-xs text-[var(--text-muted)] font-mono">
                  {shelfLifeUnit === "DAYS" ? "days" : "hrs"}
                </span>
              </div>
            </div>
          </div>

          {/* Supplier / Vendor */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Supplier / Vendor
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
            >
              <option value="">-- No Supplier Assigned / General Purchase --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.contact_person ? `(${s.contact_person})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Pricing & Margins */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
                Batch Pricing & Margins
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                Cost: ₹{Number(batch.unit_cost).toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  MRP (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  placeholder="e.g. 25.00"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Retail Selling Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="e.g. 20.00"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs text-emerald-400 font-bold focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                  Wholesale Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="e.g. 18.00"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs text-purple-300 font-bold focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={syncCatalogPrice}
                onChange={(e) => setSyncCatalogPrice(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-subtle)] text-amber-600 focus:ring-amber-500"
              />
              <div className="text-[11px] leading-tight">
                <span className="font-semibold text-[var(--text-primary)]">
                  Sync updated prices to Product Catalog & POS checkout
                </span>
                <span className="text-[10px] text-[var(--text-muted)] block">
                  Updates parent item master and online menu rates for active sales.
                </span>
              </div>
            </label>
          </div>

          {/* Configured Product Units (Read-only from Item Master) */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-bold text-xs text-[var(--text-primary)]">
                  Product Packaging & Units
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                Configured in Item Master
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs">
                <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Base:</span>
                <span className="font-mono font-bold text-emerald-400">{item?.unit || (batch as any).unit || "piece"}</span>
              </div>

              {Array.isArray(item?.alternate_units) && item.alternate_units.length > 0 ? (
                item.alternate_units.map((u, i) => (
                  <div key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-brand)]/10 border border-[var(--accent-brand)]/20 text-xs font-mono text-[var(--accent-brand)]">
                    <span>1 {item?.unit || "piece"} = {String((u as any)?.conversion_factor ?? "")} {String((u as any)?.unit_label ?? "")}</span>
                  </div>
                ))
              ) : (
                <span className="text-[11px] text-[var(--text-muted)] italic">
                  No secondary units. Edit the item master to configure secondary units.
                </span>
              )}
            </div>
          </div>

          {/* Lot Notes / Storage Remarks */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Storage Notes & Lot Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rack B4, refrigerated at 4°C, arrived in sound condition"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Information Notice */}
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-[var(--text-secondary)] flex items-start gap-2">
            <HelpCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Attributes & Pricing:</strong> This form edits lot identification, physical arrival,
              expiration parameters, batch prices, and secondary units without moving warehouse stock counts.
              To adjust stock levels or log shrinkage, use the dedicated <em>Wastage</em> or <em>Adjust</em> tools.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-500 transition disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save Batch Details
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
