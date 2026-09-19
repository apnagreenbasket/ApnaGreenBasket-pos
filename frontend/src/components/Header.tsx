"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Moon, Sun, Store, Search, UserCircle, LogIn } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSession } from "@/context/SessionContext";
import { SessionGate } from "@/components/SessionGate";
import { SessionOrdersDrawer } from "@/components/SessionOrdersDrawer";

import { resolveImageUrl } from "@/lib/api";

interface HeaderProps {
  restaurantName: string;
  tableNumber: string;
  logoUrl?: string;
  onSearchClick?: () => void;
}

export function Header({ restaurantName, tableNumber, logoUrl, onSearchClick }: HeaderProps) {
  const { theme, toggleTheme } = useCart();
  const { isSessionActive, customerName, restaurantSlug } = useSession();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showOrders, setShowOrders] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          {/* Brand & Logo */}
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img
                src={resolveImageUrl(logoUrl)}
                alt={restaurantName}
                className="h-9 w-9 rounded-xl object-cover border border-[var(--border-subtle)]"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-white shadow-sm">
                <Store className="h-5 w-5" />
              </div>
            )}
            <div>
              <h1 className="font-sans text-base font-bold tracking-tight text-[var(--text-primary)]">
                {restaurantName}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--status-paid-text)] animate-pulse" />
                <span>Digital Order</span>
              </div>
            </div>
          </div>

          {/* Right side: Table badge, Account, Theme toggle, Search */}
          <div className="flex items-center gap-2">
            {/* Table Badge */}
            <div className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] shadow-2xs">
              <span className="text-[var(--text-muted)] font-normal">Basket</span>
              <span className="text-[var(--accent-brand)] font-bold">
                #{tableNumber ? (tableNumber.startsWith("#") ? tableNumber.slice(1) : tableNumber) : "#"}
              </span>
            </div>

            {/* Account / Login Button */}
            {isSessionActive ? (
              <Link
                href="/account"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] transition-transform active:scale-95 hover:bg-[var(--accent-brand)]/20"
                title={`Logged in as ${customerName}`}
              >
                <UserCircle className="h-5 w-5" />
              </Link>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] transition-transform active:scale-95 hover:bg-[var(--bg-surface-hover)]"
                title="Login to track orders"
              >
                <LogIn className="h-4 w-4 text-[var(--text-secondary)]" />
              </button>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] transition-transform active:scale-95 hover:bg-[var(--bg-surface-hover)]"
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4 text-slate-700" />
              ) : (
                <Sun className="h-4 w-4 text-amber-400" />
              )}
            </button>

            {/* Search Trigger */}
            {onSearchClick && (
              <button
                onClick={onSearchClick}
                aria-label="Search products"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] transition-transform active:scale-95 hover:bg-[var(--bg-surface-hover)]"
              >
                <Search className="h-4 w-4 text-[var(--text-secondary)]" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Login Modal */}
      {showLoginModal && (
        <SessionGate isModal onClose={() => setShowLoginModal(false)} />
      )}

      {/* Session Orders Drawer */}
      <SessionOrdersDrawer
        isOpen={showOrders}
        onClose={() => setShowOrders(false)}
      />
    </>
  );
}
