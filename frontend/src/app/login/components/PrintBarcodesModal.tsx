import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  X,
  Printer,
  LayoutGrid,
  ScrollText,
  Scale,
  Tag,
  RefreshCw,
  Sparkles,
  Info,
  CheckCircle2,
} from "lucide-react";
import Barcode from "react-barcode";
import { useReactToPrint } from "react-to-print";
import type { InventoryItem } from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import {
  parseBarcodeMask,
  buildScaleBarcode,
  generateItemPlu,
  calculateEan13CheckDigit,
  decodeScaleBarcode,
} from "../barcodeUtils";

interface PrintBarcodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  restaurant?: RestaurantProfile | null;
}

export function PrintBarcodesModal({
  isOpen,
  onClose,
  item,
  restaurant,
}: PrintBarcodesModalProps) {
  // Parsed hardware mask from active outlet settings
  const mask = useMemo(
    () => parseBarcodeMask(restaurant?.weighing_scale_barcode_format),
    [restaurant?.weighing_scale_barcode_format]
  );

  // Check if item is weight-based
  const isWeightBased = useMemo(() => {
    if (!item?.unit) return false;
    const u = String(item.unit).toLowerCase();
    return ["kg", "gm", "g", "gram", "kilogram"].includes(u);
  }, [item?.unit]);

  // Barcode Mode: "SCALE" (embedded hardware mask) vs "GENERIC" (direct item code-128)
  const [barcodeMode, setBarcodeMode] = useState<"SCALE" | "GENERIC">("SCALE");

  // Dynamic scale variables
  const [itemPlu, setItemPlu] = useState("");
  const [weightValue, setWeightValue] = useState<number | string>(500);
  const [weightUnit, setWeightUnit] = useState<"g" | "kg">("g");
  const [priceValue, setPriceValue] = useState<number | string>(0);

  // Composite Barcode Value (live-generated or directly edited)
  const [compositeBarcode, setCompositeBarcode] = useState("");
  const [isManuallyOverridden, setIsManuallyOverridden] = useState(false);

  // Print settings
  const [printFormat, setPrintFormat] = useState<"A4" | "THERMAL">("A4");
  const [quantity, setQuantity] = useState(40);
  const [showItemName, setShowItemName] = useState(true);
  const [showSubtext, setShowSubtext] = useState(true);

  // Initialize values on open / item change
  useEffect(() => {
    if (isOpen && item) {
      // Default mode: SCALE for weight-based, GENERIC for packaged items
      const initialMode = isWeightBased ? "SCALE" : "GENERIC";
      setBarcodeMode(initialMode);

      // Pre-fill Item PLU: take digits from item.barcode and pad, or generate PLU
      let initialPlu = "";
      if (item.barcode && /\d/.test(item.barcode)) {
        const digitsOnly = item.barcode.replace(/\D/g, "");
        initialPlu = digitsOnly.slice(-mask.itemCodeLength).padStart(mask.itemCodeLength, "0");
      } else {
        initialPlu = generateItemPlu(mask.itemCodeLength);
      }
      setItemPlu(initialPlu);

      // Pre-fill weight
      setWeightValue(500);
      setWeightUnit("g");

      // Pre-fill price
      const unitPrice = parseFloat(String(item.retail_price || item.mrp || "0")) || 0;
      setPriceValue(Math.round(unitPrice * 0.5)); // 500g default

      // Build composite barcode
      const generated = buildScaleBarcode(mask.rawFormat, {
        itemPlu: initialPlu,
        weightGrams: 500,
        priceInr: Math.round(unitPrice * 0.5),
      });

      if (initialMode === "SCALE") {
        setCompositeBarcode(generated);
      } else {
        setCompositeBarcode(item.barcode || item.id.split("-")[0].toUpperCase());
      }

      setIsManuallyOverridden(false);
      setPrintFormat("A4");
      setQuantity(40);
    }
  }, [isOpen, item, mask.rawFormat, mask.itemCodeLength, isWeightBased]);

  // Recalculate composite scale barcode when mask inputs change (unless manually overridden)
  const calculatedWeightGrams = useMemo(() => {
    const num = parseFloat(String(weightValue)) || 0;
    return weightUnit === "kg" ? Math.round(num * 1000) : Math.round(num);
  }, [weightValue, weightUnit]);

  useEffect(() => {
    if (barcodeMode === "SCALE" && !isManuallyOverridden) {
      const generated = buildScaleBarcode(mask.rawFormat, {
        itemPlu,
        weightGrams: calculatedWeightGrams,
        priceInr: priceValue,
      });
      setCompositeBarcode(generated);
    }
  }, [barcodeMode, itemPlu, calculatedWeightGrams, priceValue, mask.rawFormat, isManuallyOverridden]);

  // Switch modes handler
  const handleModeSwitch = (mode: "SCALE" | "GENERIC") => {
    setBarcodeMode(mode);
    setIsManuallyOverridden(false);
    if (mode === "SCALE") {
      const generated = buildScaleBarcode(mask.rawFormat, {
        itemPlu,
        weightGrams: calculatedWeightGrams,
        priceInr: priceValue,
      });
      setCompositeBarcode(generated);
    } else {
      setCompositeBarcode(item?.barcode || item?.id.split("-")[0].toUpperCase() || "ITEM");
    }
  };

  // Re-sync / Autogenerate composite barcode
  const handleSyncBarcode = () => {
    if (barcodeMode === "SCALE") {
      const generated = buildScaleBarcode(mask.rawFormat, {
        itemPlu,
        weightGrams: calculatedWeightGrams,
        priceInr: priceValue,
      });
      setCompositeBarcode(generated);
    } else {
      setCompositeBarcode(item?.barcode || item?.id.split("-")[0].toUpperCase() || "ITEM");
    }
    setIsManuallyOverridden(false);
  };

  // Autogenerate PLU handler
  const handleGeneratePlu = () => {
    const newPlu = generateItemPlu(mask.itemCodeLength);
    setItemPlu(newPlu);
    setIsManuallyOverridden(false);
  };

  // Auto-calculate price from weight if unit price is known
  const handleWeightChange = (val: string) => {
    setWeightValue(val);
    const num = parseFloat(val) || 0;
    const grams = weightUnit === "kg" ? num * 1000 : num;
    const unitPrice = parseFloat(String(item?.retail_price || item?.mrp || "0")) || 0;
    if (unitPrice > 0) {
      setPriceValue(Math.round((unitPrice * grams) / 1000));
    }
  };

  // Printing hook
  const componentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Barcodes_${item?.name}`,
  });

  // Check symbology for react-barcode
  const isEan13Compatible = useMemo(() => {
    if (!/^\d{13}$/.test(compositeBarcode)) return false;
    return calculateEan13CheckDigit(compositeBarcode.slice(0, 12)) === compositeBarcode[12];
  }, [compositeBarcode]);

  const activeSymbology = isEan13Compatible ? "EAN13" : "CODE128";

  // Label subtext (e.g. "Net Wt: 500g • ₹150")
  const labelSubtext = useMemo(() => {
    if (!showSubtext) return "";
    const parts: string[] = [];
    if (barcodeMode === "SCALE") {
      if (mask.hasWeight && calculatedWeightGrams > 0) {
        parts.push(calculatedWeightGrams >= 1000 ? `${(calculatedWeightGrams / 1000).toFixed(3)} kg` : `${calculatedWeightGrams}g`);
      }
      if (mask.hasPrice && Number(priceValue) > 0) {
        parts.push(`₹${priceValue}`);
      }
    } else {
      if (item?.retail_price) {
        parts.push(`₹${item.retail_price}`);
      }
    }
    return parts.join(" • ");
  }, [showSubtext, barcodeMode, mask.hasWeight, mask.hasPrice, calculatedWeightGrams, priceValue, item?.retail_price]);

  // Decode summary for preview
  const decodedInfo = useMemo(() => {
    if (barcodeMode !== "SCALE") return null;
    return decodeScaleBarcode(mask.rawFormat, compositeBarcode);
  }, [barcodeMode, mask.rawFormat, compositeBarcode]);

  if (!isOpen || !item) return null;

  return (
    <>
      {/* Screen Modal */}
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)]">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Print Product Barcodes
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Generate scale-ready or retail barcodes for <strong className="text-[var(--text-primary)]">{item.name}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Barcode Mode Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Barcode Format Mode
              </span>
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Scale className="h-3 w-3" /> Scale Mask: {mask.pattern}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeSwitch("SCALE")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  barcodeMode === "SCALE"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-sm"
                    : "bg-[var(--bg-surface-elevated)] border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Scale className="h-4 w-4 text-amber-400" />
                <span>Weighing Scale Barcode ({mask.pattern})</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeSwitch("GENERIC")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  barcodeMode === "GENERIC"
                    ? "bg-[var(--accent-brand)] border-[var(--accent-brand)] text-white shadow-sm"
                    : "bg-[var(--bg-surface-elevated)] border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Tag className="h-4 w-4" />
                <span>Standard Item Barcode (Code-128)</span>
              </button>
            </div>
          </div>

          {/* Variable Inputs for Scale Barcode */}
          {barcodeMode === "SCALE" ? (
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
              <div className="flex items-center justify-between text-xs text-amber-300 font-semibold">
                <span className="flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 text-amber-400" />
                  Encoded Scale Inputs ({mask.pattern})
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Prefix: <b className="font-mono text-amber-400">{mask.prefix || "None"}</b> • PLU digits: <b className="font-mono text-amber-400">{mask.itemCodeLength}</b>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Item Code (PLU) */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                    <span>Item PLU ({mask.itemCodeLength} digits)</span>
                    <button
                      type="button"
                      onClick={handleGeneratePlu}
                      className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                      title="Generate new unused PLU for this item"
                    >
                      <Sparkles className="h-2.5 w-2.5" /> Auto PLU
                    </button>
                  </label>
                  <input
                    type="text"
                    maxLength={mask.itemCodeLength}
                    value={itemPlu}
                    onChange={(e) => {
                      setItemPlu(e.target.value.replace(/\D/g, ""));
                      setIsManuallyOverridden(false);
                    }}
                    placeholder={`e.g. ${"1".padStart(mask.itemCodeLength, "0")}`}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-mono font-bold text-amber-400 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {/* Weight Input (if mask has W) */}
                {mask.hasWeight ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                      <span>Weight ({mask.weightLength} digits)</span>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            if (weightUnit === "kg") {
                              setWeightUnit("g");
                              setWeightValue((prev) => Math.round(Number(prev || 0) * 1000));
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded ${weightUnit === "g" ? "bg-amber-400 text-black font-bold" : "text-[var(--text-muted)]"}`}
                        >
                          g
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (weightUnit === "g") {
                              setWeightUnit("kg");
                              setWeightValue((prev) => (Number(prev || 0) / 1000).toFixed(3));
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded ${weightUnit === "kg" ? "bg-amber-400 text-black font-bold" : "text-[var(--text-muted)]"}`}
                        >
                          kg
                        </button>
                      </div>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={weightUnit === "kg" ? "0.005" : "1"}
                      value={weightValue}
                      onChange={(e) => handleWeightChange(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                ) : null}

                {/* Price Input (if mask has P) */}
                {mask.hasPrice ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1">
                      Total Price (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={priceValue}
                      onChange={(e) => {
                        setPriceValue(e.target.value);
                        setIsManuallyOverridden(false);
                      }}
                      placeholder="e.g. 150"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Barcode Override & Sync */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <span>Active Barcode Value</span>
                {isManuallyOverridden && (
                  <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded font-normal">
                    (Manual Override)
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={handleSyncBarcode}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                title="Reset/recalculate barcode from inputs"
              >
                <RefreshCw className="h-3 w-3" /> Re-sync with Mask
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={compositeBarcode}
                onChange={(e) => {
                  setCompositeBarcode(e.target.value);
                  setIsManuallyOverridden(true);
                }}
                className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-mono font-bold tracking-wider text-[var(--text-primary)] focus:border-amber-400 focus:outline-none"
                placeholder="Scan or enter barcode"
              />
              <div className="flex items-center px-3 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] text-[11px] font-mono font-bold text-[var(--text-muted)] shrink-0">
                {compositeBarcode.length} chars ({activeSymbology})
              </div>
            </div>
          </div>

          {/* Configuration & Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Print Format
              </label>
              <div className="flex bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPrintFormat("A4");
                    setQuantity(40);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    printFormat === "A4"
                      ? "bg-[var(--accent-brand)] text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  A4 Sheet (40/page)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintFormat("THERMAL");
                    setQuantity(10);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    printFormat === "THERMAL"
                      ? "bg-[var(--accent-brand)] text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                  }`}
                >
                  <ScrollText className="h-4 w-4" />
                  Thermal Roll (50×25mm)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                Quantity (Labels to Print)
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
              />
            </div>
          </div>

          {/* Label Display Toggles */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={showItemName}
                onChange={(e) => setShowItemName(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <span>Show Product Name</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={showSubtext}
                onChange={(e) => setShowSubtext(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <span>Show Weight / Price Tag</span>
            </label>
          </div>

          {/* Preview Panel */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 flex flex-col items-center justify-center min-h-[160px] relative overflow-hidden">
            <p className="absolute top-2 left-2 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Label Live Preview
            </p>

            {/* Sticker Preview Card */}
            <div className="bg-white p-3 rounded-lg shadow-md border border-gray-300 mt-3 text-black max-w-[220px] w-full flex flex-col items-center">
              {showItemName && (
                <p className="text-[11px] font-bold text-center text-black leading-tight truncate w-full mb-0.5">
                  {item.name}
                </p>
              )}

              {labelSubtext ? (
                <p className="text-[9px] font-bold text-gray-700 mb-1">
                  {labelSubtext}
                </p>
              ) : null}

              <div className="w-full flex justify-center py-1">
                {/* @ts-ignore */}
                <Barcode
                  value={compositeBarcode || "00000000"}
                  format={activeSymbology}
                  width={1.3}
                  height={36}
                  fontSize={10}
                  margin={0}
                  displayValue={true}
                />
              </div>
            </div>

            {/* POS Decoder Verification summary */}
            {decodedInfo && decodedInfo.isValidLength ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="h-3 w-3" />
                <span>POS Decoder Match:</span>
                <span>PLU: <b className="font-mono">{decodedInfo.itemPlu}</b></span>
                {decodedInfo.weightGrams !== undefined && (
                  <span>• Weight: <b className="font-mono">{decodedInfo.weightGrams}g</b> ({decodedInfo.weightGrams / 1000} kg)</span>
                )}
                {decodedInfo.priceInr !== undefined && (
                  <span>• Price: <b className="font-mono">₹{decodedInfo.priceInr}</b></span>
                )}
                {decodedInfo.isChecksumValid !== undefined && (
                  <span>• Checksum: <b className="font-mono">{decodedInfo.isChecksumValid ? "Valid" : "Mismatch"}</b></span>
                )}
              </div>
            ) : null}
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handlePrint()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-[var(--accent-brand-dark)] transition active:scale-95 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Print {quantity} Labels
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Print Container */}
      <div className="hidden">
        <div ref={componentRef} className="print-container bg-white text-black min-h-screen">
          <style type="text/css" media="print">
            {`
              @page {
                size: ${printFormat === "A4" ? "A4" : "50mm 25mm"};
                margin: ${printFormat === "A4" ? "10mm" : "0"};
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                background: white !important;
              }
              ${printFormat === "THERMAL" ? ".page-break { page-break-after: always; }" : ""}
            `}
          </style>

          {printFormat === "A4" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "8px",
                padding: "8px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {Array.from({ length: quantity }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px 4px",
                    border: "1px dashed #bbb",
                    boxSizing: "border-box",
                    minHeight: "85px",
                  }}
                >
                  {showItemName && (
                    <p
                      style={{
                        fontSize: "9px",
                        fontWeight: "bold",
                        textAlign: "center",
                        margin: "0 0 2px 0",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#000",
                      }}
                    >
                      {item.name}
                    </p>
                  )}
                  {labelSubtext ? (
                    <p
                      style={{
                        fontSize: "8px",
                        fontWeight: "bold",
                        color: "#333",
                        margin: "0 0 2px 0",
                        textAlign: "center",
                      }}
                    >
                      {labelSubtext}
                    </p>
                  ) : null}
                  {/* @ts-ignore */}
                  <Barcode
                    value={compositeBarcode || "00000000"}
                    format={activeSymbology}
                    width={1.1}
                    height={32}
                    fontSize={9}
                    margin={0}
                    displayValue={true}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {Array.from({ length: quantity }).map((_, i) => (
                <div
                  key={i}
                  className="page-break"
                  style={{
                    width: "50mm",
                    height: "25mm",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                    padding: "1.5mm",
                    overflow: "hidden",
                  }}
                >
                  {showItemName && (
                    <p
                      style={{
                        fontSize: "8px",
                        fontWeight: "bold",
                        textAlign: "center",
                        margin: "0 0 1px 0",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#000",
                      }}
                    >
                      {item.name}
                    </p>
                  )}
                  {labelSubtext ? (
                    <p
                      style={{
                        fontSize: "7px",
                        fontWeight: "bold",
                        color: "#333",
                        margin: "0 0 1px 0",
                        textAlign: "center",
                      }}
                    >
                      {labelSubtext}
                    </p>
                  ) : null}
                  {/* @ts-ignore */}
                  <Barcode
                    value={compositeBarcode || "00000000"}
                    format={activeSymbology}
                    width={1.1}
                    height={22}
                    fontSize={8}
                    margin={0}
                    displayValue={true}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
