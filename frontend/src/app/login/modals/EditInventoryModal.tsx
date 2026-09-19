"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Edit,
  Barcode,
  Tag,
  Plus,
  Trash2,
  TrendingUp,
  AlertCircle,
  Percent,
  Layers,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Scale,
} from "lucide-react";
import type { InventoryItem } from "@/types";

interface EditInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  onSave: (
    itemId: string,
    data: {
      name?: string;
      barcode?: string | null;
      category?: string;
      unit?: string;
      hsn_code?: string | null;
      tax_category?: string | null;
      tax_rate?: number | null;
      cost_per_unit?: number | null;
      mrp?: number | null;
      retail_price?: number | null;
      wholesale_price?: number | null;
      reorder_threshold?: number | null;
      shelf_life_alert_hrs?: number | null;
      allow_oversell?: boolean;
      alternate_units?: Array<{ unit_label: string; conversion_factor: number }>;
    }
  ) => Promise<any>;
  existingCategories?: string[];
}

const COMMON_UNITS = [
  "piece",
  "kg",
  "gm",
  "litre",
  "ml",
  "box",
  "pack",
  "dozen",
  "pair",
  "bag",
  "can",
  "bottle",
];

const TAX_PRESETS: Record<string, number> = {
  "GST 0%": 0,
  "GST 5%": 5,
  "GST 12%": 12,
  "GST 18%": 18,
  "GST 28%": 28,
  "Exempt": 0,
};

