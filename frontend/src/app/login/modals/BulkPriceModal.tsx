"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Search, Moon, Power, Clock, Save, CheckCircle2, AlertCircle, RefreshCw, Loader2, Zap, Ban } from "lucide-react";
import type { AdminMenuItem, AdminCategory, RestaurantProfile } from "../adminTypes";
import { apiRequest } from "../adminUtils";

interface BulkPriceRowState {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  mrp: string;
  price: string;
  evening_price: string;
  isModified: boolean;
}

interface BulkPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: AdminMenuItem[];
  categories: AdminCategory[];
  onSaveBatch: (updates: { id: string; name: string; mrp: string; price: string; evening_price: string }[]) => Promise<void>;
  /** When true, renders without the modal overlay — for embedding inside a drawer. */
  inline?: boolean;
  restaurant?: RestaurantProfile | null;
  onRestaurantUpdate?: (r: RestaurantProfile) => void;
}

export function BulkPriceModal({
  isOpen,
  onClose,
  menuItems,
  categories,
  onSaveBatch,
  inline = false,
  restaurant,
  onRestaurantUpdate,
}: BulkPriceModalProps) {
  const [rows, setRows] = useState<BulkPriceRowState[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [isSavingTimes, setIsSavingTimes] = useState(false);

  const currentMode: "OFF" | "MANUAL" | "AUTO" =
    restaurant?.evening_pricing_mode ||
    (restaurant?.evening_auto_enabled ? "AUTO" : (restaurant?.evening_price_active ? "MANUAL" : "OFF"));

  const eveningActive = restaurant?.evening_price_active ?? false;
  const [startTime, setStartTime] = useState(restaurant?.evening_auto_start_time || "16:00");
  const [endTime, setEndTime] = useState(restaurant?.evening_auto_end_time || "22:00");

  useEffect(() => {
    if (restaurant) {
      setStartTime(restaurant.evening_auto_start_time || "16:00");
      setEndTime(restaurant.evening_auto_end_time || "22:00");
    }
  }, [restaurant]);

  const handleSelectMode = useCallback(async (newMode: "OFF" | "MANUAL" | "AUTO") => {
    setIsChangingMode(true);
    setErrorMsg(null);
    try {
      const updated = await apiRequest<RestaurantProfile>("/api/admin/outlets/me", {
        method: "PATCH",
        body: JSON.stringify({
          evening_pricing_mode: newMode,
          evening_auto_start_time: newMode === "AUTO" ? startTime : restaurant?.evening_auto_start_time,
          evening_auto_end_time: newMode === "AUTO" ? endTime : restaurant?.evening_auto_end_time,
        }),
      });
      onRestaurantUpdate?.(updated);
      setSuccessMsg(
        newMode === "OFF"
          ? "Evening price mode: Disabled"
          : newMode === "MANUAL"
          ? "Evening price mode: Manual Always-On"
          : "Evening price mode: Auto Scheduled"
      );
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update mode");
    } finally {
      setIsChangingMode(false);
    }
  }, [startTime, endTime, restaurant, onRestaurantUpdate]);

  const handleSaveTimes = useCallback(async () => {
    setIsSavingTimes(true);
    setErrorMsg(null);
    try {
      const updated = await apiRequest<RestaurantProfile>("/api/admin/outlets/me", {
        method: "PATCH",
        body: JSON.stringify({
          evening_pricing_mode: "AUTO",
          evening_auto_start_time: startTime,
          evening_auto_end_time: endTime,
        }),
      });
      onRestaurantUpdate?.(updated);
      setSuccessMsg(`Auto-schedule times saved: ${startTime} – ${endTime} IST daily`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save schedule times");
    } finally {
      setIsSavingTimes(false);
    }
  }, [startTime, endTime, onRestaurantUpdate]);

  // Initialize row state from menuItems
  useEffect(() => {
    if (isOpen) {
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      const initialRows: BulkPriceRowState[] = menuItems.map((item) => ({
        id: item.id,
        name: item.name,
        category_id: item.category_id,
        category_name: categoryMap.get(item.category_id) || "General",
        mrp: item.mrp ? String(item.mrp) : "",
        price: item.price ? String(item.price) : "",
        evening_price: item.evening_price ? String(item.evening_price) : "",
        isModified: false,
      }));
      setRows(initialRows);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, menuItems, categories]);

  if (!isOpen) return null;

  const handleRowChange = (id: string, field: "mrp" | "price" | "evening_price", val: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          [field]: val,
          isModified: true,
        };
      })
    );
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const modifiedRows = rows.filter((r) => r.isModified);
    if (modifiedRows.length === 0) {
      onClose();
      return;
    }

    // Validate MRP vs effective price for modified rows
    for (const r of modifiedRows) {
      const priceNum = parseFloat(r.price) || 0;
      const eveningNum = r.evening_price ? parseFloat(r.evening_price) : null;
      const effectiveNum = (eveningNum !== null && !isNaN(eveningNum) && eveningNum > 0) ? eveningNum : priceNum;
      const mrpNum = r.mrp ? parseFloat(r.mrp) : null;

      if (mrpNum !== null && !isNaN(mrpNum) && mrpNum > 0 && mrpNum < effectiveNum) {
        setErrorMsg(`Item "${r.name}": MRP (₹${mrpNum.toFixed(2)}) cannot be smaller than Selling Price (₹${effectiveNum.toFixed(2)}).`);
        return;
      }
    }

    try {
      setIsSaving(true);
      await onSaveBatch(
        modifiedRows.map((r) => ({
          id: r.id,
          name: r.name,
          mrp: r.mrp,
          price: r.price,
          evening_price: r.evening_price,
        }))
      );
      setSuccessMsg(`Successfully updated prices for ${modifiedRows.length} item(s)!`);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update item prices.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRows = rows.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      selectedCategory === "ALL" || r.category_id === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const modifiedCount = rows.filter((r) => r.isModified).length;

  const content = (
    <div className={inline ? "space-y-4 flex flex-col" : "w-full max-w-4xl rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-2xl flex flex-col max-h-[90vh]"}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Moon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {inline ? "Bulk Price Setting" : "Bulk Price & Evening Rate Manager"}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Quickly edit MRP, Selling Price, and Evening Price for all items at once.
              </p>
            </div>
          </div>
          {!inline && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Evening Rate Mode Selector */}
        {restaurant && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  Evening Rate Pricing Mode
                </span>
              </div>
              {isChangingMode && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
            </div>

            {/* 3-Way Segmented Radio Controls */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)]">
              {/* OFF Option */}
              <button
                type="button"
                onClick={() => handleSelectMode("OFF")}
                disabled={isChangingMode}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition ${
                  currentMode === "OFF"
                    ? "bg-rose-500/15 border border-rose-500/40 text-rose-400 shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                }`}
              >
                <Ban className="h-3.5 w-3.5 shrink-0" />
                <span>Disabled</span>
              </button>

              {/* MANUAL Option */}
              <button
                type="button"
                onClick={() => handleSelectMode("MANUAL")}
                disabled={isChangingMode}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition ${
                  currentMode === "MANUAL"
                    ? "bg-amber-500/15 border border-amber-500/40 text-amber-400 shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                }`}
              >
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>Manual Always-On</span>
              </button>

              {/* AUTO Option */}
              <button
                type="button"
                onClick={() => handleSelectMode("AUTO")}
                disabled={isChangingMode}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition ${
                  currentMode === "AUTO"
                    ? "bg-sky-500/15 border border-sky-500/40 text-sky-400 shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                }`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>Auto Scheduled</span>
              </button>
            </div>

            {/* Sub-panel details depending on mode */}
            {currentMode === "OFF" && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Evening rates are turned off completely. All items use standard selling prices.
              </p>
            )}

            {currentMode === "MANUAL" && (
              <p className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                <Zap className="h-3 w-3" /> Evening rates are active continuously until changed to Disabled or Auto.
              </p>
            )}

            {currentMode === "AUTO" && (
              <div className="space-y-2.5 pt-1 border-t border-[var(--border-subtle)]">
                {/* Time range inputs */}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1 block">Start Time (IST)</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1 block">End Time (IST)</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:border-sky-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveTimes}
                    disabled={isSavingTimes}
                    className="flex items-center gap-1 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-600 transition disabled:opacity-50"
                  >
                    {isSavingTimes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Times
                  </button>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className="text-[var(--text-muted)]">Status:</span>
                    {eveningActive ? (
                      <span className="text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Auto-Active ({startTime} – {endTime} IST)
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-500/10 px-2 py-0.5 rounded-full border border-slate-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Outside Schedule (Window: {startTime} – {endTime} IST)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-[var(--text-muted)] font-semibold">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <option value="ALL">All Categories ({rows.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Spreadsheet Table */}
        <div className="flex-1 overflow-y-auto border border-[var(--border-subtle)] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] font-semibold text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4">Item Name</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">MRP (₹)</th>
                <th className="py-2.5 px-3">Selling Price (₹)</th>
                <th className="py-2.5 px-3">
                  <div className="flex items-center gap-1 text-amber-400">
                    <Moon className="h-3 w-3" />
                    <span>Evening Price (₹)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={`hover:bg-[var(--bg-surface-elevated)]/50 transition ${
                    row.isModified ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="py-2 px-4 font-bold text-[var(--text-primary)]">
                    {row.name}
                    {row.isModified && (
                      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" title="Modified" />
                    )}
                  </td>
                  <td className="py-2 px-3 text-[var(--text-muted)]">{row.category_name}</td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.mrp}
                      onChange={(e) => handleRowChange(row.id, "mrp", e.target.value)}
                      className="w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-sky-500 outline-none"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.price}
                      onChange={(e) => handleRowChange(row.id, "price", e.target.value)}
                      className="w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-sky-500 outline-none"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Optional"
                      value={row.evening_price}
                      onChange={(e) => handleRowChange(row.id, "evening_price", e.target.value)}
                      className="w-28 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-amber-400 outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-muted)] font-medium">
            {modifiedCount > 0 ? (
              <span className="text-amber-400 font-bold">{modifiedCount} item(s) modified</span>
            ) : (
              "No changes made yet"
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || modifiedCount === 0}
              className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md transition ${
                modifiedCount > 0 && !isSaving
                  ? "bg-amber-500 hover:bg-amber-600 cursor-pointer"
                  : "bg-gray-600/50 cursor-not-allowed opacity-60"
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save All Changes ({modifiedCount})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
  );

  if (inline) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {content}
    </div>
  );
}
