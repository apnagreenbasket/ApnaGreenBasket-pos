/**
 * ItemPickerCompact — dense one-row-per-item picker (Option B).
 *
 * Each row: order number, checkbox, small thumbnail, name, MRP, price, discount%, drag handle.
 * Supports search filter, grouped by category, checkbox multi-select,
 * and drag-and-drop reordering via button controls.
 */

"use client";

import React, { useState, useMemo } from "react";
import { Search, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { resolveImageUrl } from "@/lib/api";
import type { AdminMenuItem, AdminCategory } from "../../../adminTypes";

export interface PickedItem {
  id: string;
  name_en: string;
  name_hi?: string;
  image_url: string;
  mrp: number;
  price: number;
  discount_pct: number;
}

interface ItemPickerCompactProps {
  menuItems: AdminMenuItem[];
  categories: AdminCategory[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  /** Ordered list of currently selected items (for reordering) */
  orderedItems?: PickedItem[];
  onReorder?: (items: PickedItem[]) => void;
}

function toPickedItem(item: AdminMenuItem): PickedItem {
  const mrp = item.mrp ? parseFloat(String(item.mrp)) : 0;
  const price = parseFloat(String(item.price)) || 0;
  const disc = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return {
    id: item.id,
    name_en: item.name,
    image_url: item.image_url || "",
    mrp,
    price,
    discount_pct: disc,
  };
}

export function ItemPickerCompact({
  menuItems,
  categories,
  selectedIds,
  onSelectionChange,
  orderedItems,
  onReorder,
}: ItemPickerCompactProps) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const filtered = useMemo(() => {
    return menuItems.filter((item) => {
      const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = filterCat === "ALL" || item.category_id === filterCat;
      return matchSearch && matchCat;
    });
  }, [menuItems, search, filterCat]);

  const toggleItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (filtered.every((i) => selectedIds.has(i.id))) {
      const next = new Set(selectedIds);
      filtered.forEach((i) => next.delete(i.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((i) => next.add(i.id));
      onSelectionChange(next);
    }
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    if (!orderedItems || !onReorder) return;
    const target = idx + dir;
    if (target < 0 || target >= orderedItems.length) return;
    const copy = [...orderedItems];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    onReorder(copy);
  };

  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));

  return (
    <div className="space-y-3">
      {/* Search + Category filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
        <div className="w-6 text-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded accent-[var(--accent-brand)]"
          />
        </div>
        <div className="w-5 text-center">#</div>
        <div className="w-8" />
        <div className="flex-1">Name</div>
        <div className="w-14 text-right">MRP</div>
        <div className="w-14 text-right">Price</div>
        <div className="w-10 text-right">Disc</div>
        {onReorder && <div className="w-12 text-center">Order</div>}
      </div>

      {/* Item rows */}
      <div className="max-h-[360px] overflow-y-auto space-y-0.5">
        {filtered.map((item, idx) => {
          const picked = toPickedItem(item);
          const isSelected = selectedIds.has(item.id);
          const orderedIdx = orderedItems?.findIndex((oi) => oi.id === item.id) ?? -1;

          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition cursor-pointer ${
                isSelected
                  ? "bg-[var(--accent-brand)]/10 border border-[var(--accent-brand)]/30"
                  : "hover:bg-[var(--bg-surface-elevated)] border border-transparent"
              }`}
              onClick={() => toggleItem(item.id)}
            >
              {/* Checkbox */}
              <div className="w-6 text-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleItem(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded accent-[var(--accent-brand)]"
                />
              </div>

              {/* Order number */}
              <div className="w-5 text-center text-[10px] font-mono text-[var(--text-muted)]">
                {idx + 1}
              </div>

              {/* Thumbnail */}
              <div className="w-8 h-8 rounded-md border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface-elevated)] flex-shrink-0 flex items-center justify-center">
                {item.image_url ? (
                  <img src={resolveImageUrl(item.image_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]">—</span>
                )}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{item.name}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{catMap.get(item.category_id) || ""}</div>
              </div>

              {/* MRP */}
              <div className="w-14 text-right font-mono text-[10px] text-[var(--text-muted)]">
                {picked.mrp > 0 ? `₹${picked.mrp.toFixed(0)}` : "—"}
              </div>

              {/* Price */}
              <div className="w-14 text-right font-mono text-xs font-bold text-[var(--text-primary)]">
                ₹{picked.price.toFixed(0)}
              </div>

              {/* Discount */}
              <div className="w-10 text-right">
                {picked.discount_pct > 0 ? (
                  <span className="inline-block rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                    {picked.discount_pct}%
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]">—</span>
                )}
              </div>

              {/* Reorder buttons */}
              {onReorder && orderedIdx >= 0 && (
                <div className="w-12 flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => moveItem(orderedIdx, -1)}
                    disabled={orderedIdx === 0}
                    className="p-0.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <GripVertical className="h-3 w-3 text-[var(--text-muted)] opacity-40" />
                  <button
                    type="button"
                    onClick={() => moveItem(orderedIdx, 1)}
                    disabled={orderedIdx === (orderedItems?.length ?? 0) - 1}
                    className="p-0.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No items found. Try a different search or category.
          </div>
        )}
      </div>

      {/* Selection summary */}
      <div className="flex items-center justify-between px-2 pt-2 border-t border-[var(--border-subtle)]">
        <span className="text-[10px] text-[var(--text-muted)]">
          {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
        </span>
      </div>
    </div>
  );
}
