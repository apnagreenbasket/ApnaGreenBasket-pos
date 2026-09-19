/**
 * CataloguePrintTab — top-level tab inside MenuSettingsDrawer.
 *
 * View A: Batch list (default) — list all catalogue batches, create/delete.
 * View B: Batch editor — renders <BatchBuilder>.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  FileText,
  Moon,
  RefreshCw,
} from "lucide-react";
import type { AdminMenuItem, AdminCategory } from "../adminTypes";
import type { CatalogueBatch, OutletPrintHeader } from "./catalogue/templates/templateRegistry";
import { BatchBuilder } from "./catalogue/BatchBuilder";
import { apiRequest } from "../adminUtils";

interface CataloguePrintTabProps {
  menuItems: AdminMenuItem[];
  categories: AdminCategory[];
  outletInfo: OutletPrintHeader;
}

export function CataloguePrintTab({
  menuItems,
  categories,
  outletInfo,
}: CataloguePrintTabProps) {
  const [batches, setBatches] = useState<CatalogueBatch[]>([]);
  const [fullMenuItems, setFullMenuItems] = useState<AdminMenuItem[]>(menuItems);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBatch, setEditingBatch] = useState<CatalogueBatch | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [batchesData, itemsData] = await Promise.all([
        apiRequest<CatalogueBatch[]>("/api/admin/catalogues"),
        apiRequest<any>("/api/admin/menu-items"), // No page/page_size fetches all
      ]);
      setBatches(batchesData || []);
      if (itemsData) {
        setFullMenuItems(itemsData.items || itemsData);
      }
    } catch {
      setBatches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const newBatch = await apiRequest<CatalogueBatch>("/api/admin/catalogues", {
        method: "POST",
        body: JSON.stringify({ name: `Catalogue ${batches.length + 1}` }),
      });
      setBatches((prev) => [newBatch, ...prev]);
      setEditingBatch(newBatch);
    } catch {
      // silently fail
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiRequest(`/api/admin/catalogues/${id}`, { method: "DELETE" });
      setBatches((prev) => prev.filter((b) => b.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleBatchUpdated = (updated: CatalogueBatch) => {
    setBatches((prev) => {
      const exists = prev.some((b) => b.id === updated.id);
      if (exists) {
        return prev.map((b) => (b.id === updated.id ? updated : b));
      }
      return [updated, ...prev];
    });
    setEditingBatch(updated);
  };

  // ── View B: Batch editor ──────────────────────────────────────
  if (editingBatch) {
    return (
      <BatchBuilder
        batch={editingBatch}
        menuItems={fullMenuItems}
        categories={categories}
        outletInfo={outletInfo}
        onBack={() => setEditingBatch(null)}
        onBatchUpdated={handleBatchUpdated}
      />
    );
  }

  // ── View A: Batch list ────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Catalogue Batches
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchInitialData}
            disabled={isLoading}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-3 py-1.5 text-xs font-bold text-[var(--text-on-accent)] disabled:opacity-50 transition"
          >
            {isCreating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            New Catalogue
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && batches.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : batches.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-10 text-center">
          <div className="rounded-full bg-[var(--accent-brand)]/10 p-3 text-[var(--accent-brand)] mb-3">
            <FileText className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">No catalogues yet</h4>
          <p className="mt-1 text-xs text-[var(--text-muted)] max-w-xs">
            Create your first print catalogue by clicking the button above. Choose a template, add categories and items, then print!
          </p>
        </div>
      ) : (
        /* Batch cards */
        <div className="space-y-2">
          {batches.map((batch) => {
            const totalItems = batch.categories.reduce((sum, c) => sum + c.items.length, 0);
            const templateLabel = batch.template === "mandi-ledger" ? "Mandi Ledger" : "Aisle Grid";
            const isDeleting = deletingId === batch.id;

            return (
              <div
                key={batch.id}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 flex items-center gap-3 hover:border-[var(--accent-brand)] transition cursor-pointer group"
                onClick={() => setEditingBatch(batch)}
              >
                {/* Icon */}
                <div className="rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] p-2 shrink-0">
                  <FileText className="h-4 w-4 text-[var(--accent-brand)]" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {batch.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="rounded-full bg-[var(--bg-surface-elevated)] px-2 py-0.5 text-[9px] font-mono text-[var(--text-muted)] border border-[var(--border-subtle)]">
                      {templateLabel}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {batch.categories.length} sections · {totalItems} items
                    </span>
                    {batch.show_evening_price && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/20">
                        <Moon className="h-2.5 w-2.5" /> Evening
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(batch.id);
                  }}
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
