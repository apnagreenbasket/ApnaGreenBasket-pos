import React, { useState, useEffect, useMemo } from "react";
import { Barcode, CheckCircle2, Package, Sparkles, X, Building2, Plus, Search, Percent, Trash2 } from "lucide-react";
import type { InventoryUnit, InventoryItem, Supplier } from "@/types";
import { formatLocalDate } from "@/lib/api";
import { parseBarcodeMask, generateItemPlu } from "../barcodeUtils";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

interface BarcodeRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  categories: string[];
  items?: InventoryItem[];
  suppliers?: Supplier[];
  prefillItem?: InventoryItem | null;
  scaleBarcodeFormat?: string | null;
  onOpenAddSupplierModal?: () => void;
  onSuccess: (itemName: string, stock: string) => void;
  onboardItem: (data: {
    item_id?: string;
    barcode: string;
    name: string;
    category: string;
    unit: InventoryUnit;
    initial_stock: number;
    cost_per_unit: number;
    selling_price?: number;
    mrp?: number;
    wholesale_price?: number;
    tax_category?: string;
    tax_rate?: number;
    sorted_quantity?: number;
    total_billed_amount?: number;
    margin_type?: string;
    retail_margin_pct?: number;
    mrp_margin_pct?: number;
    wholesale_margin_pct?: number;
    reorder_threshold?: number;
    batch_number?: string;
    expiry_date?: string;
    shelf_life_alert_hrs?: number;
    supplier_id?: string;
    hsn_code?: string;
    alternate_units?: Array<{ unit_label: string; conversion_factor: number }>;
  }) => Promise<void>;
}

