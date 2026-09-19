"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Plus, Check, AlertCircle, Moon } from "lucide-react";
import { MenuItem, Variant } from "@/types";
import { useCart } from "@/context/CartContext";

import { resolveImageUrl } from "@/lib/api";

interface MenuItemCardProps {
  item: MenuItem;
  isEveningOverrideActive?: boolean;
  onOpenVariantSheet: (item: MenuItem) => void;
}

export function MenuItemCard({ item, isEveningOverrideActive = false, onOpenVariantSheet }: MenuItemCardProps) {
  const { addToCart, cart } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [showEveningTooltip, setShowEveningTooltip] = useState(false);

  // Calculate total quantity of this item currently in cart
  const cartQuantity = cart
    .filter((cartItem) => cartItem.menuItem.id === item.id)
    .reduce((sum, cartItem) => sum + cartItem.quantity, 0);

  const hasVariants = item.variants && item.variants.length > 0;
  const isAvailable = item.is_available;

  const rawPrice = parseFloat(item.price) || 0;
  const eveningPrice = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
  // Backend already resolves effective price based on evening_price_active toggle,
  // so item.price is the correct display price. Don't re-override here.
  const effectivePrice = rawPrice;

  const handleAdd = () => {
    if (!isAvailable) return;

    if (hasVariants) {
      onOpenVariantSheet(item);
    } else {
      addToCart(item);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 600);
    }
  };

  return (
    <article
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-[var(--bg-surface)] p-3.5 shadow-2xs transition-all duration-200 ${
        isAvailable
          ? "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
          : "border-red-200/50 dark:border-red-900/30 bg-[var(--bg-surface)]/60"
      }`}
    >
      <div className="flex gap-3">
        {/* Dish Image */}
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--bg-surface-elevated)]">
          {item.image_url ? (
            <img
              src={resolveImageUrl(item.image_url)}
              alt={item.name}
              className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                !isAvailable ? "grayscale opacity-50" : ""
              }`}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
              No Image
            </div>
          )}

          {/* Offer Tag Badge */}
          {item.is_on_offer && item.offer_price && (
            <div className="absolute top-1 left-1 z-10">
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/90 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow-xs">
                🔥 {item.offer_label || "Offer"}
              </span>
            </div>
          )}

          {/* Distinct SOLD OUT stamp */}
          {!isAvailable && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] p-1 text-center">
              <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                Sold Out
              </span>
              <span className="mt-0.5 text-[9px] font-medium text-rose-100">
                Unavailable today
              </span>
            </div>
          )}
        </div>

        {/* Dish Details */}
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-1">
              <h3 className="font-display text-sm font-black text-[var(--text-primary)] leading-tight flex items-center gap-1.5 flex-wrap">
                {item.name}
              </h3>
            </div>
            {item.description && (
              <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                {item.description}
              </p>
            )}
          </div>

          {/* Price & Action Button */}
          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex flex-col relative">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  {item.is_on_offer ? "Offer Price" : "Price"}
                </span>
                {isEveningOverrideActive && (
                  <div className="relative inline-flex group">
                    <button
                      type="button"
                      onMouseEnter={() => setShowEveningTooltip(true)}
                      onMouseLeave={() => setShowEveningTooltip(false)}
                      className="p-0.5 rounded hover:bg-amber-500/20 text-amber-400 transition cursor-pointer"
                      title={`Evening Price Active: ₹${effectivePrice.toFixed(2)}`}
                    >
                      <Moon className="h-3.5 w-3.5 fill-amber-400/20 text-amber-400" />
                    </button>
                    {showEveningTooltip && (
                      <div className="absolute left-0 bottom-full mb-1 z-30 w-44 rounded-xl border border-amber-500/30 bg-gray-900/95 p-2 text-[10px] text-amber-300 shadow-xl backdrop-blur-xs font-sans">
                        🌙 <strong>Evening Special Rate!</strong>
                        <div className="text-gray-300 mt-0.5">Active Rate: ₹{effectivePrice.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                {item.is_on_offer && item.offer_price ? (
                  <>
                    <span className="font-sans text-sm font-black tracking-tight text-[var(--accent-brand)]">
                      ₹{parseFloat(item.offer_price).toFixed(2)}
                    </span>
                    <span className="font-sans text-[11px] font-semibold text-[var(--text-muted)] line-through decoration-rose-500/80">
                      ₹{parseFloat(item.price).toFixed(2)}
                    </span>
                    {item.mrp && parseFloat(String(item.mrp)) > 0 && (
                      <span className="font-sans text-[10px] text-[var(--text-muted)] opacity-80">
                        MRP <span className="line-through font-mono">₹{parseFloat(String(item.mrp)).toFixed(2)}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-sans text-sm font-black tracking-tight text-[var(--text-primary)]">
                      ₹{effectivePrice.toFixed(2)}
                    </span>
                    {item.mrp && parseFloat(String(item.mrp)) > 0 && (
                      <span className="font-sans text-[10px] text-[var(--text-muted)] font-medium">
                        MRP <span className="line-through decoration-rose-500/70 font-mono">₹{parseFloat(String(item.mrp)).toFixed(2)}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Add Button */}
            {isAvailable ? (
              <button
                onClick={handleAdd}
                aria-label={`Add ${item.name} to cart`}
                className={`relative flex h-8 items-center gap-1 rounded-xl px-3 text-xs font-bold transition-all duration-150 active:scale-95 ${
                  justAdded
                    ? "bg-[var(--status-paid-text)] text-white shadow-sm"
                    : cartQuantity > 0
                    ? "bg-[var(--accent-brand)] text-white shadow-sm"
                    : "bg-[var(--accent-brand-subtle)] text-[var(--accent-brand-text)] hover:bg-[var(--accent-brand)] hover:text-white"
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Added</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>{hasVariants ? "Option" : "Add"}</span>
                    {cartQuantity > 0 && (
                      <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-black">
                        {cartQuantity}
                      </span>
                    )}
                  </>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-500 dark:text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Sold out</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
