/**
 * ItemPickerPreviewCard — review step using full dashboard product cards (Option A).
 *
 * Shows selected items as full cards with image, price, MRP, discount pill,
 * stock pill, GST pill. Read-only — no edit/delete/toggle actions.
 * This is an internal review step, not the print output.
 */

"use client";

import React from "react";
import { Image as ImageIcon, Flame } from "lucide-react";
import { resolveImageUrl } from "@/lib/api";
import type { AdminMenuItem } from "../../../adminTypes";

interface ItemPickerPreviewCardProps {
  items: AdminMenuItem[];
}

export function ItemPickerPreviewCard({ items }: ItemPickerPreviewCardProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-[var(--text-muted)]">
        No items selected. Go back and pick items to preview.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const priceVal = parseFloat(String(item.price)) || 0;
        const eveningPriceVal = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
        let effectivePrice = eveningPriceVal > 0 ? eveningPriceVal : priceVal;
        if (item.is_on_offer && item.offer_price) {
          const offerPriceNum = parseFloat(String(item.offer_price));
          if (offerPriceNum > 0 && offerPriceNum < effectivePrice) {
            effectivePrice = offerPriceNum;
          }
        }
        const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : priceVal;
        const hasDiscount = mrpVal > effectivePrice;
        const discPercent = hasDiscount ? Math.round(((mrpVal - effectivePrice) / mrpVal) * 100) : 0;

        return (
          <div
            key={item.id}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3"
          >
            {/* Top: image + name + price */}
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] overflow-hidden shrink-0 flex items-center justify-center">
                {item.image_url ? (
                  <img
                    src={resolveImageUrl(item.image_url)}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-[var(--text-muted)] opacity-50" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <h4 className="font-bold text-sm text-[var(--text-primary)] truncate">
                    {item.name}
                  </h4>
                  <div className="text-right shrink-0">
                    {hasDiscount && (
                      <span className="line-through text-xs text-[var(--text-muted)] font-mono block">
                        ₹{mrpVal.toFixed(2)}
                      </span>
                    )}
                    <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                      ₹{effectivePrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status badges — read-only */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  item.is_available
                    ? "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    : "bg-red-500/10 text-red-400 border border-red-500/30"
                }`}
              >
                {item.is_available ? "In Stock" : "Unavailable"}
              </span>

              {hasDiscount && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                  🏷️ {discPercent}% OFF
                </span>
              )}

              {item.tax_category && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                  {item.tax_category}
                </span>
              )}

              {item.is_on_offer && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                  <Flame className="h-3 w-3" />
                  {item.offer_label || `Offer: ₹${item.offer_price}`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
