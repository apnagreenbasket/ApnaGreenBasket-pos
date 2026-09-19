/**
 * AdminSidebar — Left sidebar navigation for the admin dashboard.
 *
 * Extracted from the admin page.tsx god-file.
 * Contains: logo/restaurant info, active staff indicator, WebSocket status,
 * theme toggle, nav links with badges, and footer actions.
 */

"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ExternalLink,
  KeyRound,
  LogOut,
  Moon,
  QrCode,
  Radio,
  Receipt,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Sun,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
  ShoppingBag as OrdersIcon,
} from "lucide-react";
import type { AdminTheme } from "../hooks/useAdminTheme";
import type { RestaurantProfile, StaffPunchStatus } from "../adminTypes";
import type { RolePermissions, StaffMember } from "@/types";
import { apiRequest } from "../adminUtils";

export type AdminTab =
  | "orders"
  | "billing"
  | "menu"
  | "staff"
  | "analytics"
  | "inventory"
  | "customerservices"
  | "sessions"
  | "qrcodes"
  | "settings";

type AdminSidebarProps = {
  restaurant: RestaurantProfile | null;
  activeTab: AdminTab;
  userRole?: string | null;
  onTabChange: (tab: AdminTab) => void;
  onMobileClose: () => void;
  isMobileMenuOpen: boolean;

  // Staff context
  activeStaff: StaffMember | null;
  staffPermissions: RolePermissions | null;
  onPinSwitchOpen: () => void;
  onLoadStaffMembers: () => void;

  // WebSocket status
  wsStatus: "connecting" | "connected" | "disconnected";

  // Theme
  theme: AdminTheme;
  onToggleTheme: () => void;

  // Punch Shift Context
  punchStatus?: StaffPunchStatus | null;
  liveShiftSeconds?: number;
  onPunchInOpen?: () => void;
  onPunchOutOpen?: () => void;
  isAdminRole?: boolean;

  // Badges
  pendingVerificationCount: number;
  pendingApprovalsCount: number;
  lowStockAlertCount: number;
  abandonedCartCount: number;

  // Actions
  onShowAbandonedCarts: () => void;
  onLoadBillingData: () => void;
  onLoadAnalyticsData: () => void;
  onLoadInventoryData: () => void;
  onLogout: () => void;
};