export function EditInventoryModal({
  isOpen,
  onClose,
  item,
  onSave,
  existingCategories = [],
}: EditInventoryModalProps) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("piece");
  const [hsnCode, setHsnCode] = useState("");
  const [taxCategory, setTaxCategory] = useState("GST 0%");
  const [taxRate, setTaxRate] = useState<number>(0);
  const [costPerUnit, setCostPerUnit] = useState("");
  const [mrp, setMrp] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState("5");
  const [shelfLifeValue, setShelfLifeValue] = useState("");
  const [shelfLifeUnit, setShelfLifeUnit] = useState<"DAYS" | "HOURS">("DAYS");
  const [allowOversell, setAllowOversell] = useState(true);
  const [alternateUnits, setAlternateUnits] = useState<
    Array<{ unit_label: string; conversion_factor: number }>
  >([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate state when item opens
  useEffect(() => {
    if (item) {
      setName(item.name || "");
      setBarcode(item.barcode || "");
      setCategory(item.category || "General");
      setUnit(item.unit || "piece");
      setHsnCode(item.hsn_code || "");
      setTaxCategory(item.tax_category || "GST 0%");
      setTaxRate(
        item.tax_rate !== undefined && item.tax_rate !== null
          ? parseFloat(String(item.tax_rate))
          : 0
      );
      setCostPerUnit(
        item.cost_per_unit !== undefined && item.cost_per_unit !== null
          ? String(item.cost_per_unit)
          : "0.00"
      );
      setMrp(
        item.mrp !== undefined && item.mrp !== null ? String(item.mrp) : ""
      );
      setRetailPrice(
        item.retail_price !== undefined && item.retail_price !== null
          ? String(item.retail_price)
          : ""
      );
      setWholesalePrice(
        item.wholesale_price !== undefined && item.wholesale_price !== null
          ? String(item.wholesale_price)
          : ""
      );
      setReorderThreshold(
        item.reorder_threshold !== undefined && item.reorder_threshold !== null
          ? String(item.reorder_threshold)
          : "5"
      );
      if (item.shelf_life_alert_hrs !== undefined && item.shelf_life_alert_hrs !== null && item.shelf_life_alert_hrs > 0) {
        if (item.shelf_life_alert_hrs % 24 === 0) {
          setShelfLifeUnit("DAYS");
          setShelfLifeValue(String(item.shelf_life_alert_hrs / 24));
        } else {
          setShelfLifeUnit("HOURS");
          setShelfLifeValue(String(item.shelf_life_alert_hrs));
        }
      } else {
        setShelfLifeValue("");
        setShelfLifeUnit("DAYS");
      }
      setAllowOversell(item.allow_oversell ?? true);
      setAlternateUnits(
        Array.isArray(item.alternate_units) ? [...item.alternate_units] : []
      );
      setError(null);
    }
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  const formBodyRef = useRef<HTMLFormElement>(null);

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

  if (!isOpen || !item) return null;

  const handleTaxCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value;
    setTaxCategory(cat);
    if (cat in TAX_PRESETS) {
      setTaxRate(TAX_PRESETS[cat]);
    }
  };

  const handleAddAlternateUnit = () => {
    setAlternateUnits((prev) => [
      ...prev,
      { unit_label: "", conversion_factor: 1 },
    ]);
  };

  const handleRemoveAlternateUnit = (index: number) => {
    setAlternateUnits((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateAlternateUnit = (
    index: number,
    field: "unit_label" | "conversion_factor",
    val: any
  ) => {
    setAlternateUnits((prev) => {
      const copy = [...prev];
      if (field === "conversion_factor") {
        copy[index] = { ...copy[index], conversion_factor: parseFloat(val) || 1 };
      } else {
        copy[index] = { ...copy[index], unit_label: String(val) };
      }
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Item name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Clean alternate units
      const cleanedAltUnits = alternateUnits
        .filter((u) => u.unit_label.trim() && u.conversion_factor > 0)
        .map((u) => ({
          unit_label: u.unit_label.trim().toLowerCase(),
          conversion_factor: Number(u.conversion_factor),
        }));

      await onSave(item.id, {
        name: name.trim(),
        barcode: barcode.trim() || null,
        category: category.trim() || "General",
        unit: unit.trim().toLowerCase(),
        hsn_code: hsnCode.trim() || null,
        tax_category: taxCategory,
        tax_rate: Number(taxRate) || 0,
        cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : 0,
        mrp: mrp ? parseFloat(mrp) : null,
        retail_price: retailPrice ? parseFloat(retailPrice) : null,
        wholesale_price: wholesalePrice ? parseFloat(wholesalePrice) : null,
        reorder_threshold: reorderThreshold ? parseFloat(reorderThreshold) : 0,
        shelf_life_alert_hrs: (() => {
          const parsed = parseFloat(shelfLifeValue);
          if (!isNaN(parsed) && parsed > 0) {
            return shelfLifeUnit === "DAYS" ? Math.max(1, Math.round(parsed * 24)) : Math.max(1, Math.round(parsed));
          }
          return null;
        })(),
        allow_oversell: allowOversell,
        alternate_units: cleanedAltUnits,
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to update inventory item");
      formBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Edit className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                Edit Inventory Item
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono">
                  {item.name}
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Configure HSN, barcode, category, tax, alternate units, and pricing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          ref={formBodyRef}
          onSubmit={handleSubmit}
          className="p-5 overflow-y-auto space-y-4 custom-scrollbar flex-1"
        >
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Product Identity & Statutory Details */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
              <Tag className="h-3.5 w-3.5 text-amber-400" />
              <span>Product Identity & Statutory Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Product Name */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. DATES or Basmati Rice"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1 flex items-center justify-between">
                  <span>Barcode (EAN / UPC)</span>
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcode("")}
                      className="text-[10px] text-red-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan or enter barcode"
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-8 pr-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                  />
                  <Barcode className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Category
                </label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Fruits, Snacks, Grocery"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
                <datalist id="category-suggestions">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* HSN / SAC Code */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1 flex items-center justify-between">
                  <span>HSN / SAC Code</span>
                  <span className="text-[10px] text-amber-400 font-mono font-semibold">For GSTR-1 T12</span>
                </label>
                <input
                  type="text"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder="e.g. 08041000 or 1905"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: GST Tax Configuration */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
              <Percent className="h-3.5 w-3.5 text-amber-400" />
              <span>GST Tax Rates & Slabs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Tax Category */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Tax Category
                </label>
                <select
                  value={taxCategory}
                  onChange={handleTaxCategoryChange}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                >
                  <option value="GST 0%">GST 0% (Nil Rated)</option>
                  <option value="GST 5%">GST 5% (Essential Goods)</option>
                  <option value="GST 12%">GST 12% (Standard Slabs)</option>
                  <option value="GST 18%">GST 18% (General Foods & FMCG)</option>
                  <option value="GST 28%">GST 28% (Luxury / Aerated)</option>
                  <option value="Exempt">Exempt / Non-GST</option>
                </select>
              </div>

              {/* Statutory Tax Rate (%) */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Effective Tax Rate (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1.5 text-xs text-[var(--text-muted)]">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Base Unit & Alternate Units Configuration */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <div className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-amber-400" />
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    Alternate Units Configuration
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Configure secondary units for this item if omitted during creation (e.g. 1 dozen = 12 piece).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddAlternateUnit}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-brand)]/10 border border-[var(--accent-brand)]/30 px-2.5 py-1 text-[11px] font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Add Unit
              </button>
            </div>

            {/* Base Unit Selector */}
            <div className="max-w-xs">
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                Base Inventory Unit
              </label>
              <input
                type="text"
                list="unit-presets"
                value={unit}
                onChange={(e) => setUnit(e.target.value.toLowerCase())}
                placeholder="e.g. piece, kg"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
              />
              <datalist id="unit-presets">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            {/* Alternate Units List */}
            {alternateUnits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-center text-[11px] text-[var(--text-muted)]">
                No alternate units configured. Base unit is{" "}
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {unit || "piece"}
                </span>.
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {alternateUnits.map((altUnit, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">1</span>
                      <span
                        className="text-xs font-medium text-[var(--text-muted)] max-w-[70px] truncate"
                        title={unit || "piece"}
                      >
                        {unit || "piece"}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[var(--text-muted)] shrink-0">=</span>
                    <div className="flex items-center flex-1 min-w-0 gap-2">
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        placeholder="factor"
                        value={altUnit.conversion_factor}
                        onChange={(e) =>
                          handleUpdateAlternateUnit(idx, "conversion_factor", e.target.value)
                        }
                        className="w-20 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none text-center"
                      />
                      <input
                        type="text"
                        placeholder="e.g. piece, box, crate"
                        value={altUnit.unit_label}
                        onChange={(e) =>
                          handleUpdateAlternateUnit(idx, "unit_label", e.target.value)
                        }
                        className="flex-1 min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveAlternateUnit(idx)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                        title="Remove unit"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Pricing & Stock Controls */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
              <span>Pricing & Inventory Controls</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Cost Price */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Cost Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* MRP */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  MRP (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Retail Selling Price */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Retail Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Wholesale Price */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Wholesale (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Reorder Threshold */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  Low Stock Alert
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={reorderThreshold}
                  onChange={(e) => setReorderThreshold(e.target.value)}
                  placeholder="5"
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Shelf Life Alert */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                    <span>Shelf Life</span>
                    {shelfLifeEquivalentHint && (
                      <span className="text-[10px] text-amber-400 font-mono font-normal">
                        ({shelfLifeEquivalentHint})
                      </span>
                    )}
                  </label>
                  <div className="inline-flex rounded-md p-0.5 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[10px]">
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
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 pr-11 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] font-mono text-[var(--text-muted)]">
                    {shelfLifeUnit === "DAYS" ? "days" : "hrs"}
                  </span>
                </div>
              </div>

              {/* Allow Oversell Toggle */}
              <div className="sm:col-span-2 flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowOversell}
                    onChange={(e) => setAllowOversell(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-subtle)] bg-[var(--bg-surface)] text-amber-500 focus:ring-amber-400"
                  />
                  <div className="text-[11px] leading-tight">
                    <span className="font-semibold text-[var(--text-primary)]">
                      Allow Oversell
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Permit sales even if physical batch stock reaches zero
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Sync Guarantee Alert */}
          <div className="flex items-center gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-[11px] text-cyan-300">
            <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-400" />
            <span>
              <strong>Menu Item Auto-Sync:</strong> Changes to name, barcode, category, HSN, tax rate, alternate units, and prices automatically synchronize to associated Menu Items for instant POS billing.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-amber-700 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
