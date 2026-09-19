"use client";

import React, { useEffect, useRef, useState } from "react";
import { Category } from "@/types";

interface CategoryNavProps {
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  hasOffers?: boolean;
}

export function CategoryNav({
  categories,
  activeCategoryId,
  onSelectCategory,
  hasOffers = false,
}: CategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected active category pill into center view
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(
      `[data-category-id="${activeCategoryId}"]`
    ) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeCategoryId]);

  return (
    <nav className="sticky top-[57px] z-20 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-md transition-colors py-2">
      <div
        ref={scrollRef}
        className="no-scrollbar mx-auto flex max-w-lg items-center gap-2 overflow-x-auto px-4 scroll-smooth"
      >
        {hasOffers && (
          <button
            data-category-id="offers"
            onClick={() => onSelectCategory("offers")}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 flex items-center gap-1 ${
              activeCategoryId === "offers"
                ? "bg-amber-500 text-white shadow-xs"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:border-amber-500"
            }`}
          >
            <span>🔥</span>
            <span>Offers</span>
          </button>
        )}
        {categories.map((category) => {
          const isActive = category.id === activeCategoryId;
          return (
            <button
              key={category.id}
              data-category-id={category.id}
              onClick={() => onSelectCategory(category.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                isActive
                  ? "bg-[var(--accent-brand)] text-white shadow-sm"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
              }`}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
