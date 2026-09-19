"use client";

import React, { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { Header } from "@/components/Header";
import { CategoryNav } from "@/components/CategoryNav";
import { MenuItemCard } from "@/components/MenuItemCard";
import { VariantSelectorSheet } from "@/components/VariantSelectorSheet";
import { CartFloatingBar } from "@/components/CartFloatingBar";
import { CheckoutDrawer } from "@/components/CheckoutDrawer";
import { OrderTicketSlip } from "@/components/OrderTicketSlip";
import { SessionGate } from "@/components/SessionGate";
import { WelcomeRestaurantSelector } from "@/components/WelcomeRestaurantSelector";
import { CartProvider, useCart } from "@/context/CartContext";
import { SessionProvider, useSession } from "@/context/SessionContext";
import SessionExpiryWarning from "@/components/SessionExpiryWarning";
import { Category, MenuItem, PublicMenuResponse } from "@/types";
import { getApiBaseUrl } from "@/lib/api";
import { Search, X, ShoppingBag, Store, RefreshCw } from "lucide-react";

class MenuErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("MenuPage ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-4 py-8 text-center text-[var(--text-primary)]">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h2 className="font-sans text-lg font-bold">Unable to render store catalog</h2>
          <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
            {this.state.error?.message || "An unexpected error occurred while loading the store catalog."}
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.removeItem("last_active_table");
                window.location.reload();
              }
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-[var(--accent-brand-hover)]"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Catalog
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function DigitalMenuApp() {
  const { tableNumber, setTableNumber } = useCart();
  const {
    isSessionActive,
    isSessionLoading,
    setTableNumber: setSessionTable,
    setRestaurantSlug,
    restaurantSlug,
  } = useSession();
  const [menuData, setMenuData] = useState<PublicMenuResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcomeSelector, setShowWelcomeSelector] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] =
    useState<MenuItem | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const loadMenuForSlug = useCallback(
    async (slug: string, silent = false) => {
      if (!silent) setIsLoading(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for slow network/cold starts

      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/public/menu/${slug}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "bypass-tunnel-reminder": "true",
          },
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          setMenuData(data);
          if (data.categories?.length > 0) {
            setActiveCategoryId((prev) => prev || data.categories[0].id);
          }
          setShowWelcomeSelector(false);
        } else if (res.status === 404) {
          if (!silent) {
            setMenuData(null);
            setShowWelcomeSelector(true);
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn("Menu fetch error/timeout:", err);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    []
  );

  // Background auto-refresh polling (60s)
  useEffect(() => {
    if (!restaurantSlug || !menuData) return;
    const interval = setInterval(() => {
      loadMenuForSlug(restaurantSlug, true); // silent refresh
    }, 60000);
    return () => clearInterval(interval);
  }, [restaurantSlug, !!menuData, loadMenuForSlug]);

  useEffect(() => {
    async function initMenuAndSession() {
      if (typeof window === "undefined") {
        setIsLoading(false);
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get("token");
      const slugParam = urlParams.get("slug");
      const savedSlug = localStorage.getItem("last_active_slug");
      const savedTable = localStorage.getItem("last_active_table");

      let currentSlug = slugParam || "";
      let currentTable = "";

      // 1. If tokenParam is present in URL, resolve token from backend first
      if (tokenParam) {
        setIsLoading(true);
        setTokenError(null);
        try {
          const apiBase = getApiBaseUrl();
          const res = await fetch(
            `${apiBase}/api/sessions/resolve-token?token=${encodeURIComponent(tokenParam)}`,
            { headers: { "bypass-tunnel-reminder": "true" } }
          );

          if (res.ok) {
            const resolved = await res.json();
            currentSlug = resolved.outlet_slug;
            currentTable = resolved.basket_number;

            setTableNumber(currentTable);
            setSessionTable(currentTable);
            setRestaurantSlug(currentSlug);
            localStorage.setItem("last_active_slug", currentSlug);
            localStorage.setItem("last_active_table", currentTable);

            // Maintain slug and token in URL bar (do not expose basket number)
            window.history.replaceState(
              {},
              "",
              `/menu?slug=${encodeURIComponent(currentSlug)}&token=${encodeURIComponent(tokenParam)}`
            );

            await loadMenuForSlug(currentSlug);
            return;
          } else {
            setTokenError(
              "Invalid or expired QR code token. Please scan a valid QR code or select a restaurant."
            );
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error("Failed to resolve QR token:", err);
          setTokenError(
            "Failed to resolve QR token. Please check your connection and try again."
          );
          setIsLoading(false);
          return;
        }
      }

      // 2. Resume active session if saved in localStorage
      if (savedTable && (savedSlug || slugParam)) {
        currentSlug = slugParam || savedSlug || "";
        currentTable = savedTable;
        setTableNumber(savedTable);
        setSessionTable(savedTable);
        setRestaurantSlug(currentSlug);
        localStorage.setItem("last_active_slug", currentSlug);

        window.history.replaceState({}, "", `/menu?slug=${encodeURIComponent(currentSlug)}`);
        await loadMenuForSlug(currentSlug);
        return;
      }

      // 3. No token and no active session — block direct basket URL manipulation
      if (slugParam) {
        setRestaurantSlug(slugParam);
        setTokenError(
          "No valid QR token found in URL. Please scan the QR code on your table to view the menu and start ordering."
        );
        setIsLoading(false);
        return;
      }

      setShowWelcomeSelector(true);
      setIsLoading(false);
    }

    void initMenuAndSession();
  }, [setTableNumber, setSessionTable, setRestaurantSlug, loadMenuForSlug]);

  const handleSelectRestaurant = (slug: string, table: string) => {
    setTableNumber(table);
    setSessionTable(table);
    setRestaurantSlug(slug);
    if (typeof window !== "undefined") {
      localStorage.setItem("last_active_slug", slug);
      localStorage.setItem("last_active_table", table);
      window.history.replaceState({}, "", `/menu?slug=${slug}`);
    }
    loadMenuForSlug(slug);
  };

  const offerItems = useMemo(() => {
    if (!menuData?.categories) return [];
    return menuData.categories
      .flatMap((c) => c.items || [])
      .filter((item: MenuItem) => item && item.is_on_offer && item.offer_price);
  }, [menuData]);

  const filteredOfferItems = useMemo(() => {
    if (!searchQuery.trim()) return offerItems;
    return offerItems.filter(
      (item: MenuItem) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [offerItems, searchQuery]);

  const filterCategoryItems = (category: Category) => {
    const items = category?.items || [];
    if (!searchQuery.trim()) return items;
    return items.filter(
      (item: MenuItem) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Render token error state if QR token is invalid or expired
  if (tokenError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-4 py-8 text-center text-[var(--text-primary)]">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <Store className="h-7 w-7" />
        </div>
        <h2 className="font-sans text-lg font-bold">Invalid or Expired QR Code</h2>
        <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
          {tokenError}
        </p>
        <button
          type="button"
          onClick={() => {
            setTokenError(null);
            setShowWelcomeSelector(true);
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-[var(--accent-brand-hover)]"
        >
          <Store className="h-4 w-4" />
          Select Restaurant
        </button>
      </div>
    );
  }

  // 1. Render Welcome Restaurant Selector if no active slug chosen
  if (showWelcomeSelector) {
    return (
      <WelcomeRestaurantSelector
        onSelectRestaurant={handleSelectRestaurant}
        initialTableNumber={tableNumber}
      />
    );
  }

  // 2. Show session gate if not logged in (and done loading)
  if (!isSessionLoading && !isSessionActive) {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-base)] transition-colors">
        <SessionGate />
      </div>
    );
  }

  // 3. Show loading while checking session or menu data
  if (isSessionLoading || isLoading || !menuData) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-brand)]" />
          <p className="text-xs text-[var(--text-muted)]">Loading store catalog...</p>
        </div>
      </div>
    );
  }

  const handleSelectCategory = (catId: string) => {
    setActiveCategoryId(catId);
    const elementId = catId === "offers" ? "category-offers" : `category-${catId}`;
    const element = document.getElementById(elementId);
    if (element) {
      const offset = 110;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-base)] pb-28 transition-colors">
      <Header
        restaurantName={menuData?.outlet_name || "ApnaGreen Basket"}
        tableNumber={tableNumber}
        logoUrl={menuData?.logo_url || undefined}
        onSearchClick={() => setIsSearchOpen(!isSearchOpen)}
      />

      {isSearchOpen && (
        <div className="sticky top-[57px] z-25 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-xs animate-in slide-in-from-top duration-150">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search dishes, ingredients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-9 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-brand)] focus:outline-hidden"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {menuData && menuData.categories.length > 0 && (
        <CategoryNav
          categories={menuData.categories}
          activeCategoryId={activeCategoryId}
          onSelectCategory={handleSelectCategory}
          hasOffers={offerItems.length > 0}
        />
      )}

      <main className="space-y-6 px-4 pt-4">
        {/* Special Offers & Deals Section */}
        {filteredOfferItems.length > 0 && (
          <section id="category-offers" className="scroll-mt-32 space-y-3">
            <div className="flex items-center justify-between border-b border-amber-500/40 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🔥</span>
                <h2 className="font-sans text-sm font-bold tracking-tight text-amber-600 dark:text-amber-400 uppercase">
                  Special Offers & Deals
                </h2>
              </div>
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {filteredOfferItems.length} {filteredOfferItems.length === 1 ? "deal" : "deals"}
              </span>
            </div>

            <div className="space-y-3">
              {filteredOfferItems.map((item) => (
                <MenuItemCard
                    isEveningOverrideActive={menuData?.evening_price_active || false}
                  key={`offer-${item.id}`}
                  item={item}
                  onOpenVariantSheet={(selectedItem) =>
                    setSelectedItemForVariant(selectedItem)
                  }
                />
              ))}
            </div>
          </section>
        )}
        {menuData && menuData.categories.length > 0 ? (
          menuData.categories.map((category) => {
            const visibleItems = filterCategoryItems(category);

            if (searchQuery.trim() && visibleItems.length === 0) {
              return null;
            }

            return (
              <section
                key={category.id}
                id={`category-${category.id}`}
                className="scroll-mt-32 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                  <h2 className="font-sans text-sm font-bold tracking-tight text-[var(--text-primary)] uppercase">
                    {category.name}
                  </h2>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {visibleItems.length}{" "}
                    {visibleItems.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="space-y-3">
                  {visibleItems.map((item: MenuItem) => (
                    <MenuItemCard
                    isEveningOverrideActive={menuData?.evening_price_active || false}
                      key={item.id}
                      item={item}
                      onOpenVariantSheet={(selectedItem) =>
                        setSelectedItemForVariant(selectedItem)
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <div className="space-y-3 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h3 className="font-sans text-base font-bold text-[var(--text-primary)]">
              Menu Unavailable
            </h3>
            <p className="mx-auto max-w-xs text-xs leading-relaxed text-[var(--text-secondary)]">
              We couldn&apos;t load the catalog right now. Please select another outlet or try again.
            </p>
            <button
              onClick={() => setShowWelcomeSelector(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-white shadow-sm"
            >
              <Store className="h-4 w-4" />
              Switch Outlet
            </button>
          </div>
        )}

        {searchQuery.trim() &&
          menuData?.categories.every(
            (cat) => filterCategoryItems(cat).length === 0
          ) && (
            <div className="space-y-2 py-12 text-center">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                No items match &quot;{searchQuery}&quot;
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Try searching for another dish or clear filters.
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-1 text-xs font-bold text-[var(--accent-brand)] underline"
              >
                Clear Search
              </button>
            </div>
          )}
      </main>

      <VariantSelectorSheet
        item={selectedItemForVariant}
        onClose={() => setSelectedItemForVariant(null)}
      />

      <CartFloatingBar />

      <CheckoutDrawer
        restaurantSlug={menuData?.outlet_slug || restaurantSlug}
        restaurantName={menuData?.outlet_name || "ApnaGreen Basket"}
        allowedPaymentMode={menuData?.payment_mode}
      />

      <OrderTicketSlip />
    </div>
  );
}

export default function MenuPage() {
  return (
    <MenuErrorBoundary>
      <Suspense
        fallback={
          <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center bg-[var(--bg-base)]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-brand)]" />
              <p className="text-xs text-[var(--text-muted)]">Loading digital menu...</p>
            </div>
          </div>
        }
      >
        <SessionProvider>
          <CartProvider>
            <DigitalMenuApp />
            <SessionExpiryWarning />
          </CartProvider>
        </SessionProvider>
      </Suspense>
    </MenuErrorBoundary>
  );
}
