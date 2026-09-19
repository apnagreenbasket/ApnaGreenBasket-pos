/**
 * VariantModal — Size & customization management modal for menu items.
 *
 * Extracted from admin page.tsx (lines 5804-5967).
 */

"use client";

import { FormEvent } from "react";
import { Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { AdminMenuItem, AdminVariant, VariantFormState } from "../adminTypes";
import { formatRupees } from "../adminUtils";

type VariantModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedVariantItemId: string | null;
  menuItems: AdminMenuItem[];
  variantsByItem: Record<string, AdminVariant[]>;
  variantForm: VariantFormState;
  setVariantForm: React.Dispatch<React.SetStateAction<VariantFormState>>;
  editingVariantId: string | null;
  setEditingVariantId: (id: string | null) => void;
  isSavingVariant: boolean;
  onSubmitVariant: (e: FormEvent<HTMLFormElement>) => void;
  onToggleVariantAvailable: (variant: AdminVariant) => Promise<void>;
  onDeleteVariant: (variantId: string) => Promise<void>;
};

export function VariantModal({
  isOpen,
  onClose,
  selectedVariantItemId,
  menuItems,
  variantsByItem,
  variantForm,
  setVariantForm,
  editingVariantId,
  setEditingVariantId,
  isSavingVariant,
  onSubmitVariant,
  onToggleVariantAvailable,
  onDeleteVariant,
}: VariantModalProps) {
  if (!isOpen || !selectedVariantItemId) return null;

  const currentItem = menuItems.find((i) => i.id === selectedVariantItemId);
  const variants = variantsByItem[selectedVariantItemId] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold">Manage Sizes &amp; Customizations</h2>
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

        {/* Existing Variants List */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide font-bold text-[var(--text-muted)]">
            Existing Options / Sizes ({variants.length})
          </p>

          {variants.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--text-muted)] rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
              No sizes or variants created yet. Add options below (e.g. &quot;Half Plate&quot;, &quot;Full Plate&quot;, &quot;Extra Cheese&quot;).
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[var(--text-primary)]">{variant.name}</span>
                    <span className="font-mono text-xs font-bold text-[var(--accent-brand)]">
                      {parseFloat(variant.price_delta) >= 0
                        ? `+${formatRupees(variant.price_delta)}`
                        : `-${formatRupees(Math.abs(parseFloat(variant.price_delta)))}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void onToggleVariantAvailable(variant)}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${variant.is_available
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                        }`}
                    >
                      {variant.is_available ? "Available" : "Disabled"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVariantId(variant.id);
                        setVariantForm({
                          name: variant.name,
                          price_delta: variant.price_delta,
                          is_available: variant.is_available,
                        });
                      }}
                      className="p-1 rounded-md text-[var(--accent-brand)] hover:bg-[var(--bg-surface)]"
                      title="Edit Variant"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteVariant(variant.id)}
                      className="p-1 rounded-md text-rose-500 hover:bg-rose-100"
                      title="Delete Variant"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add / Edit Variant Form */}
        <form onSubmit={onSubmitVariant} className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--accent-brand)] uppercase tracking-wide">
              {editingVariantId ? "Edit Size / Option" : "+ Add Size / Customization"}
            </p>
            {editingVariantId && (
              <button
                type="button"
                onClick={() => {
                  setEditingVariantId(null);
                  setVariantForm({ name: "", price_delta: "0", is_available: true });
                }}
                className="text-[11px] text-[var(--text-muted)] hover:text-rose-500 font-semibold"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">Size / Customization Name *</span>
              <input
                type="text"
                value={variantForm.name}
                onChange={(e) => setVariantForm((prev) => ({ ...prev, name: e.target.value }))}
                required
                placeholder="e.g. Half Plate, Full Plate, Extra Cheese..."
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-bold">Price Extra (₹)</span>
              <input
                type="text"
                value={variantForm.price_delta}
                onChange={(e) => setVariantForm((prev) => ({ ...prev, price_delta: e.target.value }))}
                placeholder="0"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-mono font-bold text-[var(--accent-brand)]"
              />
            </label>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={variantForm.is_available}
                onChange={(e) => setVariantForm((prev) => ({ ...prev, is_available: e.target.checked }))}
                className="rounded-md border-[var(--border-strong)] text-[var(--accent-brand)] focus:ring-0"
              />
              <span>Available for order</span>
            </label>

            <button
              type="submit"
              disabled={isSavingVariant}
              className="rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
            >
              {isSavingVariant ? "Saving..." : editingVariantId ? "Update Option" : "+ Save Option"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
