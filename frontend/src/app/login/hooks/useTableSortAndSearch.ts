import { useState, useMemo } from 'react';

export interface SortConfig<T> {
  key: keyof T | string;
  direction: 'asc' | 'desc';
}

export function useTableSortAndSearch<T>(
  data: T[] | null | undefined,
  searchableKeys: (keyof T | string)[] = []
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(null);

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    
    // Filter
    const filtered = data.filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return searchableKeys.some(key => {
        const val = (item as any)[key];
        if (typeof val === 'string') return val.toLowerCase().includes(q);
        if (typeof val === 'number') return val.toString().includes(q);
        return false;
      });
    });

    // Sort
    if (!sortConfig) return filtered;
    
    return [...filtered].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA: any = (a as any)[key];
      let valB: any = (b as any)[key];

      // Handle missing values
      if (valA === null || valA === undefined) valA = "";
      if (valB === null || valB === undefined) valB = "";

      // Heuristic Date checking
      if (typeof valA === "string" && /^\d{4}-\d{2}-\d{2}T/.test(valA)) {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (typeof valA === "string" && typeof valB === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, searchQuery, sortConfig, searchableKeys]);

  const handleSort = (key: keyof T | string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  return {
    searchQuery,
    setSearchQuery,
    sortConfig,
    handleSort,
    sortedAndFilteredData
  };
}
