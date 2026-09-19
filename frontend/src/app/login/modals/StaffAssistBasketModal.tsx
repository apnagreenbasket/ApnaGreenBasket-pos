"use client";

import { useState, useMemo, useRef } from "react";
import { Plus, Minus, Trash2, Search, Loader2, X, ShoppingCart, UserCheck, Barcode } from "lucide-react";
import type { ActiveSession, MenuItem } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

type StaffAssistBasketModalProps = {
  isOpen: boolean;
  onClose: () => void;
  session: ActiveSession | null;
  menuItems: any[];
  onSuccess?: () => void;
  authToken?: string;
};

type SelectedCartItem = {
  menuItem: MenuItem;
  variant_id?: string;
  quantity: number;
};

export function StaffAssistBasketModal({
  isOpen,
  onClose,
  session,
  menuItems,
  onSuccess,
  authToken,
}: StaffAssistBasketModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedCartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredMenuItems = useMemo(() => {
    if (!searchQuery.trim()) return menuItems.filter((i) => i.is_available);
    const q = searchQuery.toLowerCase().trim();
    return menuItems.filter(
      (i) =>
        i.is_available &&
        (i.name.toLowerCase().includes(q) ||
          (i.barcode && i.barcode.toLowerCase().includes(q)) ||
          (i.description && i.description.toLowerCase().includes(q)))
    );
  }, [menuItems, searchQuery]);

  const totalAmount = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      const price = Number(item.menuItem.price || 0);
      return sum + price * item.quantity;
    }, 0);
  }, [selectedItems]);

  if (!isOpen || !session) return null;

  const handleAddItem = (item: MenuItem) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.menuItem.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menuItem.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const handleUpdateQty = (itemId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((i) => {
          if (i.menuItem.id === itemId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as SelectedCartItem[]
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.menuItem.id !== itemId));
  };

  const handleAddItemsToBasket = async () => {
    if (selectedItems.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const token =
        authToken ||
        (typeof window !== "undefined"
          ? localStorage.getItem("agb_access_token") ||
            localStorage.getItem("admin_access_token") ||
            localStorage.getItem("admin_token") ||
            localStorage.getItem("access_token") ||
            localStorage.getItem("token")
          : "");
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/admin/sessions/${session.id}/add-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
          "bypass-tunnel-reminder": "true",
        },
        body: JSON.stringify({
          items: selectedItems.map((si) => ({
            menu_item_id: si.menuItem.id,
            variant_id: si.variant_id || undefined,
            quantity: si.quantity,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to add items (${res.status})`);
      }

      setSelectedItems([]);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to add items to customer basket");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] h-[80vh] flex flex-col rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--accent-brand-subtle)] text-[var(--accent-brand)] flex items-center justify-center font-bold">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold">
                Staff Assistance — Basket #{session.basket_number}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Customer: <strong className="text-[var(--text-primary)]">{session.customer_name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[var(--border-subtle)] text-[var(--text-muted)] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: Catalog & Cart Selection */}
        <div className="flex-1 overflow-y-auto grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
          {/* Left: Product Catalog Search */}
          <div className="lg:col-span-7 p-4 space-y-3 flex flex-col">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search products by name or scan barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const query = searchQuery.trim().toLowerCase();
                    if (!query) return;

                    let match = menuItems.find((m) => m.barcode?.toLowerCase() === query);
                    if (!match && filteredMenuItems.length === 1) {
                      match = filteredMenuItems[0];
                    }

                    if (match) {
                      handleAddItem(match);
                      setSearchQuery("");
                      setTimeout(() => searchInputRef.current?.focus(), 0);
                    }
                  }
                }}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] pl-9 pr-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-brand)]"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredMenuItems.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic text-center py-8">
                  No matching available items found.
                </p>
              ) : (
                filteredMenuItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 hover:bg-[var(--bg-surface-elevated)] transition"
                  >
                    <div className="space-y-0.5 max-w-[65%]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-[var(--text-primary)]">
                          {item.name}
                        </span>
                        {item.barcode && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-0.5">
                            <Barcode className="h-3 w-3" /> {item.barcode}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                        ₹{Number(item.price).toFixed(2)} {item.unit_label ? `/ ${item.unit_label}` : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="flex items-center gap-1 rounded-xl bg-[var(--accent-brand)] text-white px-3 py-1.5 text-xs font-bold hover:opacity-90 transition active:scale-95 shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Selected Items Tray */}
          <div className="lg:col-span-5 p-4 space-y-4 flex flex-col justify-between bg-[var(--bg-surface-elevated)]/30">
            <div className="space-y-3 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Items To Add ({selectedItems.reduce((acc, i) => acc + i.quantity, 0)})
                </span>
                <span className="text-xs font-mono font-bold text-[var(--accent-brand)]">
                  ₹{totalAmount.toFixed(2)}
                </span>
              </div>

              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              {selectedItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] italic space-y-2">
                  <ShoppingCart className="h-8 w-8 mx-auto opacity-40" />
                  <p>Pick items from the catalog on the left to assist this customer.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedItems.map((si) => {
                    const linePrice = Number(si.menuItem.price || 0) * si.quantity;
                    return (
                      <div
                        key={si.menuItem.id}
                        className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5 max-w-[50%]">
                          <span className="font-bold text-[var(--text-primary)] block truncate">
                            {si.menuItem.name}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            ₹{linePrice.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(si.menuItem.id, -1)}
                              className="p-0.5 hover:bg-[var(--border-subtle)] rounded text-[var(--text-muted)]"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="font-mono font-bold px-1.5 text-xs text-[var(--text-primary)]">
                              {si.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(si.menuItem.id, 1)}
                              className="p-0.5 hover:bg-[var(--border-subtle)] rounded text-[var(--text-muted)]"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(si.menuItem.id)}
                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit Action Footer */}
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-[var(--text-primary)]">Subtotal</span>
                <span className="font-mono text-[var(--accent-brand)]">₹{totalAmount.toFixed(2)}</span>
              </div>

              <button
                type="button"
                onClick={handleAddItemsToBasket}
                disabled={selectedItems.length === 0 || isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] py-2.5 text-xs font-bold text-white shadow-xs hover:opacity-90 transition disabled:opacity-50 active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Adding to Basket...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" /> Add Items to Customer Basket
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
