/**
 * BatchBuilder — the main batch editor component.
 *
 * Name field, evening price toggle, template picker, category sections,
 * item picker, preview/print actions.
 */

"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Save,
  Eye,
  FileDown,
  Printer,
  Plus,
  FolderPlus,
  FileText,
  Moon,
  Loader2,
  RefreshCw,
  Copy,
  ListPlus,
} from "lucide-react";
import { getOptimizedImageUrl } from "./imageOptimizer";
import type { AdminMenuItem, AdminCategory } from "../../adminTypes";
import type {
  CatalogueBatch,
  CatalogueCategory,
  CatalogueItem,
  TemplateId,
  OutletPrintHeader,
} from "./templates/templateRegistry";
import { templateRegistry } from "./templates/templateRegistry";
import { TemplatePickerCard } from "./TemplatePickerCard";
import { CategoryReorderList } from "./picker/CategoryReorderList";
import { ItemPickerCompact, type PickedItem } from "./picker/ItemPickerCompact";
import { ItemPickerPreviewCard } from "./picker/ItemPickerPreviewCard";
import { apiRequest } from "../../adminUtils";

interface BatchBuilderProps {
  batch: CatalogueBatch;
  menuItems: AdminMenuItem[];
  categories: AdminCategory[];
  outletInfo: OutletPrintHeader;
  onBack: () => void;
  onBatchUpdated: (batch: CatalogueBatch) => void;
}

type SubView = "main" | "add-from-category" | "add-custom" | "pick-items" | "review-items";

function isItemInStock(item: AdminMenuItem | undefined): boolean {
  if (!item) return false;
  if (item.is_available === false) return false;
  if (item.is_out_of_stock === true) return false;
  if (item.current_stock !== undefined && item.current_stock !== null && item.current_stock !== "") {
    const stockVal = parseFloat(String(item.current_stock));
    if (!isNaN(stockVal) && stockVal <= 0) return false;
  }
  return true;
}

function resolveItemForPrint(item: AdminMenuItem): CatalogueItem {
  const mrp = item.mrp ? parseFloat(String(item.mrp)) : 0;
  const price = parseFloat(String(item.price)) || 0;
  const disc = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const eveningPrice = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
  return {
    id: item.id,
    name_en: item.name,
    image_url: item.image_url ? getOptimizedImageUrl(item.image_url, 450, 85) : "",
    mrp,
    price,
    discount_pct: disc,
    evening_price: eveningPrice > 0 ? eveningPrice : undefined,
  };
}

