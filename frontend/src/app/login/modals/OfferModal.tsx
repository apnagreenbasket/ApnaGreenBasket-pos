/**
 * OfferModal — Special offer & discount configuration modal for menu items.
 *
 * Extracted from admin page.tsx (lines 5969-6095).
 */

"use client";

import { FormEvent } from "react";
import { Flame, X } from "lucide-react";
import type { AdminMenuItem } from "../adminTypes";

export type OfferFormState = {
  is_on_offer: boolean;
  offer_price: string;
  offer_label: string;
  expires_at_midnight: boolean;
};

type OfferModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedOfferItemId: string | null;
  menuItems: AdminMenuItem[];
  offerForm: OfferFormState;
  setOfferForm: React.Dispatch<React.SetStateAction<OfferFormState>>;
  isSavingOffer: boolean;
  onSubmitOffer: (e: FormEvent<HTMLFormElement>) => void;
};

export function OfferModal({
  isOpen,
  onClose,
  selectedOfferItemId,
  menuItems,
  offerForm,
  setOfferForm,
  isSavingOffer,
  onSubmitOffer,
}: OfferModalProps) {
  if (!isOpen || !selectedOfferItemId) return null;

  const currentItem = menuItems.find((i) => i.id === selectedOfferItemId);
  const origPrice = currentItem ? parseFloat(currentItem.price) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold">Manage Special Offer</h2>
              <p className="text-xs text-[var(--text-secondary)] font-semibold">
                Item: {currentItem?.name || "Selected Item"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmitOffer} className="space-y-4">
          {/* Toggle Offer Switch */}
          <label className="flex items-center justify-between rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-3.5 cursor-pointer">
            <div className="space-y-0.5">
              <span className="font-bold text-sm text-[var(--text-primary)]">Activate Special Offer</span>
              <p className="text-xs text-[var(--text-muted)]">Displays slashed price and deal badge on customer catalog</p>
            </div>
            <input
              type="checkbox"
              checked={offerForm.is_on_offer}
              onChange={(e) => setOfferForm((prev) => ({ ...prev, is_on_offer: e.target.checked }))}
              className="h-5 w-5 rounded-md border-[var(--border-strong)] text-amber-500 focus:ring-0 accent-amber-500"
            />
          </label>

          {offerForm.is_on_offer && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Quick Percentage Presets */}
              {origPrice > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">
                    Quick Discount Presets (Regular: ₹{origPrice})
                  </span>
                  <div className="flex gap-2">
                    {[10, 20, 25, 30, 50].map((pct) => {
                      const discPrice = (origPrice * (1 - pct / 100)).toFixed(2);
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() =>
                            setOfferForm((prev) => ({
                              ...prev,
                              offer_price: discPrice,
                              offer_label: `${pct}% OFF`,
                            }))
                          }
                          className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition"
                        >
                          {pct}% OFF
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">
                  Special Offer Price (₹) *
                </span>
                <input
                  type="text"
                  value={offerForm.offer_price}
                  onChange={(e) => setOfferForm((prev) => ({ ...prev, offer_price: e.target.value }))}
                  required={offerForm.is_on_offer}
                  placeholder="e.g. 220"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-sm font-mono font-bold text-amber-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">
                  Offer Tag / Custom Label
                </span>
                <input
                  type="text"
                  value={offerForm.offer_label}
                  onChange={(e) => setOfferForm((prev) => ({ ...prev, offer_label: e.target.value }))}
                  placeholder="e.g. 20% OFF, Today's Pick, Combo Deal"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs font-semibold"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 mt-4 cursor-pointer">
                <div className="space-y-0.5">
                  <span className="font-bold text-xs text-sky-400">Expire at Midnight (IST)</span>
                  <p className="text-[10px] text-[var(--text-muted)]">Automatically turns off this offer at the end of the day</p>
                </div>
                <input
                  type="checkbox"
                  checked={offerForm.expires_at_midnight}
                  onChange={(e) => setOfferForm((prev) => ({ ...prev, expires_at_midnight: e.target.checked }))}
                  className="h-4 w-4 rounded-md border-sky-500/50 text-sky-500 focus:ring-0 accent-sky-500"
                />
              </label>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingOffer}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition"
            >
              {isSavingOffer ? "Saving Offer..." : "Save Offer Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
