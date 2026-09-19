"use client";

import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { MenuItem, Variant } from "@/types";
import { useCart } from "@/context/CartContext";

interface VariantSelectorSheetProps {
  item: MenuItem | null;
  onClose: () => void;
}

export function VariantSelectorSheet({ item, onClose }: VariantSelectorSheetProps) {
  const { addToCart } = useCart();
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    item?.variants?.[0] || null
  );

  if (!item) return null;

  const basePrice = parseFloat(item.price);
  const delta = selectedVariant ? parseFloat(selectedVariant.price_delta) : 0;
  const totalPrice = (basePrice + delta).toFixed(2);

  const handleConfirm = () => {
    addToCart(item, selectedVariant);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 transition-opacity">
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-5 shadow-2xl transition-all animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-sans text-base font-bold text-[var(--text-primary)]">
              Customize {item.name}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Choose your preferred size or customization
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Variant Options List */}
        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-1">
          {item.variants?.map((variant) => {
            const isSelected = selectedVariant?.id === variant.id;
            const priceDeltaNum = parseFloat(variant.price_delta);
            return (
              <label
                key={variant.id}
                onClick={() => setSelectedVariant(variant)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-all ${
                  isSelected
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand-subtle)] text-[var(--accent-brand-text)] font-semibold"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      isSelected
                        ? "border-[var(--accent-brand)] bg-[var(--accent-brand)] text-white"
                        : "border-[var(--text-muted)]"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span>{variant.name}</span>
                </div>
                <span className="font-bold">
                  {priceDeltaNum > 0
                    ? `+₹${priceDeltaNum.toFixed(2)}`
                    : priceDeltaNum < 0
                    ? `-₹${Math.abs(priceDeltaNum).toFixed(2)}`
                    : "Included"}
                </span>
              </label>
            );
          })}
        </div>

        {/* Footer Action Button */}
        <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
          <div>
            <span className="text-xs text-[var(--text-muted)] block font-medium">Total</span>
            <span className="font-sans text-lg font-black text-[var(--text-primary)]">
              ₹{totalPrice}
            </span>
          </div>

          <button
            onClick={handleConfirm}
            className="flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-6 text-sm font-bold text-white shadow-md transition-transform active:scale-95 hover:bg-[var(--accent-brand-hover)]"
          >
            Add to Order
          </button>
        </div>
      </div>
    </div>
  );
}