export function AdminSidebar({
  restaurant,
  activeTab,
  userRole,
  onTabChange,
  onMobileClose,
  isMobileMenuOpen,
  activeStaff,
  staffPermissions,
  onPinSwitchOpen,
  onLoadStaffMembers,
  wsStatus,
  theme,
  onToggleTheme,
  punchStatus,
  liveShiftSeconds = 0,
  onPunchInOpen,
  onPunchOutOpen,
  isAdminRole,
  pendingVerificationCount,
  pendingApprovalsCount,
  lowStockAlertCount,
  abandonedCartCount,
  onShowAbandonedCarts,
  onLoadBillingData,
  onLoadAnalyticsData,
  onLoadInventoryData,
  onLogout,
}: AdminSidebarProps) {
  const handleTabClick = (tab: AdminTab, extraAction?: () => void) => {
    onTabChange(tab);
    onMobileClose();
    extraAction?.();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`${
          isMobileMenuOpen ? "fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw]" : "hidden"
        } md:flex md:static flex-col md:w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] md:h-screen md:z-30 shrink-0 shadow-2xl md:shadow-none transition-transform`}
      >
      {/* Sidebar Header */}
      <div className="p-5 border-b border-[var(--border-subtle)] space-y-3 relative">
        {/* Mobile Close Button */}
        {isMobileMenuOpen && (
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden absolute top-4 right-4 p-1.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-start gap-3">
          {restaurant?.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="h-10 w-10 shrink-0 rounded-xl object-cover border border-[var(--border-subtle)]"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)] font-bold">
              <Store className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2
              className="font-display font-bold text-sm text-[var(--text-primary)] leading-snug break-words"
              title={restaurant?.name || "My Outlet"}
            >
              {restaurant?.name || "My Outlet"}
            </h2>
            {restaurant?.slug && (
              <p
                className="font-mono text-[11px] text-[var(--accent-brand)] truncate mt-0.5"
                title={`/${restaurant.slug}`}
              >
                /{restaurant.slug}
              </p>
            )}
          </div>
        </div>

        {/* Active Staff Indicator & PIN Quick-Switch Button */}
        <div className="flex items-center justify-between rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] p-2 text-xs">
          <div className="flex items-center gap-2 truncate">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold">
              {activeStaff ? activeStaff.name[0].toUpperCase() : userRole ? userRole[0].toUpperCase() : "A"}
            </div>
            <div className="truncate">
              <p className="font-bold truncate text-[var(--text-primary)]">
                {activeStaff ? activeStaff.name : userRole ? `${userRole} Session` : "Admin Session"}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] font-mono uppercase">
                {activeStaff ? activeStaff.role : userRole || "OWNER / ADMIN"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onLoadStaffMembers();
              onPinSwitchOpen();
            }}
            className="p-1.5 rounded-lg bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition shrink-0"
            title="Quick-Switch Staff PIN"
          >
            <KeyRound className="h-4 w-4" />
          </button>
        </div>

        {/* Shift Punch Status for non-exempt staff */}
        {!isAdminRole && (
          <div>
            {punchStatus?.is_punched_in ? (
              <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-bold text-[11px] font-mono">
                    Shift: {Math.floor(liveShiftSeconds / 3600)}h {Math.floor((liveShiftSeconds % 3600) / 60)}m
                  </span>
                </div>
                {onPunchOutOpen && (
                  <button
                    type="button"
                    onClick={onPunchOutOpen}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 transition"
                    title="End shift and punch out"
                  >
                    Punch Out
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                <span className="text-[11px] font-medium">Shift Inactive</span>
                {onPunchInOpen && (
                  <button
                    type="button"
                    onClick={onPunchInOpen}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 transition"
                  >
                    Punch In
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* WebSocket Status Pill & Theme Toggle */}
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${wsStatus === "connected"
              ? "bg-emerald-100 text-emerald-800"
              : wsStatus === "connecting"
                ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
              }`}
          >
            {wsStatus === "connected" ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : wsStatus === "connecting" ? (
              <Radio className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            {wsStatus === "connected" ? "Live Feed" : wsStatus === "connecting" ? "Connecting" : "Offline"}
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        </div>
      </div>

      {/* Sidebar Nav Links */}
      <nav className="p-3 space-y-1.5 flex-1 overflow-y-auto">
        {(!staffPermissions || (staffPermissions.can_manage_billing && staffPermissions.allowed_sidebar_tabs?.includes("billing"))) && (
          <button
            type="button"
            onClick={() => handleTabClick("billing", onLoadBillingData)}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "billing"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <div className="flex items-center gap-3">
              <Receipt className="h-4 w-4" />
              <span>Billing &amp; POS</span>
            </div>
            {pendingApprovalsCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}

        {(!staffPermissions || staffPermissions.allowed_sidebar_tabs?.includes("orders")) && (
          <button
            type="button"
            onClick={() => handleTabClick("orders")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "orders"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <div className="flex items-center gap-3">
              <OrdersIcon className="h-4 w-4" />
              <span>Live Orders</span>
            </div>
            {pendingVerificationCount > 0 && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
                {pendingVerificationCount}
              </span>
            )}
          </button>
        )}

        {(!staffPermissions || staffPermissions.allowed_sidebar_tabs?.includes("menu")) && (
          <button
            type="button"
            onClick={() => handleTabClick("menu")}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "menu"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Product Catalog</span>
          </button>
        )}

        {(!staffPermissions || (staffPermissions.can_manage_inventory && staffPermissions.allowed_sidebar_tabs?.includes("inventory"))) && (
          <button
            type="button"
            onClick={() => handleTabClick("inventory", onLoadInventoryData)}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "inventory"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <div className="flex items-center gap-3">
              <Boxes className="h-4 w-4" />
              <span>Inventory</span>
            </div>
            {lowStockAlertCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-2xs">
                {lowStockAlertCount}
              </span>
            )}
          </button>
        )}

        {(!staffPermissions || (staffPermissions.can_view_analytics && staffPermissions.allowed_sidebar_tabs?.includes("analytics"))) && (
          <button
            type="button"
            onClick={() => handleTabClick("analytics", onLoadAnalyticsData)}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "analytics"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Sales &amp; Analytics</span>
          </button>
        )}

        {(!staffPermissions || staffPermissions.allowed_sidebar_tabs?.includes("customerservices")) && (
          <button
            type="button"
            onClick={() => handleTabClick("customerservices")}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "customerservices"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Customer Services</span>
          </button>
        )}

        {(!staffPermissions || (staffPermissions.can_manage_staff && staffPermissions.allowed_sidebar_tabs?.includes("staff"))) && (
          <button
            type="button"
            onClick={() => handleTabClick("staff")}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "staff"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <Users className="h-4 w-4" />
            <span>Staff &amp; Team</span>
          </button>
        )}

        {/* Abandoned Carts Badge */}
        {(!staffPermissions || staffPermissions.allowed_sidebar_tabs?.includes("sessions")) && (
          <button
            type="button"
            onClick={onShowAbandonedCarts}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold transition text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-4 w-4" />
              <span>Baskets & Carts</span>
            </div>
            {abandonedCartCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                {abandonedCartCount}
              </span>
            )}
          </button>
        )}

        {(!staffPermissions || staffPermissions.allowed_sidebar_tabs?.includes("settings")) && (
          <button
            type="button"
            onClick={() => handleTabClick("settings")}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${activeTab === "settings"
              ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              }`}
          >
            <Settings2 className="h-4 w-4" />
            <span>Outlet Settings</span>
          </button>
        )}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2">
        {restaurant?.slug && (
          <button
            type="button"
            onClick={async () => {
              try {
                const data = await apiRequest<{ token: string }>(
                  `/api/sessions/qr-token?outlet_slug=${encodeURIComponent(restaurant.slug)}&basket_number=1`
                );
                if (data?.token) {
                  window.open(
                    `/menu?slug=${encodeURIComponent(restaurant.slug)}&token=${data.token}`,
                    "_blank"
                  );
                  return;
                }
              } catch (err) {
                console.error("Error generating preview QR token:", err);
              }
              window.open(`/menu?slug=${encodeURIComponent(restaurant.slug)}`, "_blank");
            }}
            className="w-full flex items-center justify-between rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
              View Online Store
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          </button>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-500/40 transition"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
    </>
  );
}