export function BatchBuilder({
  batch: initialBatch,
  menuItems,
  categories,
  outletInfo,
  onBack,
  onBatchUpdated,
}: BatchBuilderProps) {
  const [batch, setBatch] = useState<CatalogueBatch>(initialBatch);
  const [isSaving, setIsSaving] = useState(false);
  const [subView, setSubView] = useState<SubView>("main");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [newSectionName, setNewSectionName] = useState("");
  const [pickFromCatIds, setPickFromCatIds] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);

  const menuItemMap = useMemo(() => new Map(menuItems.map((i) => [i.id, i])), [menuItems]);

  const handleSyncCapacity = useCallback(async () => {
    setIsSyncing(true);
    setStatusMsg(null);
    try {
      let freshMenuItems: AdminMenuItem[] = menuItems;
      try {
        const res = await apiRequest<any>("/api/admin/menu-items");
        if (res) {
          freshMenuItems = res.items || res;
        }
      } catch (err) {
        console.warn("Could not fetch fresh menu items, using cached items", err);
      }

      const freshMap = new Map(freshMenuItems.map((i) => [i.id, i]));

      setBatch((prev) => {
        let changed = false;
        const newCategories = prev.categories.map((cat) => {
          // Remove existing items that are out of stock (<= 0 or unavailable)
          const validExistingItems = cat.items.filter((item) => {
            const freshItem = freshMap.get(item.id);
            if (!freshItem || !isItemInStock(freshItem)) {
              changed = true;
              return false;
            }
            return true;
          });

          // If not linked to a source category, keep in-stock items
          if (!cat.source_category_id) {
            if (validExistingItems.length !== cat.items.length) {
              changed = true;
            }
            return { ...cat, items: validExistingItems };
          }

          // Pull in available in-stock items from source category
          const availableInStockItems = freshMenuItems.filter(
            (mi) => mi.category_id === cat.source_category_id && isItemInStock(mi)
          );

          const currentItemIds = new Set(validExistingItems.map((i) => i.id));
          const newItemsToAdd = availableInStockItems
            .filter((mi) => !currentItemIds.has(mi.id))
            .map(resolveItemForPrint);

          if (newItemsToAdd.length > 0 || validExistingItems.length !== cat.items.length) {
            changed = true;
          }

          return {
            ...cat,
            items: [...validExistingItems, ...newItemsToAdd],
          };
        });

        if (changed) {
          setStatusMsg({ type: "ok", text: "Synced capacity: in-stock items updated, out-of-stock removed." });
          setTimeout(() => setStatusMsg(null), 3000);
          return { ...prev, categories: newCategories };
        } else {
          setStatusMsg({ type: "ok", text: "All linked sections are already at full capacity with in-stock items." });
          setTimeout(() => setStatusMsg(null), 3000);
          return prev;
        }
      });
    } finally {
      setIsSyncing(false);
    }
  }, [menuItems]);

  const handleFetchLiveCopy = useCallback(async () => {
    setIsFetchingLive(true);
    setStatusMsg(null);
    try {
      let freshMenuItems: AdminMenuItem[] = menuItems;
      try {
        const res = await apiRequest<any>("/api/admin/menu-items");
        if (res) {
          freshMenuItems = res.items || res;
        }
      } catch (err) {
        console.warn("Could not fetch fresh menu items, using cached items", err);
      }

      const freshMap = new Map(freshMenuItems.map((i) => [i.id, i]));

      setBatch((prev) => {
        let changed = false;
        const newCategories = prev.categories.map((cat) => {
          const newItems = cat.items
            .map((item) => {
              const freshItem = freshMap.get(item.id);
              // Drop items that are deleted, unavailable, or out of stock (<= 0)
              if (!freshItem || !isItemInStock(freshItem)) {
                changed = true;
                return null;
              }

              const resolved = resolveItemForPrint(freshItem);
              if (
                resolved.price !== item.price ||
                resolved.mrp !== item.mrp ||
                resolved.evening_price !== item.evening_price ||
                resolved.name_en !== item.name_en ||
                resolved.name_hi !== item.name_hi ||
                resolved.image_url !== item.image_url
              ) {
                changed = true;
                return { ...item, ...resolved };
              }
              return item;
            })
            .filter(Boolean) as CatalogueItem[];

          if (newItems.length !== cat.items.length) {
            changed = true;
          }
          return { ...cat, items: newItems };
        });

        if (changed) {
          setStatusMsg({ type: "ok", text: "Live copy fetched & updated (out-of-stock items removed)!" });
          setTimeout(() => setStatusMsg(null), 3000);
          return { ...prev, categories: newCategories };
        } else {
          setStatusMsg({ type: "ok", text: "All items are already up to date and in stock!" });
          setTimeout(() => setStatusMsg(null), 3000);
          return prev;
        }
      });
    } finally {
      setIsFetchingLive(false);
    }
  }, [menuItems]);

  // ── helpers ──────────────────────────────────────────────────────
  const updateField = <K extends keyof CatalogueBatch>(key: K, val: CatalogueBatch[K]) => {
    setBatch((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const updated = await apiRequest<CatalogueBatch>(`/api/admin/catalogues/${batch.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: batch.name,
          template: batch.template,
          show_evening_price: batch.show_evening_price,
          show_evening_special_label: batch.show_evening_special_label,
          categories: batch.categories,
        }),
      });
      setBatch(updated);
      onBatchUpdated(updated);
      setStatusMsg({ type: "ok", text: "Saved!" });
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err.message || "Save failed" });
    } finally {
      setIsSaving(false);
    }
  }, [batch, onBatchUpdated]);

  const handleSaveAsNew = useCallback(async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const newBatch = await apiRequest<CatalogueBatch>(`/api/admin/catalogues`, {
        method: "POST",
        body: JSON.stringify({
          name: `${batch.name} (Copy)`,
          template: batch.template,
          show_evening_price: batch.show_evening_price,
          show_evening_special_label: batch.show_evening_special_label,
          categories: batch.categories,
        }),
      });
      setBatch(newBatch);
      onBatchUpdated(newBatch);
      setStatusMsg({ type: "ok", text: "Saved as New Copy!" });
      setTimeout(() => setStatusMsg(null), 2000);
    } catch (err: any) {
      setStatusMsg({ type: "err", text: err.message || "Save failed" });
    } finally {
      setIsSaving(false);
    }
  }, [batch, onBatchUpdated]);

  // ── Print / Preview / Save as PDF ────────────────────────────────
  const handlePrintOrPreview = (autoPrint: boolean) => {
    if (typeof window === "undefined") return;

    const TemplateComponent = templateRegistry[batch.template];
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Popup blocker prevented opening the preview window. Please allow popups for this site.");
      return;
    }

    const totalPages = 1;
    const catalogTitle = batch.name || "ApnaGreen Basket Catalogue";

    const fontLinks = batch.template === "mandi-ledger"
      ? `<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`
      : `<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${catalogTitle}</title>
  ${fontLinks}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      margin: 0;
      padding: 0;
      background: #F3F4F6;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    @media print {
      body { background: #fff !important; }
      @page { size: A4; margin: 0; }
      .no-print { display: none !important; }
      #catalogue-root {
        margin: 0 !important;
        box-shadow: none !important;
        max-width: 100% !important;
        width: 100% !important;
        border-radius: 0 !important;
      }
    }
    .print-btn-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      background: #111827; padding: 10px 24px;
      display: flex; gap: 12px; align-items: center;
      color: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    }
    .print-btn-bar .title-box {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .print-btn-bar .title-box .title {
      font-size: 14px;
      font-weight: 700;
      color: #F9FAFB;
    }
    .print-btn-bar .title-box .subtitle {
      font-size: 11px;
      color: #9CA3AF;
    }
    .print-btn-bar button {
      padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer;
      font-size: 13px; font-weight: 700;
      display: inline-flex; align-items: center; gap: 6px;
      transition: all 0.15s ease;
    }
    .save-pdf-btn {
      background: #059669; color: #fff;
    }
    .save-pdf-btn:hover { background: #047857; }
    .print-btn { background: #374151; color: #fff; }
    .print-btn:hover { background: #4B5563; }
    .close-btn { background: #1F2937; color: #9CA3AF; }
    .close-btn:hover { background: #374151; color: #fff; }
    
    #catalogue-root {
      margin: 64px auto 40px;
      max-width: 794px;
      background: #fff;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      overflow: visible;
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <div class="title-box">
      <span class="title">${catalogTitle}</span>
      <span class="subtitle">💡 Click <strong>&ldquo;Save as PDF&rdquo;</strong> to download this catalogue directly in seconds</span>
    </div>
    <button class="save-pdf-btn" onclick="saveAsPdf()" title="Save as PDF directly to your device">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Save as PDF
    </button>
    <button class="print-btn" onclick="window.print()" title="Print directly to paper printer">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Print
    </button>
    <button class="close-btn" onclick="window.close()">✕ Close</button>
  </div>
  <div id="catalogue-root"></div>
  <script>
    function saveAsPdf() {
      window.print();
    }
  </script>
</body>
</html>`);
    printWindow.document.close();

    // Use ReactDOM to render into the print window
    import("react-dom/client").then(({ createRoot }) => {
      const container = printWindow.document.getElementById("catalogue-root");
      if (!container) return;
      const printableBatch = {
        ...batch,
        categories: batch.categories.filter((cat) => cat.items && cat.items.length > 0),
      };
      const root = createRoot(container);
      root.render(
        React.createElement(TemplateComponent, {
          batch: printableBatch,
          pageNumber: 1,
          totalPages,
          outletInfo,
        })
      );

      if (autoPrint) {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 750);
      }
    });
  };

  // ── Automatic Save PDF ───────────────────────────────────────────
  const handleSavePdf = () => {
    setStatusMsg({ type: "ok", text: "Opening Save as PDF dialog..." });
    handlePrintOrPreview(true);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  // 🔸 Add Section flows 🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸🔸
  const handleAddFromCategory = () => {
    if (pickFromCatIds.length === 0) return;
    
    const newSections: CatalogueCategory[] = [];
    
    for (const catId of pickFromCatIds) {
      const cat = categories.find((c) => c.id === catId);
      if (!cat) continue;

      const catItems: CatalogueItem[] = menuItems
        .filter((mi) => mi.category_id === catId && isItemInStock(mi))
        .map(resolveItemForPrint);

      newSections.push({
        id: crypto.randomUUID(),
        name_en: cat.name,
        order: batch.categories.length + newSections.length,
        source_category_id: cat.id,
        items: catItems,
      });
    }

    if (newSections.length > 0) {
      updateField("categories", [...batch.categories, ...newSections]);
    }
    setSubView("main");
    setPickFromCatIds([]);
  };

  const handleStartCustomSection = () => {
    if (!newSectionName.trim()) return;
    const newSection: CatalogueCategory = {
      id: crypto.randomUUID(),
      name_en: newSectionName.trim(),
      order: batch.categories.length,
      items: [],
    };
    updateField("categories", [...batch.categories, newSection]);
    setEditingSectionId(newSection.id);
    setSelectedItemIds(new Set());
    setSubView("pick-items");
    setNewSectionName("");
  };

  const handleFinishItemPick = () => {
    if (!editingSectionId) return;
    const pickedItems: CatalogueItem[] = Array.from(selectedItemIds)
      .map((id) => menuItemMap.get(id))
      .filter(Boolean)
      .map((mi) => resolveItemForPrint(mi!));

    updateField(
      "categories",
      batch.categories.map((c) =>
        c.id === editingSectionId ? { ...c, items: pickedItems } : c
      )
    );
    setSubView("review-items");
  };

  const handleConfirmReview = () => {
    setSubView("main");
    setEditingSectionId(null);
    setSelectedItemIds(new Set());
  };

  const selectedMenuItems = useMemo(() => {
    return Array.from(selectedItemIds)
      .map((id) => menuItemMap.get(id))
      .filter(Boolean) as AdminMenuItem[];
  }, [selectedItemIds, menuItemMap]);

  // ── Sub-views ────────────────────────────────────────────────────
  if (subView === "add-from-category") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSubView("main")} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h4 className="text-sm font-bold text-[var(--text-primary)]">Add Sections from Categories</h4>
        <p className="text-[10px] text-[var(--text-muted)]">Select one or more categories to import all their items as new sections.</p>
        
        <div className="max-h-96 overflow-y-auto space-y-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3">
          {categories.map((c) => {
            const isChecked = pickFromCatIds.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPickFromCatIds((current) =>
                        checked
                          ? [...current, c.id]
                          : current.filter((id) => id !== c.id)
                      );
                    }}
                    className="h-4 w-4 rounded-md border-[var(--border-strong)] text-[var(--accent-brand)] focus:ring-0 accent-[var(--accent-brand)]"
                  />
                  <span className="font-medium text-[var(--text-primary)]">{c.name}</span>
                </div>
                <span className="text-[var(--text-muted)] font-mono">
                  {menuItems.filter((mi) => mi.category_id === c.id).length} items
                </span>
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddFromCategory}
          disabled={pickFromCatIds.length === 0}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] disabled:opacity-40 transition"
        >
          <Plus className="h-3.5 w-3.5" /> Import Selected Sections
        </button>
      </div>
    );
  }

  if (subView === "add-custom") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSubView("main")} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h4 className="text-sm font-bold text-[var(--text-primary)]">Create Custom Section</h4>
        <p className="text-[10px] text-[var(--text-muted)]">Name your section, then pick items from any category.</p>
        <input
          type="text"
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          placeholder="Section name (e.g. Today's Specials)"
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-none"
        />
        <button
          type="button"
          onClick={handleStartCustomSection}
          disabled={!newSectionName.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] disabled:opacity-40 transition"
        >
          <Plus className="h-3.5 w-3.5" /> Create & Pick Items
        </button>
      </div>
    );
  }

  if (subView === "pick-items") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSubView("main")} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h4 className="text-sm font-bold text-[var(--text-primary)]">Pick Items</h4>
        <ItemPickerCompact
          menuItems={menuItems}
          categories={categories}
          selectedIds={selectedItemIds}
          onSelectionChange={setSelectedItemIds}
        />
        <button
          type="button"
          onClick={handleFinishItemPick}
          disabled={selectedItemIds.size === 0}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] disabled:opacity-40 transition"
        >
          <Eye className="h-3.5 w-3.5" /> Review {selectedItemIds.size} Selected Items
        </button>
      </div>
    );
  }

  if (subView === "review-items") {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSubView("pick-items")} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Picker
        </button>
        <h4 className="text-sm font-bold text-[var(--text-primary)]">Review Selected Items</h4>
        <p className="text-[10px] text-[var(--text-muted)]">Verify these items before adding them to the section.</p>
        <div className="max-h-[400px] overflow-y-auto">
          <ItemPickerPreviewCard items={selectedMenuItems} />
        </div>
        <button
          type="button"
          onClick={handleConfirmReview}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] transition"
        >
          Confirm & Add to Section
        </button>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Back */}
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Catalogues
      </button>

      {/* Name */}
      <div>
        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Catalogue Name
        </label>
        <input
          type="text"
          value={batch.name}
          onChange={(e) => updateField("name", e.target.value)}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
        />
      </div>

      {/* Evening price toggle */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-bold text-[var(--text-primary)]">Show Evening Price</span>
          </div>
          <button
            type="button"
            onClick={() => updateField("show_evening_price", !batch.show_evening_price)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              batch.show_evening_price ? "bg-amber-500" : "bg-[var(--border-strong)]"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                batch.show_evening_price ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {batch.show_evening_price && (
          <label className="flex items-center gap-2 pl-6 cursor-pointer">
            <input
              type="checkbox"
              checked={batch.show_evening_special_label}
              onChange={(e) => updateField("show_evening_special_label", e.target.checked)}
              className="rounded accent-amber-500"
            />
            <span className="text-[10px] text-[var(--text-muted)]">
              Label as &ldquo;Evening Special Price&rdquo; in printed catalogue
            </span>
          </label>
        )}
      </div>

      {/* Template picker */}
      <div>
        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          Print Template
        </label>
        <TemplatePickerCard
          selected={batch.template}
          onChange={(id) => updateField("template", id)}
        />
      </div>

      {/* Sections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Sections ({batch.categories.length})
          </label>
        </div>

        <CategoryReorderList
          categories={batch.categories}
          onUpdate={(cats) => updateField("categories", cats)}
        />

        {/* Add section buttons */}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => setSubView("add-from-category")}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
          >
            <FolderPlus className="h-3.5 w-3.5 text-[var(--accent-brand)]" /> From Category
          </button>
          <button
            type="button"
            onClick={() => setSubView("add-custom")}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
          >
            <FileText className="h-3.5 w-3.5 text-purple-400" /> Custom Section
          </button>
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className={`rounded-xl border p-2.5 text-xs font-semibold flex items-center gap-2 ${
          statusMsg.type === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-rose-500/30 bg-rose-500/10 text-rose-400"
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSyncCapacity}
            disabled={isSyncing}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 transition"
          >
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
            {isSyncing ? "Syncing..." : "Sync Capacity"}
          </button>
          <button
            type="button"
            onClick={handleFetchLiveCopy}
            disabled={isFetchingLive}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-600 hover:bg-sky-500/20 disabled:opacity-50 transition"
          >
            {isFetchingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isFetchingLive ? "Fetching..." : "Fetch Live Copy"}
          </button>
          <button
            type="button"
            onClick={handleSaveAsNew}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] disabled:opacity-50 transition"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Save as New
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] disabled:opacity-50 transition"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => handlePrintOrPreview(false)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            type="button"
            onClick={handleSavePdf}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
            title="Download PDF directly in seconds"
          >
            <FileDown className="h-3.5 w-3.5 text-emerald-500" /> Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
