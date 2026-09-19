import React from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import type { SortConfig } from "../../hooks/useTableSortAndSearch";

export function TableSearchBar({
  searchQuery,
  setSearchQuery,
  placeholder = "Search...",
  title = "Records",
  subtitle
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  placeholder?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-brand)]/50 transition-shadow"
        />
      </div>
    </div>
  );
}

export function SortableHeader<T>({
  label,
  columnKey,
  sortConfig,
  handleSort,
  className = ""
}: {
  label: React.ReactNode;
  columnKey: keyof T | string;
  sortConfig: SortConfig<T> | null;
  handleSort: (key: keyof T | string) => void;
  className?: string;
}) {
  const isSorted = sortConfig?.key === columnKey;
  const isAsc = isSorted && sortConfig.direction === "asc";

  return (
    <th 
      className={`px-6 py-4 font-semibold cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors ${className}`} 
      onClick={() => handleSort(columnKey)}
    >
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {isSorted ? (
          isAsc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4 opacity-20" />
        )}
      </div>
    </th>
  );
}
