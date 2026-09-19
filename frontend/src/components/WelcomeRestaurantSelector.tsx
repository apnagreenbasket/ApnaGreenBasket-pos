"use client";

import React, { useEffect, useState } from "react";
import { Store, ChevronRight, Sparkles, Utensils, Hash, AlertCircle, RefreshCw } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

interface RestaurantItem {
  id: string;
  name: string;
  slug: string;
}

interface WelcomeRestaurantSelectorProps {
  onSelectRestaurant: (slug: string, tableNumber: string) => void;
  initialTableNumber?: string;
}

export function WelcomeRestaurantSelector({
  onSelectRestaurant,
  initialTableNumber = "",
}: WelcomeRestaurantSelectorProps) {
  const [restaurants, setRestaurants] = useState<RestaurantItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [tableNumber, setTableNumber] = useState<string>(initialTableNumber);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRestaurants() {
      setIsLoading(true);
      setError(null);
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/public/outlets`, {
          headers: { "bypass-tunnel-reminder": "true" },
        });

        if (res.ok) {
          const data = await res.json();
          setRestaurants(data);
          if (data.length > 0) {
            setSelectedSlug(data[0].slug);
          }
        } else {
          // Fallback mock list if API fails
          const fallback = [
            { id: "1", name: "ApnaGreen Basket Jammu", slug: "apnagreenbasket-jammu" },
          ];
          setRestaurants(fallback);
          setSelectedSlug("apnagreenbasket-jammu");
        }
      } catch {
        const fallback = [
          { id: "1", name: "ApnaGreen Basket Jammu", slug: "apnagreenbasket-jammu" },
        ];
        setRestaurants(fallback);
        setSelectedSlug("apnagreenbasket-jammu");
      } finally {
        setIsLoading(false);
      }
    }

    fetchRestaurants();
  }, []);

  const handleConfirm = (slugToUse?: string) => {
    const slug = slugToUse || selectedSlug;
    if (!slug) return;
    onSelectRestaurant(slug, tableNumber.trim() || "1");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-4 py-8 transition-colors">
      <div className="w-full max-w-lg space-y-6">
        {/* Welcome Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--accent-brand)] text-white shadow-xl shadow-[var(--accent-brand)]/20 animate-in zoom-in duration-300">
            <Utensils className="h-8 w-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-1 text-xs font-semibold text-[var(--accent-brand)] shadow-2xs mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>ApnaGreen Basket</span>
            </div>
            <h1 className="font-sans text-2xl font-black tracking-tight text-[var(--text-primary)]">
              Welcome!
            </h1>
            <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
              Select your outlet below or scan a basket QR code to explore the live product catalog.
            </p>
          </div>
        </div>

        {/* Card Container */}
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xl space-y-5">
          {/* Basket Number Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--text-primary)]">
              Basket Number
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Enter Basket #"
                className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] py-2.5 pl-9 pr-4 text-xs font-bold text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Outlet Selector Toggle / List */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[var(--text-primary)]">
              Select Outlet
            </label>

            {isLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="h-16 w-full animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]"
                  />
                ))}
              </div>
            ) : restaurants.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                <AlertCircle className="mx-auto h-6 w-6 mb-1 text-[var(--text-muted)]" />
                No active outlets found.
              </div>
            ) : (
              <div className="space-y-2.5">
                {restaurants.map((item) => {
                  const isSelected = selectedSlug === item.slug;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedSlug(item.slug);
                        handleConfirm(item.slug);
                      }}
                      className={`w-full flex items-center justify-between rounded-2xl border p-4 transition-all text-left active:scale-[0.99] ${
                        isSelected
                          ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/10 text-[var(--accent-brand-text)] shadow-xs"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                            isSelected
                              ? "bg-[var(--accent-brand)] text-white"
                              : "bg-[var(--bg-base)] text-[var(--text-secondary)]"
                          }`}
                        >
                          <Store className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-[var(--text-primary)]">
                            {item.name}
                          </span>
                          <span className="block text-[11px] text-[var(--text-secondary)] font-mono">
                            slug: {item.slug}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-bold text-[var(--accent-brand)]">
                        <span>View Menu</span>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Footer hint */}
        <p className="text-center text-[11px] text-[var(--text-muted)]">
          Scanning a basket QR code will automatically select the outlet and basket.
        </p>
      </div>
    </div>
  );
}
