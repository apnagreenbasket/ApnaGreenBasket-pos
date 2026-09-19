/**
 * DiscountModal — Apply Manager / Staff discount with reason note.
 *
 * Extracted from admin page.tsx (lines 6663-6770).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Percent, X } from "lucide-react";
import type { ManualBill, RolePermissions } from "@/types";

type DiscountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  discountTargetBill: ManualBill | null;
  discountType: "PERCENT" | "FLAT" | "COMPLIMENTARY";
  setDiscountType: (type: "PERCENT" | "FLAT" | "COMPLIMENTARY") => void;
  discountValue: number;
  setDiscountValue: (val: number) => void;
  discountReason: string;
  setDiscountReason: (reason: string) => void;
  staffPermissions: RolePermissions | null;
  handleApplyDiscount: (itemQuantities?: Record<string, number>, isItemLevelComp?: boolean) => Promise<void>;
};

export function DiscountModal({
  isOpen,
  onClose,
  discountTargetBill,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  discountReason,
  setDiscountReason,
  staffPermissions,
  handleApplyDiscount,
}: DiscountModalProps) {
  const discountInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState("");
  const [compMode, setCompMode] = useState<"FULL" | "SELECTED">("FULL");
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      setLocalError("");
      setTimeout(() => {
        discountInputRef.current?.focus();
        discountInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, discountType]);

  if (!isOpen || !discountTargetBill) return null;

  const onSubmitDiscount = async () => {
    if (discountType !== "COMPLIMENTARY" && (!discountReason || discountReason.trim().length < 2)) {
      setLocalError("Please provide a reason note for the discount.");
      return;
    }
    setLocalError("");
    try {
      if (discountType === "COMPLIMENTARY" && compMode === "SELECTED") {
        const hasSelection = Object.values(itemQuantities).some(q => q > 0);
        if (!hasSelection) {
          setLocalError("Please select at least one item to make complimentary.");
          return;
        }
        await handleApplyDiscount(itemQuantities, true);
      } else {
        await handleApplyDiscount();
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to apply discount.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-sky-400" />
            <h3 className="font-display text-lg font-bold">Apply Discount</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs space-y-1 font-mono">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)] font-sans">Bill ID:</span>
            <span className="font-bold text-[var(--text-primary)]">#{discountTargetBill.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)] font-sans">Current Subtotal:</span>
            <span className="font-bold">₹{discountTargetBill.subtotal_amount.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Discount Type Selector */}
          <div className="block space-y-1 text-xs font-bold">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">Discount Type</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)]">
              {(["PERCENT", "FLAT", "COMPLIMENTARY"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition ${discountType === t
                    ? "bg-[var(--accent-brand)] text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                  {t === "PERCENT" ? "% Percent" : t === "FLAT" ? "Flat (₹)" : "Complimentary"}
                </button>
              ))}
            </div>
          </div>

          {/* Discount Value Input (Auto-focused with zero-replacement) */}
          {discountType !== "COMPLIMENTARY" && (
            <label className="block space-y-1 text-xs font-bold">
              <span className="text-[var(--text-muted)] uppercase tracking-wider">
                {discountType === "PERCENT" ? "Percentage Discount (%)" : "Flat Discount Amount (₹)"}
              </span>
              <input
                ref={discountInputRef}
                type="number"
                min={0}
                max={discountType === "PERCENT" ? 100 : discountTargetBill.subtotal_amount}
                value={discountValue === 0 ? "" : discountValue}
                placeholder="0"
                onChange={(e) => {
                  setLocalError("");
                  setDiscountValue(e.target.value === "" ? 0 : parseFloat(e.target.value) || 0);
                }}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2.5 text-sm font-mono font-bold focus:border-sky-500 outline-none"
              />
            </label>
          )}

          {/* Mandatory Reason Note */}
          <label className="block space-y-1 text-xs font-bold">
            <span className="text-[var(--text-muted)] uppercase tracking-wider">
              Reason Note <span className="text-rose-500">*</span>
            </span>
            <textarea
              rows={2}
              value={discountReason}
              onChange={(e) => {
                setLocalError("");
                setDiscountReason(e.target.value);
              }}
              placeholder="e.g. Staff meal, VIP Guest, Apology for delay"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-2.5 text-sm focus:border-sky-500 outline-none resize-none"
            />
          </label>

          {/* Item Level Complimentary Section */}
          {discountType === "COMPLIMENTARY" && (
            <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex bg-[var(--bg-surface-elevated)] p-1 rounded-xl border border-[var(--border-strong)]">
                <button
                  type="button"
                  onClick={() => setCompMode("FULL")}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition ${compMode === "FULL"
                    ? "bg-rose-500 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                  Full Bill
                </button>
                <button
                  type="button"
                  onClick={() => setCompMode("SELECTED")}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition ${compMode === "SELECTED"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                >
                  Selected Items
                </button>
              </div>

              {compMode === "SELECTED" && discountTargetBill.items && (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {discountTargetBill.items.map((item: any) => {
                    if (item.is_complimentary) return null; // Skip already comp items
                    const qty = itemQuantities[item.id] || 0;
                    const maxQty = item.quantity || 1;
                    return (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
                        <div className="flex-1 truncate pr-2">
                          <p className="text-[11px] font-bold text-[var(--text-primary)] truncate">{item.item_name}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">Max: {maxQty} &times; ₹{Number(item.unit_price).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-lg p-1 border border-[var(--border-strong)]">
                          <button
                            type="button"
                            onClick={() => setItemQuantities(prev => ({ ...prev, [item.id]: Math.max(0, qty - 1) }))}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--border-strong)]"
                          >
                            -
                          </button>
                          <span className="w-4 text-center text-xs font-bold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setItemQuantities(prev => ({ ...prev, [item.id]: Math.min(maxQty, qty + 1) }))}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--border-strong)]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Inline Validation Error Popup inside Modal Window */}
          {localError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs text-rose-400 font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
              <span>{localError}</span>
            </div>
          )}

          {/* Role approval notification note */}
          <p className="text-[11px] text-[var(--text-muted)] italic rounded-xl bg-[var(--bg-surface-elevated)] p-2.5">
            {(!staffPermissions || staffPermissions.can_manage_staff)
              ? "✓ You are logged in as Manager/Admin. Discount will be auto-approved immediately."
              : "ℹ You are logged in as Cashier. Discount will be submitted as PENDING APPROVAL for Manager review."}
          </p>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSubmitDiscount()}
              className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition cursor-pointer"
            >
              Submit Discount
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
