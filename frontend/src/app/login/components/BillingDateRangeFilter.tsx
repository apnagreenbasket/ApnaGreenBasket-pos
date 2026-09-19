"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import type { BillingDateRangeMode } from "@/types";

interface BillingDateRangeFilterProps {
  dateRangeMode: BillingDateRangeMode;
  setDateRangeMode: (mode: BillingDateRangeMode) => void;
  customStartDate: string;
  setCustomStartDate: (val: string) => void;
  customEndDate: string;
  setCustomEndDate: (val: string) => void;
}

const PRESETS: { value: BillingDateRangeMode; label: string; badge: string }[] = [
  { value: "today", label: "Today Only", badge: "Today" },
  { value: "yesterday", label: "Yesterday", badge: "1d ago" },
  { value: "last2days", label: "Last 2 Days", badge: "2 days" },
  { value: "week", label: "This Week", badge: "Mon-Now" },
  { value: "last7", label: "Last 7 Days", badge: "7 days" },
  { value: "this_month", label: "This Month", badge: "Month" },
  { value: "last30", label: "Last 30 Days", badge: "30 days" },
  { value: "custom", label: "Custom Range", badge: "Custom" },
];

export function BillingDateRangeFilter({
  dateRangeMode,
  setDateRangeMode,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
}: BillingDateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const activePreset = PRESETS.find(
    (p) =>
      p.value === dateRangeMode ||
      (p.value === "last7" && (dateRangeMode as string) === "last_7") ||
      (p.value === "last30" && (dateRangeMode as string) === "last_30") ||
      (p.value === "this_month" && (dateRangeMode as string) === "thisMonth")
  ) || PRESETS[0];

  const handleSelectPreset = (value: BillingDateRangeMode) => {
    setDateRangeMode(value);
    if (value !== "custom") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer select-none group ${
          isOpen
            ? "border-sky-500 bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/30"
            : "border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] hover:border-sky-500/50 text-[var(--text-primary)]"
        }`}
        title="Filter billing orders by date"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Calendar className={`h-3.5 w-3.5 transition-colors ${isOpen ? "text-sky-400" : "text-sky-400/90 group-hover:text-sky-400"}`} />
        <span className="font-bold tracking-tight">{activePreset.label}</span>
        <ChevronDown
          className={`h-3 w-3 text-[var(--text-muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180 text-sky-400" : "group-hover:text-[var(--text-primary)]"
          }`}
        />
      </button>

      {/* Inline Date Inputs when Custom Range is selected */}
      {dateRangeMode === "custom" && (
        <div className="flex items-center gap-1 pl-0.5">
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            className="bg-[var(--bg-surface)] border border-[var(--border-strong)] hover:border-sky-500/50 rounded-lg px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-sky-500 cursor-pointer shadow-xs"
            title="Custom start date"
          />
          <span className="text-[10px] text-[var(--text-muted)] font-bold">-</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="bg-[var(--bg-surface)] border border-[var(--border-strong)] hover:border-sky-500/50 rounded-lg px-1.5 py-0.5 text-[10px] font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-sky-500 cursor-pointer shadow-xs"
            title="Custom end date"
          />
        </div>
      )}

      {/* Styled Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 min-w-[210px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-1.5 shadow-2xl shadow-black/60 ring-1 ring-black/10 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]/70 mb-1">
            <span>Filter Presets</span>
            <span className="text-[9px] font-mono lowercase opacity-70">pos date</span>
          </div>

          {/* Presets List */}
          <div className="space-y-0.5" role="listbox">
            {PRESETS.map((preset) => {
              const isActive =
                preset.value === dateRangeMode ||
                (preset.value === "last7" && (dateRangeMode as string) === "last_7") ||
                (preset.value === "last30" && (dateRangeMode as string) === "last_30") ||
                (preset.value === "this_month" && (dateRangeMode as string) === "thisMonth");

              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleSelectPreset(preset.value)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                    isActive
                      ? "bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-xs"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-surface)] hover:text-sky-300 border border-transparent"
                  }`}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="flex items-center gap-1.5">
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 opacity-0" />
                    )}
                    <span>{preset.label}</span>
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono tracking-tight ${
                      isActive
                        ? "bg-sky-500/20 text-sky-300 font-bold"
                        : "bg-[var(--bg-surface)] text-[var(--text-muted)]"
                    }`}
                  >
                    {preset.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs if Custom Range is selected */}
          {dateRangeMode === "custom" && (
            <div className="mt-1.5 pt-2 border-t border-[var(--border-subtle)]/70 px-1.5 pb-1 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
                <span>Date Range</span>
                <span className="font-mono text-[9px]">custom</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-0.5 font-medium">From</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] focus:border-sky-500 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-[var(--text-primary)] focus:outline-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-0.5 font-medium">To</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-strong)] focus:border-sky-500 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-[var(--text-primary)] focus:outline-none cursor-pointer"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full mt-1 py-1.5 px-2 text-xs font-bold rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition shadow-xs cursor-pointer flex items-center justify-center gap-1"
              >
                <Check className="h-3 w-3" />
                Apply Filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
