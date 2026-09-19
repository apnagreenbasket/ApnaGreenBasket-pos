/**
 * CategoryReorderList — drag-and-drop category ordering within a batch.
 *
 * Each category card: name (editable inline), item count, expand/collapse.
 * Reorder via drag & drop (and buttons), delete category.
 * Expanded: shows items with drag & drop reorder and ✕ remove.
 */

"use client";

import React, { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Trash2,
  X,
  GripVertical,
  Edit3,
  Check,
} from "lucide-react";
import type { CatalogueCategory, CatalogueItem } from "../templates/templateRegistry";

interface CategoryReorderListProps {
  categories: CatalogueCategory[];
  onUpdate: (categories: CatalogueCategory[]) => void;
}

export function CategoryReorderList({ categories, onUpdate }: CategoryReorderListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  // Drag state for categories
  const [draggedCatIdx, setDraggedCatIdx] = useState<number | null>(null);
  const [dragOverCatIdx, setDragOverCatIdx] = useState<number | null>(null);

  // Drag state for items
  const [draggedItem, setDraggedItem] = useState<{ catId: string; itemIdx: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ catId: string; itemIdx: number } | null>(null);

  const moveCat = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= categories.length) return;
    const copy = [...categories];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    copy.forEach((c, i) => (c.order = i));
    onUpdate(copy);
  };

  const deleteCat = (id: string) => {
    onUpdate(categories.filter((c) => c.id !== id));
  };

  const startEdit = (cat: CatalogueCategory) => {
    setEditingNameId(cat.id);
    setEditNameValue(cat.name_en);
  };

  const saveEdit = () => {
    if (!editingNameId || !editNameValue.trim()) {
      setEditingNameId(null);
      return;
    }
    onUpdate(
      categories.map((c) =>
        c.id === editingNameId ? { ...c, name_en: editNameValue.trim() } : c
      )
    );
    setEditingNameId(null);
  };

  const removeItem = (catId: string, itemId: string) => {
    onUpdate(
      categories.map((c) =>
        c.id === catId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c
      )
    );
  };

  const moveItem = (catId: string, itemIdx: number, dir: -1 | 1) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const target = itemIdx + dir;
    if (target < 0 || target >= cat.items.length) return;
    const items = [...cat.items];
    [items[itemIdx], items[target]] = [items[target], items[itemIdx]];
    onUpdate(categories.map((c) => (c.id === catId ? { ...c, items } : c)));
  };

  // --- HTML5 Drag & Drop for Categories ---
  const handleCatDragStart = (e: React.DragEvent, idx: number) => {
    // Only allow drag if we are not dragging an item
    if (draggedItem) return;
    e.dataTransfer.effectAllowed = "move";
    setDraggedCatIdx(idx);
  };
  const handleCatDragEnter = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedItem) return; // Ignore if dragging item
    if (draggedCatIdx !== null && draggedCatIdx !== idx) {
      setDragOverCatIdx(idx);
    }
  };
  const handleCatDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };
  const handleCatDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedItem) return;
    if (draggedCatIdx !== null && draggedCatIdx !== idx) {
      const copy = [...categories];
      const [dragged] = copy.splice(draggedCatIdx, 1);
      copy.splice(idx, 0, dragged);
      copy.forEach((c, i) => (c.order = i));
      onUpdate(copy);
    }
    setDraggedCatIdx(null);
    setDragOverCatIdx(null);
  };
  const handleCatDragEnd = () => {
    setDraggedCatIdx(null);
    setDragOverCatIdx(null);
  };

  // --- HTML5 Drag & Drop for Items ---
  const handleItemDragStart = (e: React.DragEvent, catId: string, itemIdx: number) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    setDraggedItem({ catId, itemIdx });
  };
  const handleItemDragEnter = (e: React.DragEvent, catId: string, itemIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem && draggedItem.catId === catId && draggedItem.itemIdx !== itemIdx) {
      setDragOverItem({ catId, itemIdx });
    }
  };
  const handleItemDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleItemDrop = (e: React.DragEvent, catId: string, itemIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedItem && draggedItem.catId === catId && draggedItem.itemIdx !== itemIdx) {
      // Reordering within the SAME category
      const copy = [...categories];
      const catIdx = copy.findIndex(c => c.id === catId);
      if (catIdx > -1) {
        const catCopy = { ...copy[catIdx] };
        const itemsCopy = [...catCopy.items];
        const [dragged] = itemsCopy.splice(draggedItem.itemIdx, 1);
        itemsCopy.splice(itemIdx, 0, dragged);
        catCopy.items = itemsCopy;
        copy[catIdx] = catCopy;
        onUpdate(copy);
      }
    }
    setDraggedItem(null);
    setDragOverItem(null);
  };
  const handleItemDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedItem(null);
    setDragOverItem(null);
  };


  if (categories.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl">
        No sections yet. Add a section to start building your catalogue.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((cat, idx) => {
        const isExpanded = expandedId === cat.id;
        const isEditing = editingNameId === cat.id;

        const isDraggingCat = draggedCatIdx === idx;
        const isDragOverCat = dragOverCatIdx === idx;

        return (
          <div
            key={cat.id}
            draggable={!draggedItem} // Disable cat dragging if dragging item
            onDragStart={(e) => handleCatDragStart(e, idx)}
            onDragEnter={(e) => handleCatDragEnter(e, idx)}
            onDragOver={handleCatDragOver}
            onDrop={(e) => handleCatDrop(e, idx)}
            onDragEnd={handleCatDragEnd}
            className={`rounded-xl border bg-[var(--bg-surface)] overflow-hidden transition-all duration-200
              ${isDraggingCat ? "opacity-40 scale-[0.98] border-dashed border-[var(--accent-brand)]" : "border-[var(--border-subtle)]"}
              ${isDragOverCat && !isDraggingCat ? (draggedCatIdx! > idx ? "border-t-2 border-t-[var(--accent-brand)]" : "border-b-2 border-b-[var(--accent-brand)]") : ""}
            `}
          >
            {/* Category header */}
            <div className="flex items-center gap-2 px-3 py-2">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveCat(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] disabled:opacity-20 transition"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCat(idx, 1)}
                  disabled={idx === categories.length - 1}
                  className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] disabled:opacity-20 transition"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              <div className="cursor-grab active:cursor-grabbing p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition rounded hover:bg-[var(--bg-surface-elevated)]">
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                      className="flex-1 rounded-md border border-[var(--accent-brand)] bg-[var(--bg-surface-elevated)] px-2 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="p-1 rounded-md bg-[var(--accent-brand)] text-white"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {cat.name_en}
                    </span>
                    {cat.name_hi && (
                      <span className="text-[10px] text-[var(--text-muted)]">{cat.name_hi}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] transition"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Item count badge */}
              <span className="rounded-full bg-[var(--bg-surface-elevated)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)]">
                {cat.items.length} items
              </span>

              {/* Expand toggle */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] transition"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteCat(cat.id)}
                className="p-1 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Expanded items */}
            {isExpanded && (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 px-3 py-2 space-y-1">
                {cat.items.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-[var(--text-muted)]">
                    No items in this section. Use the item picker to add items.
                  </div>
                ) : (
                  cat.items.map((item, iIdx) => {
                    const isDraggingItem = draggedItem?.catId === cat.id && draggedItem.itemIdx === iIdx;
                    const isDragOverItem = dragOverItem?.catId === cat.id && dragOverItem.itemIdx === iIdx;

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleItemDragStart(e, cat.id, iIdx)}
                        onDragEnter={(e) => handleItemDragEnter(e, cat.id, iIdx)}
                        onDragOver={handleItemDragOver}
                        onDrop={(e) => handleItemDrop(e, cat.id, iIdx)}
                        onDragEnd={handleItemDragEnd}
                        className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200
                          ${isDraggingItem ? "opacity-40 scale-[0.98] border border-dashed border-[var(--accent-brand)]" : "hover:bg-[var(--bg-surface)] border border-transparent"}
                          ${isDragOverItem && !isDraggingItem ? (draggedItem!.itemIdx > iIdx ? "border-t border-t-[var(--accent-brand)]" : "border-b border-b-[var(--accent-brand)]") : ""}
                        `}
                      >
                        <div className="cursor-grab active:cursor-grabbing p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition rounded">
                          <GripVertical className="h-3 w-3" />
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] w-4 text-center">
                          {iIdx + 1}
                        </span>
                        <span className="flex-1 text-xs text-[var(--text-primary)] truncate">
                          {item.name_en}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          ₹{item.price.toFixed(0)}
                        </span>

                        {/* Reorder */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveItem(cat.id, iIdx, -1)}
                            disabled={iIdx === 0}
                            className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] disabled:opacity-20"
                          >
                            <ChevronUp className="h-2.5 w-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(cat.id, iIdx, 1)}
                            disabled={iIdx === cat.items.length - 1}
                            className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] disabled:opacity-20"
                          >
                            <ChevronDown className="h-2.5 w-2.5" />
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeItem(cat.id, item.id)}
                          className="p-0.5 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