export function BarcodeRegisterModal({
  isOpen,
  onClose,
  barcode,
  categories,
  items = [],
  suppliers = [],
  prefillItem,
  scaleBarcodeFormat,
  onOpenAddSupplierModal,
  onSuccess,
  onboardItem,
}: BarcodeRegisterModalProps) {
  const [customBarcode, setCustomBarcode] = useState(barcode);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);

  const [category, setCategory] = useState(categories[0] || "General");
  const [categorySearch, setCategorySearch] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  const [unit, setUnit] = useState<InventoryUnit>("pcs");
  const [alternateUnits, setAlternateUnits] = useState<Array<{ unit_label: string; conversion_factor: number }>>([]);
  const [initialStock, setInitialStock] = useState("0");
  const [sortedQuantity, setSortedQuantity] = useState("");
  const [totalBilledAmount, setTotalBilledAmount] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("0");
  const [mrp, setMrp] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");

  const [mrpExact, setMrpExact] = useState("");
  const [retailExact, setRetailExact] = useState("");
  const [wholesaleExact, setWholesaleExact] = useState("");

  const [taxCategory, setTaxCategory] = useState("GST 0%");
  const [taxRate, setTaxRate] = useState("0");
  const [customTaxRate, setCustomTaxRate] = useState("");
  const [hsnCode, setHsnCode] = useState("");

  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [shelfLifeValue, setShelfLifeValue] = useState("");
  const [shelfLifeUnit, setShelfLifeUnit] = useState<"DAYS" | "HOURS">("DAYS");

  // Margin States
  const [marginType, setMarginType] = useState<"MARKUP" | "MARGIN">("MARKUP");
  const [retailMarginPct, setRetailMarginPct] = useState("");
  const [mrpMarginPct, setMrpMarginPct] = useState("");
  const [wholesaleMarginPct, setWholesaleMarginPct] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Directly capture hardware scanner input while Register modal is open
  useBarcodeScanner({
    onScan: (scannedCode) => {
      const clean = scannedCode.trim();
      if (clean) {
        setCustomBarcode(clean);
      }
    },
    enabled: isOpen,
  });

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto-populate item fields from an existing InventoryItem instance
  const populateFromItem = (itm: InventoryItem) => {
    setSelectedItemId(itm.id);
    setName(itm.name);
    setCategory(itm.category || categories[0] || "General");
    setUnit(itm.unit || "pcs");
    // Preserve scanned / entered barcode when associating with an existing item.
    // Only copy barcode from existing item if customBarcode is currently empty.
    if (!customBarcode.trim() && itm.barcode) {
      setCustomBarcode(itm.barcode);
    }
    if (itm.cost_per_unit != null) setCostPerUnit(String(itm.cost_per_unit));

    if (itm.mrp != null) {
      setMrp(String(itm.mrp));
      setMrpExact(String(itm.mrp));
    }
    const effectiveRetail = itm.retail_price ?? (itm as any).selling_price;
    if (effectiveRetail != null) {
      setSellingPrice(String(effectiveRetail));
      setRetailExact(String(effectiveRetail));
    }
    if (itm.wholesale_price != null) {
      setWholesalePrice(String(itm.wholesale_price));
      setWholesaleExact(String(itm.wholesale_price));
    }

    // Retain Margin Type & Margin Percentages
    const mType = (itm.margin_type as "MARKUP" | "MARGIN") || "MARKUP";
    setMarginType(mType);

    const costNum = itm.cost_per_unit != null ? parseFloat(String(itm.cost_per_unit)) : 0;

    // Retain Retail Margin %
    if (itm.retail_margin_pct != null && String(itm.retail_margin_pct).trim() !== "") {
      setRetailMarginPct(String(itm.retail_margin_pct));
    } else if (costNum > 0 && effectiveRetail != null) {
      const rNum = parseFloat(String(effectiveRetail));
      if (rNum > 0) {
        const calc = mType === "MARKUP"
          ? ((rNum - costNum) / costNum) * 100
          : ((rNum - costNum) / rNum) * 100;
        if (calc > 0) setRetailMarginPct(calc.toFixed(1).replace(/\.0$/, ""));
      }
    }

    // Retain MRP Margin %
    if (itm.mrp_margin_pct != null && String(itm.mrp_margin_pct).trim() !== "") {
      setMrpMarginPct(String(itm.mrp_margin_pct));
    } else if (costNum > 0 && itm.mrp != null) {
      const mNum = parseFloat(String(itm.mrp));
      if (mNum > 0) {
        const calc = mType === "MARKUP"
          ? ((mNum - costNum) / costNum) * 100
          : ((mNum - costNum) / mNum) * 100;
        if (calc > 0) setMrpMarginPct(calc.toFixed(1).replace(/\.0$/, ""));
      }
    }

    // Retain Wholesale Margin %
    if (itm.wholesale_margin_pct != null && String(itm.wholesale_margin_pct).trim() !== "") {
      setWholesaleMarginPct(String(itm.wholesale_margin_pct));
    } else if (costNum > 0 && itm.wholesale_price != null) {
      const wNum = parseFloat(String(itm.wholesale_price));
      if (wNum > 0) {
        const calc = mType === "MARKUP"
          ? ((wNum - costNum) / costNum) * 100
          : ((wNum - costNum) / wNum) * 100;
        if (calc > 0) setWholesaleMarginPct(calc.toFixed(1).replace(/\.0$/, ""));
      }
    }

    if (itm.tax_category) setTaxCategory(itm.tax_category);
    if (itm.tax_rate != null) setTaxRate(String(itm.tax_rate));
    if ((itm as any).hsn_code) setHsnCode((itm as any).hsn_code);
    if (itm.shelf_life_alert_hrs != null && itm.shelf_life_alert_hrs > 0) {
      if (itm.shelf_life_alert_hrs % 24 === 0) {
        setShelfLifeUnit("DAYS");
        setShelfLifeValue(String(itm.shelf_life_alert_hrs / 24));
      } else {
        setShelfLifeUnit("HOURS");
        setShelfLifeValue(String(itm.shelf_life_alert_hrs));
      }
    } else {
      setShelfLifeValue("");
      setShelfLifeUnit("DAYS");
    }
    const supp = (itm as any).supplier_id || (itm as any).batches?.[0]?.supplier_id || "";
    if (supp) setSupplierId(supp);
    if ((itm as any).alternate_units && Array.isArray((itm as any).alternate_units)) {
      setAlternateUnits((itm as any).alternate_units);
    } else {
      setAlternateUnits([]);
    }
    setIsItemDropdownOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (prefillItem) {
        populateFromItem(prefillItem);
      } else {
        setSelectedItemId(undefined);
        setCustomBarcode(barcode);
        setName("");
        setCategory(categories[0] || "General");
        setUnit("pcs");
        setCostPerUnit("0");
        setMrp("");
        setSellingPrice("");
        setWholesalePrice("");
        setTaxCategory("GST 0%");
        setTaxRate("0");
        setSupplierId("");
        setAlternateUnits([]);
        setMarginType("MARKUP");
        setRetailMarginPct("");
        setMrpMarginPct("");
        setWholesaleMarginPct("");
        setMrpExact("");
        setRetailExact("");
        setWholesaleExact("");
        setHsnCode("");
      }
      setCategorySearch("");
      setIsCategoryDropdownOpen(false);
      setInitialStock("0");
      setSortedQuantity("");
      setTotalBilledAmount("");
      setCustomTaxRate("");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();
      setBatchNumber(`BAT-${dd}${mm}${yyyy}-${randHex}`);
      setExpiryDate("");
      setShelfLifeValue("");
      setShelfLifeUnit("DAYS");
      setError(null);
    }
  }, [isOpen, barcode, categories, prefillItem]);

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

  // Recalculate cost_per_unit dynamically when totalBilledAmount, sortedQuantity, or initialStock changes
  useEffect(() => {
    const billed = parseFloat(totalBilledAmount);
    const sorted = parseFloat(sortedQuantity);
    const initial = parseFloat(initialStock);

    if (!isNaN(billed) && billed > 0) {
      const effQty = !isNaN(sorted) && sorted > 0 ? sorted : !isNaN(initial) && initial > 0 ? initial : 0;
      if (effQty > 0) {
        setCostPerUnit((billed / effQty).toFixed(2));
      } else {
        setCostPerUnit("0.00");
      }
    }
  }, [totalBilledAmount, sortedQuantity, initialStock]);

  const parsedInitial = parseFloat(initialStock);
  const parsedSorted = parseFloat(sortedQuantity);
  const isBatchInward = (!isNaN(parsedInitial) && parsedInitial > 0) || (!isNaN(parsedSorted) && parsedSorted > 0);
  const effStock = !isNaN(parsedSorted) && parsedSorted > 0 ? parsedSorted : (!isNaN(parsedInitial) && parsedInitial > 0 ? parsedInitial : 0);
  const computedCostNum = parseFloat(totalBilledAmount) > 0 ? (effStock > 0 ? (parseFloat(totalBilledAmount) / effStock) : 0) : (parseFloat(costPerUnit) || 0);

  // Real-time calculation effect
  useEffect(() => {
    if (computedCostNum <= 0) return;

    const calcPrice = (marginStr: string) => {
      const margin = parseFloat(marginStr);
      if (isNaN(margin)) return { exact: "", rounded: "" };

      let price = 0;
      if (marginType === "MARKUP") {
        price = computedCostNum + (computedCostNum * margin / 100);
      } else {
        if (margin >= 100) return { exact: "", rounded: "" };
        price = computedCostNum / (1 - margin / 100);
      }
      return { exact: price.toFixed(2), rounded: Math.round(price).toString() };
    };

    if (retailMarginPct.trim() !== "") {
      const res = calcPrice(retailMarginPct);
      setSellingPrice(res.rounded);
      setRetailExact(res.exact);
    }
    if (mrpMarginPct.trim() !== "") {
      const res = calcPrice(mrpMarginPct);
      setMrp(res.rounded);
      setMrpExact(res.exact);
    }
    if (wholesaleMarginPct.trim() !== "") {
      const res = calcPrice(wholesaleMarginPct);
      setWholesalePrice(res.rounded);
      setWholesaleExact(res.exact);
    }

  }, [computedCostNum, marginType, retailMarginPct, mrpMarginPct, wholesaleMarginPct]);

  if (!isOpen) return null;

  const handleTaxCategoryChange = (val: string) => {
    setTaxCategory(val);
    if (val === "GST 0%") setTaxRate("0");
    else if (val === "GST 5%") setTaxRate("5");
    else if (val === "GST 12%") setTaxRate("12");
    else if (val === "GST 18%") setTaxRate("18");
    else if (val === "GST 28%") setTaxRate("28");
  };

  const filteredCategories = categories.filter((c) =>
    c.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a product name");
      return;
    }

    const billed = parseFloat(totalBilledAmount);
    const sorted = parseFloat(sortedQuantity);
    const initial = initialStock.trim() === "" ? 0 : parseFloat(initialStock);
    const sellPriceNum = parseFloat(sellingPrice);
    const mrpNum = parseFloat(mrp);

    if (isNaN(initial) || initial < 0 || (!isNaN(sorted) && sorted < 0) || (!isNaN(billed) && billed < 0)) {
      setError("Stock quantities and bill amounts cannot be negative numbers");
      return;
    }

    const isCreatingBatch = initial > 0 || (!isNaN(sorted) && sorted > 0);

    // If initial qty > 0 (condition of creating a batch), force compulsory values:
    // 1. Total Billed amount
    // 2. Retail Price (or derived from retail margin)
    if (isCreatingBatch) {
      if (isNaN(billed) || billed <= 0) {
        setError("Total Billed amount (₹) is compulsory when inwarding stock with initial quantity > 0");
        return;
      }
      if (isNaN(sellPriceNum) || sellPriceNum <= 0) {
        setError("Retail Price (₹) or Retail Margin (%) is compulsory when inwarding stock with initial quantity > 0");
        return;
      }
    }

    if (!isNaN(mrpNum) && mrpNum > 0 && !isNaN(sellPriceNum) && sellPriceNum > mrpNum) {
      setError(`Selling price (₹${sellPriceNum.toFixed(2)}) cannot exceed MRP (₹${mrpNum.toFixed(2)})`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const effQty = !isNaN(sorted) && sorted > 0 ? sorted : initial;
      const finalCost = !isNaN(billed) && billed > 0 ? (effQty > 0 ? billed / effQty : 0) : parseFloat(costPerUnit) || 0;
      const finalTaxRate = taxCategory === "Custom" ? parseFloat(customTaxRate) || 0 : parseFloat(taxRate) || 0;

      await onboardItem({
        item_id: selectedItemId,
        barcode: customBarcode.trim(),
        name: name.trim(),
        category: category.trim() || "General",
        unit,
        initial_stock: initial,
        sorted_quantity: !isNaN(sorted) && sorted > 0 ? sorted : undefined,
        total_billed_amount: !isNaN(billed) && billed > 0 ? billed : undefined,
        cost_per_unit: finalCost,
        selling_price: sellingPrice.trim() ? parseFloat(sellingPrice) : undefined,
        mrp: mrp.trim() ? parseFloat(mrp) : undefined,
        wholesale_price: wholesalePrice.trim() ? parseFloat(wholesalePrice) : undefined,
        margin_type: marginType,
        retail_margin_pct: retailMarginPct.trim() ? parseFloat(retailMarginPct) : undefined,
        mrp_margin_pct: mrpMarginPct.trim() ? parseFloat(mrpMarginPct) : undefined,
        wholesale_margin_pct: wholesaleMarginPct.trim() ? parseFloat(wholesaleMarginPct) : undefined,
        tax_category: taxCategory === "Custom" ? `GST ${finalTaxRate}%` : taxCategory,
        tax_rate: finalTaxRate,
        hsn_code: hsnCode.trim() || undefined,
        batch_number: batchNumber.trim() || undefined,
        expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        shelf_life_alert_hrs: (() => {
          const parsed = parseFloat(shelfLifeValue);
          if (!isNaN(parsed) && parsed > 0) {
            return shelfLifeUnit === "DAYS" ? Math.max(1, Math.round(parsed * 24)) : Math.max(1, Math.round(parsed));
          }
          return undefined;
        })(),
        supplier_id: supplierId || undefined,
        alternate_units: alternateUnits.filter((u) => u.unit_label.trim() && u.conversion_factor > 0),
      });

      onSuccess(name.trim(), String(effQty));
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to register product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const computedCost = computedCostNum.toFixed(2);
  const mrpVal = parseFloat(mrp);
  const sellVal = parseFloat(sellingPrice);
  const discountPercent = mrpVal > 0 && sellVal > 0 && mrpVal > sellVal ? Math.round(((mrpVal - sellVal) / mrpVal) * 100) : 0;
  const discountAmount = mrpVal > 0 && sellVal > 0 && mrpVal > sellVal ? (mrpVal - sellVal).toFixed(2) : "0.00";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {customBarcode.trim() ? "New Barcode Scanned!" : "Register Inventory Product & Batch"}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Inward stock with automatic cost calculation, MRP & tax rates.
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

        {/* Barcode Field */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Barcode className="h-4 w-4 text-[var(--accent-brand)]" />
              Scanned / Item Barcode
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                Scanner Ready
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                const mask = parseBarcodeMask(scaleBarcodeFormat);
                const existingCodes = items.map((it) => it.barcode).filter((b): b is string => Boolean(b));
                const plu = generateItemPlu(mask.itemCodeLength, existingCodes);
                setCustomBarcode(plu);
              }}
              className="text-[10px] text-[var(--accent-brand)] font-bold hover:underline bg-[var(--accent-brand)]/10 px-2 py-0.5 rounded-lg transition cursor-pointer"
              title={`Generate ${parseBarcodeMask(scaleBarcodeFormat).itemCodeLength}-digit PLU for active scale mask (${parseBarcodeMask(scaleBarcodeFormat).pattern})`}
            >
              Generate Internal Barcode ({parseBarcodeMask(scaleBarcodeFormat).itemCodeLength} digits)
            </button>
          </label>
          <input
            type="text"
            name="barcode"
            data-barcode-input="true"
            placeholder="Scan or type barcode (Optional)"
            value={customBarcode}
            onChange={(e) => setCustomBarcode(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono font-bold text-[var(--accent-brand)] focus:border-[var(--accent-brand)] focus:outline-none placeholder:font-sans placeholder:font-normal placeholder:text-[var(--text-muted)]"
          />
          {selectedItemId && (() => {
            const selectedItem = items.find((i) => i.id === selectedItemId);
            if (!selectedItem) return null;
            if (customBarcode.trim() && selectedItem.barcode && selectedItem.barcode !== customBarcode.trim()) {
              return (
                <p className="mt-1 text-[11px] text-amber-400 font-medium flex items-center gap-1">
                  <span>ℹ️</span> This will update & replace existing barcode (
                  <span className="font-mono line-through opacity-75">{selectedItem.barcode}</span> ➔ <span className="font-mono font-bold text-amber-300">{customBarcode.trim()}</span>)
                </p>
              );
            }
            if (customBarcode.trim() && !selectedItem.barcode) {
              return (
                <p className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <span>✓</span> Will associate this new barcode (<span className="font-mono font-bold">{customBarcode.trim()}</span>) with {selectedItem.name}
                </p>
              );
            }
            return null;
          })()}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Product Name with Existing Item Auto-Suggest */}
          <div className="relative">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
              <span>Product / Item Name *</span>
              {selectedItemId && (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {customBarcode.trim() ? "Linking barcode to existing item" : "Adding batch to existing item"}
                </span>
              )}
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="Type to search existing item or enter new item name..."
              value={name}
              onFocus={() => setIsItemDropdownOpen(true)}
              onChange={(e) => {
                setName(e.target.value);
                setSelectedItemId(undefined);
                setIsItemDropdownOpen(true);
              }}
              onBlur={() => {
                setTimeout(() => {
                  setIsItemDropdownOpen(false);
                  if (!selectedItemId && name.trim()) {
                    const exactMatch = items.find(
                      (i) => i.name.toLowerCase() === name.trim().toLowerCase()
                    );
                    if (exactMatch) {
                      populateFromItem(exactMatch);
                    }
                  }
                }, 200);
              }}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
            />

            {/* Existing Items Auto-suggest Dropdown */}
            {isItemDropdownOpen && name.trim() && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1 shadow-2xl">
                {items
                  .filter((itm) => itm.name.toLowerCase().includes(name.trim().toLowerCase()))
                  .slice(0, 8)
                  .map((itm) => (
                    <button
                      key={itm.id}
                      type="button"
                      onMouseDown={() => {
                        populateFromItem(itm);
                      }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--accent-brand)]/15 transition flex items-center justify-between border-b border-[var(--border-subtle)] last:border-0"
                    >
                      <div>
                        <p className="font-bold text-[var(--text-primary)]">{itm.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          Stock: {Number(itm.current_stock).toFixed(2)} {itm.unit} • {itm.category}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Select Existing
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Category Combobox Dropdown & Unit */}
          <div className="grid grid-cols-2 gap-3">
            {/* Category Combobox */}
            <div className="relative">
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Category *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Select or type new category..."
                  value={isCategoryDropdownOpen ? categorySearch : category}
                  onFocus={() => {
                    setIsCategoryDropdownOpen(true);
                    setCategorySearch(category);
                  }}
                  onChange={(e) => {
                    setCategorySearch(e.target.value);
                    setCategory(e.target.value);
                    setIsCategoryDropdownOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setIsCategoryDropdownOpen(false), 200);
                  }}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              {/* Combobox Dropdown List */}
              {isCategoryDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1 shadow-xl">
                  {filteredCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={() => {
                        setCategory(c);
                        setCategorySearch(c);
                        setIsCategoryDropdownOpen(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--accent-brand)]/15 hover:text-[var(--accent-brand)] transition"
                    >
                      {c}
                    </button>
                  ))}
                  {categorySearch.trim() && !categories.some(c => c.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setCategory(categorySearch.trim());
                        setIsCategoryDropdownOpen(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 transition"
                    >
                      + Create category "{categorySearch.trim()}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Unit of Measurement
              </label>
              <input
                type="text"
                list="inventory-units"
                value={unit}
                onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                placeholder="e.g. pcs, kg, box"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
              <datalist id="inventory-units">
                <option value="pcs">Pieces / Pack (pcs)</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="g">Gram (g)</option>
                <option value="l">Liter (l)</option>
                <option value="ml">Milliliter (ml)</option>
                <option value="box">Box</option>
                <option value="dozen">Dozen</option>
              </datalist>
            </div>
          </div>

          {/* Alternate Units */}
          <div className="p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-xs text-[var(--text-primary)]">
                Alternate Units (Optional)
              </label>
              <button
                type="button"
                onClick={() => setAlternateUnits([...alternateUnits, { unit_label: "", conversion_factor: 1 }])}
                className="text-[10px] font-bold text-[var(--accent-brand)] hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Unit
              </button>
            </div>
            {alternateUnits.length > 0 && (
              <div className="space-y-2">
                {alternateUnits.map((altUnit, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5 shrink-0 px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">1</span>
                      <span className="text-xs font-medium text-[var(--text-muted)] max-w-[60px] truncate" title={unit || "base"}>
                        {unit || "base"}
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
                        onChange={(e) => {
                          const newUnits = [...alternateUnits];
                          newUnits[idx].conversion_factor = parseFloat(e.target.value) || 1;
                          setAlternateUnits(newUnits);
                        }}
                        className="w-16 shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none text-center"
                      />
                      <input
                        type="text"
                        placeholder="e.g. piece, box"
                        value={altUnit.unit_label}
                        onChange={(e) => {
                          const newUnits = [...alternateUnits];
                          newUnits[idx].unit_label = e.target.value;
                          setAlternateUnits(newUnits);
                        }}
                        className="flex-1 min-w-0 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAlternateUnits(alternateUnits.filter((_, i) => i !== idx));
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 transition"
                      title="Remove unit"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inward Quantity & Invoice Cost Calculator */}
          <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]/40 p-3 space-y-2.5">
            <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
              <span>Inward Quantity & Invoice Cost</span>
              <span className="text-[10px] text-[var(--text-muted)] font-normal">
                {isBatchInward ? "Stock > 0 creates batch (Total Billed & Retail Price compulsory)" : "Stock 0 creates product catalog entry without batch"}
              </span>
            </h4>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Initial Qty
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Total Billed (₹) {isBatchInward ? <span className="text-amber-400 font-bold">*</span> : <span className="text-[10px] text-[var(--text-muted)] font-normal">(Opt)</span>}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={isBatchInward ? "e.g. 1000 (Required)" : "e.g. 1000"}
                  value={totalBilledAmount}
                  onChange={(e) => setTotalBilledAmount(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Sorted Qty (Opt)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 80"
                  value={sortedQuantity}
                  onChange={(e) => setSortedQuantity(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>
            </div>

            {/* Calculated Cost / Unit Feedback Badge */}
            <div className="flex items-center justify-between rounded-lg bg-[var(--bg-surface-elevated)] px-3 py-1.5 border border-[var(--border-subtle)] text-xs">
              <span className="text-[var(--text-muted)] font-medium">Cost / Unit:</span>
              <span className="font-mono font-bold text-emerald-400">
                ₹{computedCost} / {unit}
              </span>
            </div>
          </div>

          {/* Margin Configuration */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/30 p-3 space-y-2.5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-[var(--accent-brand)]" /> Auto-calculate Pricing from Margins
              </h4>
              <div className="flex items-center bg-[var(--bg-surface-elevated)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setMarginType("MARKUP")}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition ${marginType === "MARKUP" ? "bg-[var(--accent-brand)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                >
                  Markup %
                </button>
                <button
                  type="button"
                  onClick={() => setMarginType("MARGIN")}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition ${marginType === "MARGIN" ? "bg-[var(--accent-brand)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                >
                  True Margin %
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  MRP Margin (%)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 30"
                  value={mrpMarginPct}
                  onChange={(e) => setMrpMarginPct(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Retail Margin (%)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 20"
                  value={retailMarginPct}
                  onChange={(e) => setRetailMarginPct(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Wholesale Margin (%)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 10"
                  value={wholesaleMarginPct}
                  onChange={(e) => setWholesaleMarginPct(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Pricing (MRP vs Retail Selling Price vs Wholesale Price) */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                MRP (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Printed MRP"
                value={mrp}
                onChange={(e) => {
                  setMrp(e.target.value);
                  setMrpMarginPct(""); // clear margin if manual override
                  setMrpExact("");
                }}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
              {mrpExact && mrpExact !== mrp && (
                <div className="text-[9px] text-[var(--text-muted)] mt-1 ml-1 font-mono">
                  Exact: ₹{mrpExact}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Retail Price (₹) {isBatchInward ? <span className="text-amber-400 font-bold">*</span> : <span className="text-[10px] text-[var(--text-muted)] font-normal">(Opt)</span>}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={isBatchInward ? "Store POS price (Required)" : "Store POS price"}
                value={sellingPrice}
                onChange={(e) => {
                  setSellingPrice(e.target.value);
                  setRetailMarginPct(""); // clear margin if manual override
                  setRetailExact("");
                }}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
              {retailExact && retailExact !== sellingPrice && (
                <div className="text-[9px] text-[var(--text-muted)] mt-1 ml-1 font-mono">
                  Exact: ₹{retailExact}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Wholesale (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Bulk POS price"
                value={wholesalePrice}
                onChange={(e) => {
                  setWholesalePrice(e.target.value);
                  setWholesaleMarginPct(""); // clear margin if manual override
                  setWholesaleExact("");
                }}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
              {wholesaleExact && wholesaleExact !== wholesalePrice && (
                <div className="text-[9px] text-[var(--text-muted)] mt-1 ml-1 font-mono">
                  Exact: ₹{wholesaleExact}
                </div>
              )}
            </div>
          </div>

          {/* Live Discount Preview Badge */}
          {discountPercent > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 font-medium">
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-[11px]">
                {discountPercent}% OFF
              </span>
              <span>Customer saves ₹{discountAmount} compared to MRP</span>
            </div>
          )}

          {/* Tax Category (GST Rate %) & HSN/SAC Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Tax Category (GST %)
              </label>
              <div className="flex gap-2">
                <select
                  value={taxCategory}
                  onChange={(e) => handleTaxCategoryChange(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                >
                  <option value="GST 0%">GST 0% (Exempt)</option>
                  <option value="GST 5%">GST 5%</option>
                  <option value="GST 12%">GST 12%</option>
                  <option value="GST 18%">GST 18%</option>
                  <option value="GST 28%">GST 28%</option>
                  <option value="Custom">Custom Tax Rate...</option>
                </select>

                {taxCategory === "Custom" && (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Custom GST %"
                    value={customTaxRate}
                    onChange={(e) => setCustomTaxRate(e.target.value)}
                    className="w-24 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                HSN / SAC Code
              </label>
              <input
                type="text"
                maxLength={8}
                placeholder="e.g. 2106 or 1006"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value.trim())}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
          </div>

          {/* Batch Tracking & Supplier Fields */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 p-3 space-y-2.5">
            <h4 className="text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                Batch Lot & Supplier Details
              </span>
            </h4>

            {/* Supplier Selector */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-purple-400" /> Vendor / Supplier
                </span>
                {onOpenAddSupplierModal && (
                  <button
                    type="button"
                    onClick={onOpenAddSupplierModal}
                    className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Add Supplier
                  </button>
                )}
              </label>
              <div className="flex gap-2">
                <select
                  value={supplierId}
                  onChange={(e) => {
                    if (e.target.value === "__ADD_NEW__") {
                      if (onOpenAddSupplierModal) onOpenAddSupplierModal();
                    } else {
                      setSupplierId(e.target.value);
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select Supplier (Optional)...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ""}
                    </option>
                  ))}
                  {onOpenAddSupplierModal && (
                    <option value="__ADD_NEW__" className="font-bold text-purple-400">
                      + Add New Supplier...
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Batch / Lot #
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-red-400 flex items-center gap-1">
                    Shelf Life Alert
                    {shelfLifeEquivalentHint && (
                      <span className="text-[10px] text-red-300/80 font-mono font-normal">
                        ({shelfLifeEquivalentHint})
                      </span>
                    )}
                  </label>
                  <div className="inline-flex rounded-md p-0.5 bg-[var(--bg-surface)] border border-red-500/20 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleShelfLifeUnitChange("DAYS")}
                      className={`px-1.5 py-0.5 rounded transition ${
                        shelfLifeUnit === "DAYS"
                          ? "bg-red-500 text-white font-bold shadow-xs"
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
                          ? "bg-red-500 text-white font-bold shadow-xs"
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
                    placeholder={shelfLifeUnit === "DAYS" ? "e.g. 2 or 0.5" : "e.g. 48"}
                    value={shelfLifeValue}
                    onChange={(e) => setShelfLifeValue(e.target.value)}
                    className="w-full rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 pr-11 text-xs font-mono text-red-300 focus:border-red-500 focus:outline-none placeholder:text-red-900/50"
                  />
                  <span className="absolute right-2.5 top-1.5 text-[10px] font-mono font-semibold text-red-400/70 pointer-events-none">
                    {shelfLifeUnit === "DAYS" ? "days" : "hrs"}
                  </span>
                </div>
              </div>
            </div>
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
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:opacity-90 transition disabled:opacity-50 shadow-md"
            >
              {isSubmitting ? (
                "Saving..."
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {isBatchInward ? "Save & Inward Stock" : "Save Product (0 Stock)"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
