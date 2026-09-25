"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAdminAuth } from "./login/hooks/useAdminAuth";
import { useAdminTheme } from "./login/hooks/useAdminTheme";
import { useOrdersManagement } from "./login/hooks/useOrdersManagement";
import { useMenuManagement } from "./login/hooks/useMenuManagement";
import { useStaffManagement } from "./login/hooks/useStaffManagement";
import { useInventoryManagement } from "./login/hooks/useInventoryManagement";
import { useBillingManagement } from "./login/hooks/useBillingManagement";
import { useAnalyticsManagement } from "./login/hooks/useAnalyticsManagement";
import { useSessionsManagement } from "./login/hooks/useSessionsManagement";
import { useSettingsManagement } from "./login/hooks/useSettingsManagement";
import { useNotificationManagement } from "./login/hooks/useNotificationManagement";
import { useStaffPunch } from "./login/hooks/useStaffPunch";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { isAuthError } from "./login/adminUtils";

import { AdminLoginForm } from "./login/components/AdminLoginForm";
import { AdminSidebar } from "./login/components/AdminSidebar";
import { NotificationPanel } from "./login/components/NotificationPanel";
import { BillingDateRangeFilter } from "./login/components/BillingDateRangeFilter";
import { PunchInModal } from "./login/modals/PunchInModal";
import { PunchOutModal } from "./login/modals/PunchOutModal";
import { 
  Menu, X, Bell, LayoutDashboard, UtensilsCrossed, 
  Settings, LogOut, TicketPercent, Check, LogIn
} from "lucide-react";
import { ToastNotification } from "./components/ToastNotification";

import { OrdersTab } from "./login/tabs/OrdersTab";
import { MenuTab } from "./login/tabs/MenuTab";
import { StaffTab } from "./login/tabs/StaffTab";
import { AnalyticsTab } from "./login/tabs/AnalyticsTab";
import { BillingTab } from "./login/tabs/BillingTab";
import { InventoryTab } from "./login/tabs/InventoryTab";
import { CustomerServicesTab } from "./login/tabs/CustomerServicesTab";
import { QrCodesTab } from "./login/tabs/QrCodesTab";
import { SettingsTab } from "./login/tabs/SettingsTab";

import { AbandonedCartsPanel } from "./login/modals/AbandonedCartsPanel";
import { StaffAssistBasketModal } from "./login/modals/StaffAssistBasketModal";
import { CreateBillDrawer } from "./login/modals/CreateBillDrawer";
import { PaymentModal } from "./login/modals/PaymentModal";
import { DiscountModal } from "./login/modals/DiscountModal";
import { VariantModal } from "./login/modals/VariantModal";
import { OfferModal } from "./login/modals/OfferModal";
import { StaffModal } from "./login/modals/StaffModal";
import { PinModal } from "./login/modals/PinModal";
import { PinSwitchModal } from "./login/modals/PinSwitchModal";

import type { AdminTab, RestaurantProfile, AdminMenuItem } from "./login/adminTypes";
import type { ActiveSession, StaffMember } from "@/types";
import { RESTAURANT_DATA_KEY } from "./login/adminTypes";

const VALID_TABS: AdminTab[] = [
  "orders",
  "billing",
  "menu",
  "staff",
  "analytics",
  "inventory",
  "customerservices",
  "qrcodes",
  "settings",
  "sessions",
];

const TAB_TITLES: Record<AdminTab, string> = {
  menu: "Product Catalog",
  billing: "Billing & POS",
  orders: "Live Orders",
  inventory: "Inventory",
  analytics: "Sales & Analytics",
  customerservices: "Customer Services",
  staff: "Staff & Team",
  qrcodes: "QR & Tables",
  settings: "Outlet Settings",
  sessions: "Baskets & Carts",
};

const resolveTabFromHash = (raw: string): AdminTab | null => {
  const clean = raw.replace("#", "").toLowerCase();
  if (clean === "catalog" || clean === "products") return "menu";
  if (VALID_TABS.includes(clean as AdminTab)) return clean as AdminTab;
  return null;
};

export default function AdminDashboardPage() {
  const { theme, toggleTheme } = useAdminTheme();
  const [activeTab, setActiveTabState] = useState<AdminTab>("billing");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [assistTargetSession, setAssistTargetSession] = useState<ActiveSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore tab on client mount from URL hash or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const fromHash = resolveTabFromHash(window.location.hash);
      if (fromHash) {
        setActiveTabState(fromHash);
        localStorage.setItem("admin_active_tab", fromHash);
        return;
      }
      const saved = localStorage.getItem("admin_active_tab") as AdminTab;
      if (saved && VALID_TABS.includes(saved)) {
        setActiveTabState(saved);
        const hashTag = saved === "menu" ? "catalog" : saved;
        window.history.replaceState(null, "", `#${hashTag}`);
      }
    }
  }, []);

  // Listen for hashchange events
  useEffect(() => {
    const handleHashChange = () => {
      const fromHash = resolveTabFromHash(window.location.hash);
      if (fromHash) {
        setActiveTabState(fromHash);
        localStorage.setItem("admin_active_tab", fromHash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const setActiveTab = useCallback((tab: AdminTab) => {
    setError(null);
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin_active_tab", tab);
      const hashTag = tab === "menu" ? "catalog" : tab;
      window.history.replaceState(null, "", `#${hashTag}`);
    }
  }, []);

  // Authentication
  const {
    accessToken,
    isMounted,
    authHeaders,
    apiRequest,
    login,
    pinLogin,
    logout,
    userRole,
    currentUserId,
    isAdminRole,
    setSessionToken,
  } = useAdminAuth();

  // Restaurant Profile State
  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);

  // Web Audio synthesizer beep
  const playBeep = useCallback((freq: number = 880) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch { }
  }, []);

  // Load Dashboard Restaurant Info
  const loadDashboard = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<RestaurantProfile>("/api/admin/outlets/me");
      setRestaurant((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(data)) return prev;
        return data;
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RESTAURANT_DATA_KEY, JSON.stringify(data));
      }
    } catch (err: any) {
      if (isAuthError(err)) return;
      console.error("Dashboard fetch error:", err);
    }
  }, [accessToken, apiRequest]);

  useEffect(() => {
    if (accessToken) {
      loadDashboard();
    }
  }, [accessToken, loadDashboard]);

  // Domain Management Hooks
  const staffState = useStaffManagement({
    accessToken,
    authHeaders,
    restaurant,
    apiRequest,
    setSessionToken,
    setNotice,
    setError,
  });

  // Auto-redirect to first allowed tab if current activeTab is not permitted for active role
  useEffect(() => {
    if (staffState.staffPermissions?.allowed_sidebar_tabs) {
      const allowed = staffState.staffPermissions.allowed_sidebar_tabs as AdminTab[];
      if (allowed.length > 0 && !allowed.includes(activeTab)) {
        setActiveTab(allowed[0]);
      }
    }
  }, [staffState.staffPermissions, activeTab, setActiveTab]);

  const canAccessMenu = staffState.staffPermissions
    ? Boolean(staffState.staffPermissions.allowed_sidebar_tabs?.includes("menu"))
    : true;
  const canManageMenu = isAdminRole && (!staffState.staffPermissions || staffState.staffPermissions.can_edit_menu);
  const menuState = useMenuManagement({
    accessToken,
    apiRequest,
    setNotice,
    setError,
    enabled: Boolean(accessToken) && canAccessMenu,
  });

  const canManageInventory = isAdminRole && (!staffState.staffPermissions || staffState.staffPermissions.can_manage_inventory);
  const handleItemOnboarded = useCallback(
    (_item: any, hadSellingPrice: boolean) => {
      if (hadSellingPrice) {
        menuState.loadCategoriesAndMenuItems();
      }
    },
    [menuState.loadCategoriesAndMenuItems]
  );

  const inventoryState = useInventoryManagement(
    apiRequest,
    playBeep,
    canManageInventory,
    handleItemOnboarded
  );

  // Debounce catalog & inventory refreshes to coalesce rapid events (e.g. bulk updates, WebSocket bursts)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshCatalogAndInventory = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      void menuState.loadCategoriesAndMenuItems();
      if (canManageInventory) {
        void inventoryState.fetchItems();
        void inventoryState.fetchBatches();
      }
    }, 600);
  }, [
    menuState.loadCategoriesAndMenuItems,
    canManageInventory,
    inventoryState.fetchItems,
    inventoryState.fetchBatches,
  ]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const canManageOrders = staffState.staffPermissions
    ? Boolean(staffState.staffPermissions.can_manage_orders || staffState.staffPermissions.allowed_sidebar_tabs?.includes("orders"))
    : true;

  const ordersState = useOrdersManagement({
    accessToken,
    restaurant,
    apiRequest,
    loadDashboard,
    setNotice,
    setError,
    onCatalogUpdated: refreshCatalogAndInventory,
    enabled: canManageOrders,
  });

  const canManageBilling = staffState.staffPermissions
    ? Boolean(staffState.staffPermissions.can_manage_billing)
    : (userRole ? ["SUPERADMIN", "OUTLET_ADMIN", "MANAGER", "CASHIER"].includes(userRole) : false);

  const billingState = useBillingManagement({
    accessToken,
    authHeaders,
    apiRequest,
    setNotice,
    setError,
    onBillSettled: refreshCatalogAndInventory,
    enabled: canManageBilling,
  });

  const analyticsState = useAnalyticsManagement({
    accessToken,
    authHeaders,
    apiRequest,
  });

  const sessionsState = useSessionsManagement({
    accessToken,
    restaurant,
    apiRequest,
    setNotice,
    setError,
  });

  const settingsState = useSettingsManagement({
    accessToken,
    restaurant,
    setRestaurant,
    apiRequest,
    setNotice,
    setError,
  });

  const canViewNotifications = isAdminRole && (!staffState.staffPermissions || staffState.staffPermissions.can_manage_staff || staffState.staffPermissions.can_view_analytics);
  const notificationState = useNotificationManagement({
    accessToken,
    apiRequest,
    enabled: canViewNotifications,
  });

  const punchState = useStaffPunch({
    accessToken,
    userRole,
    isAdminRole,
    apiRequest,
    setNotice,
    setError,
    onOpenPinSwitch: () => {
      void staffState.loadStaffMembers();
      staffState.setPinSwitchModalOpen(true);
    },
    onReloadDashboardData: () => {
      void billingState.loadBillingData?.();
      void ordersState.fetchOrders?.();
      void sessionsState.fetchActiveSessions?.();
      if (staffState.staffPermissions?.can_manage_staff) {
        void staffState.loadStaffAuditLogs?.();
      }
    },
  });

  // Redirect to first allowed tab if current activeTab is restricted for this user's role
  useEffect(() => {
    const perms = staffState.staffPermissions;
    if (perms && perms.allowed_sidebar_tabs && perms.allowed_sidebar_tabs.length > 0) {
      if (!perms.allowed_sidebar_tabs.includes(activeTab)) {
        const target = perms.allowed_sidebar_tabs[0] as AdminTab;
        setActiveTab(target);
      }
    }
  }, [staffState.staffPermissions, activeTab, setActiveTab]);

  // Global Barcode Scanner Hook for Inventory Tab
  useBarcodeScanner({
    onScan: (barcode: string) => {
      if (activeTab === "inventory") {
        inventoryState.handleBarcodeScan(barcode);
      }
    },
    enabled:
      !!accessToken &&
      activeTab === "inventory" &&
      !inventoryState.isRegisterModalOpen &&
      !inventoryState.isEditItemModalOpen,
  });

  if (!isMounted) return null;

  if (!accessToken) {
    return (
      <AdminLoginForm
        onLogin={async (email, password, outletId) => {
          await login(email, password, outletId);
          await loadDashboard();
        }}
        onPinLogin={async (outletId, staffId, pin) => {
          await pinLogin(outletId, staffId, pin);
          await loadDashboard();
        }}
      />
    );
  }

  const pendingVerificationCount = ordersState.orders.filter(
    (o) => o.status === "PENDING_VERIFICATION"
  ).length;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] font-sans text-[var(--text-primary)]">
      {/* Sidebar Component */}
      <AdminSidebar
        restaurant={restaurant}
        activeTab={activeTab}
        userRole={userRole}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setIsMobileMenuOpen(false);
        }}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        isMobileMenuOpen={isMobileMenuOpen}
        activeStaff={staffState.activeStaff}
        staffPermissions={staffState.staffPermissions}
        onPinSwitchOpen={() => {
          void staffState.loadStaffMembers();
          staffState.setPinSwitchModalOpen(true);
        }}
        onLoadStaffMembers={staffState.loadStaffMembers}
        wsStatus={ordersState.wsStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        punchStatus={punchState.punchStatus}
        liveShiftSeconds={punchState.liveShiftSeconds}
        onPunchInOpen={() => punchState.setPunchInModalOpen(true)}
        onPunchOutOpen={() => punchState.setPunchOutModalOpen(true)}
        isAdminRole={isAdminRole}
        pendingVerificationCount={pendingVerificationCount}
        pendingApprovalsCount={billingState.pendingApprovalsCount}
        lowStockAlertCount={inventoryState.alerts.length}
        abandonedCartCount={sessionsState.abandonedCartCount}
        onShowAbandonedCarts={() => sessionsState.setShowAbandonedCartsPanel(true)}
        onLoadBillingData={billingState.loadBillingData}
        onLoadAnalyticsData={analyticsState.loadActiveTabData}
        onLoadInventoryData={inventoryState.fetchItems}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* Top Header Control Bar with Bell Notification Icon */}
        <div className="mb-6 flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition shadow-xs"
              title="Open Mobile Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-display text-xl font-black text-[var(--text-primary)] capitalize">
                {restaurant?.name || "ApnaGreen Basket"}
              </h1>
              <p className="text-xs text-[var(--text-muted)] hidden sm:block">
                {(TAB_TITLES[activeTab] || activeTab)} • Real-Time Store Controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Billing Date Filter & Totals */}
            {activeTab === "billing" && (
              <div className="hidden sm:flex items-center gap-2 mr-2 bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] rounded-xl px-2 py-1.5 shadow-xs">
                {isAdminRole ? (
                  <BillingDateRangeFilter
                    dateRangeMode={billingState.dateRangeMode}
                    setDateRangeMode={billingState.setDateRangeMode}
                    customStartDate={billingState.customStartDate}
                    setCustomStartDate={billingState.setCustomStartDate}
                    customEndDate={billingState.customEndDate}
                    setCustomEndDate={billingState.setCustomEndDate}
                  />
                ) : punchState.punchStatus?.is_punched_in ? (
                  <div className="flex items-center gap-2 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>
                      Shift: {Math.floor(punchState.liveShiftSeconds / 3600)}h {Math.floor((punchState.liveShiftSeconds % 3600) / 60)}m
                    </span>
                    <button
                      type="button"
                      onClick={() => punchState.setPunchOutModalOpen(true)}
                      className="ml-1 text-[11px] font-bold text-rose-500 hover:text-rose-600 underline"
                      title="End your shift and punch out"
                    >
                      Punch Out
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-2.5 py-1 text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                    <span>Shift Inactive</span>
                    <button
                      type="button"
                      onClick={() => punchState.setPunchInModalOpen(true)}
                      className="ml-1 text-[11px] font-bold text-emerald-500 hover:text-emerald-400 underline"
                      title="Start shift and punch in"
                    >
                      Punch In
                    </button>
                  </div>
                )}
                <div className="h-4 w-px bg-[var(--border-strong)] mx-1"></div>
                <div className="flex items-center gap-1.5 text-lg sm:text-xl font-black" title="Gross POS Sales (Counter Bills)">
                  <span className="text-xs sm:text-sm font-semibold text-[var(--text-muted)] mt-0.5">Total:</span>
                  <span className="font-mono text-[var(--text-primary)]">₹{billingState.dailyGrandTotal.toFixed(2)}</span>
                </div>

                {/* Counter Credit / Debit Activity Pill */}
                {billingState.dailyCreditDebitNet !== 0 && (
                  <>
                    <div className="h-4 w-px bg-[var(--border-strong)] mx-0.5"></div>
                    <div
                      className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border cursor-help ${
                        billingState.dailyCreditDebitNet < 0
                          ? "text-amber-400 bg-amber-500/10 border-amber-500/25"
                          : "text-sky-400 bg-sky-500/10 border-sky-500/25"
                      }`}
                      title={
                        [
                          billingState.dailyDebitApplied > 0 ? `Udhaar Taken: -₹${billingState.dailyDebitApplied.toFixed(2)}` : null,
                          billingState.dailyCreditApplied > 0 ? `Store Credit Used: -₹${billingState.dailyCreditApplied.toFixed(2)}` : null,
                          billingState.dailyDebtSettled > 0 ? `Debt Settled: +₹${billingState.dailyDebtSettled.toFixed(2)}` : null,
                          billingState.dailyCreditAwarded > 0 ? `Wallet Credited: +₹${billingState.dailyCreditAwarded.toFixed(2)}` : null,
                          billingState.dailyCreditCashedOut > 0 ? `Credit Cashed Out: -₹${billingState.dailyCreditCashedOut.toFixed(2)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Net Credit / Debit Adjustment"
                      }
                    >
                      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Credit-Debit:</span>
                      <span className="font-mono font-black">
                        {billingState.dailyCreditDebitNet > 0 ? "+" : "-"}₹{Math.abs(billingState.dailyCreditDebitNet).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}

                {/* Loyalty Redemptions Pill */}
                {billingState.dailyLoyaltyRedeemed > 0 && (
                  <>
                    <div className="h-4 w-px bg-[var(--border-strong)] mx-0.5"></div>
                    <div
                      className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border text-purple-400 bg-purple-500/10 border-purple-500/25 cursor-help"
                      title={`Loyalty Points Redeemed: -₹${billingState.dailyLoyaltyRedeemed.toFixed(2)}`}
                    >
                      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Loyalty:</span>
                      <span className="font-mono font-black">-₹{billingState.dailyLoyaltyRedeemed.toFixed(2)}</span>
                    </div>
                  </>
                )}

                <div className="h-4 w-px bg-[var(--border-strong)] mx-1"></div>
                <div className="flex items-center gap-1.5 text-lg sm:text-xl font-black" title="Net Realized Settlement (Cash & Digital Payments Collected at Counter)">
                  <span className="text-xs sm:text-sm font-semibold text-[var(--text-muted)] mt-0.5">Net:</span>
                  <span className="font-mono text-[var(--accent-brand)]">₹{billingState.dailyNetPaid.toFixed(2)}</span>
                </div>

                {/* UPI Contribution Pill */}
                {billingState.dailyUpiPaid > 0 && (
                  <>
                    <div className="h-4 w-px bg-[var(--border-strong)] mx-0.5"></div>
                    <div
                      className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border text-sky-400 bg-sky-500/10 border-sky-500/25 cursor-help"
                      title="UPI / Online Contribution Collected at Counter"
                    >
                      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">UPI:</span>
                      <span className="font-mono font-black">₹{billingState.dailyUpiPaid.toFixed(2)}</span>
                    </div>
                  </>
                )}

                {/* Net Cash Pill */}
                <div className="h-4 w-px bg-[var(--border-strong)] mx-0.5"></div>
                <div
                  className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border text-emerald-400 bg-emerald-500/10 border-emerald-500/25 cursor-help"
                  title="Net Physical Cash Collected = Net Settlement - UPI Contribution"
                >
                  <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Net Cash:</span>
                  <span className="font-mono font-black">₹{billingState.dailyNetCash.toFixed(2)}</span>
                </div>
              </div>
            )}
            {/* Top-Right Bell Icon Button */}
            <button
              type="button"
              onClick={() => notificationState.setIsNotificationPanelOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:border-amber-400/60 hover:text-amber-400 transition shadow-xs"
              title="View Store Notifications & Near-Expiry Alerts"
            >
              <Bell className="h-5 w-5" />
              {notificationState.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-xs">
                  {notificationState.unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Notice & Error Toasts */}
        <ToastNotification 
          notice={notice} 
          error={error} 
          clear={() => { setNotice(null); setError(null); }} 
        />

        {/* Tab 1: Orders (Live Service Board) */}
        {activeTab === "orders" && (
          <OrdersTab
            orders={ordersState.orders}
            menuItems={menuState.menuItems}
            restaurant={restaurant}
            onUpdateOrderStatus={ordersState.onUpdateOrderStatus}
            onCancelOrder={ordersState.onCancelOrder}
            onDeleteOrder={ordersState.onDeleteOrder}
          />
        )}

        {/* Tab 2: Billing & POS */}
        {activeTab === "billing" && (
          <BillingTab
            restaurant={restaurant}
            staffPermissions={staffState.staffPermissions}
            isLoadingBilling={billingState.isLoadingBilling}
            loadBillingData={billingState.loadBillingData}
            pendingApprovals={billingState.pendingApprovals}
            handleResolveApproval={billingState.handleResolveApproval}
            billsList={billingState.billsList}
            menuItems={menuState.menuItems}
            billingStatusFilter={billingState.billingStatusFilter}
            setBillingStatusFilter={billingState.setBillingStatusFilter}
            billingSearchQuery={billingState.billingSearchQuery}
            setBillingSearchQuery={billingState.setBillingSearchQuery}
            computedStartDate={billingState.computedStartDate}
            computedEndDate={billingState.computedEndDate}
            dateRangeMode={billingState.dateRangeMode}
            dailyGrandTotal={billingState.dailyGrandTotal}
            dailyNetPaid={billingState.dailyNetPaid}
            dailyUpiPaid={billingState.dailyUpiPaid}
            dailyNetCash={billingState.dailyNetCash}
            dailyReturnsTotal={billingState.dailyReturnsTotal}
            dailyCreditDebitNet={billingState.dailyCreditDebitNet}
            isAdminRole={isAdminRole}
            isPunchedIn={punchState.punchStatus?.is_punched_in ?? true}
            onRequirePunchIn={() => punchState.setPunchInModalOpen(true)}
            onOpenCreateBill={() => {
              if (!isAdminRole && !punchState.punchStatus?.is_punched_in) {
                punchState.setPunchInModalOpen(true);
                return;
              }
              refreshCatalogAndInventory();
              billingState.setCreateBillModalOpen(true);
            }}
            onResumeDraft={billingState.handleResumeDraft}
            onOpenDiscountModal={billingState.openDiscountModal}
            onOpenPaymentModal={billingState.openPaymentModal}
            onEditCompletedBill={billingState.handleEditCompletedBill}
            onDeleteBill={billingState.handleDeleteBill}
            onBillSettled={refreshCatalogAndInventory}
          />
        )}

        {/* Tab 3: Menu Catalog */}
        {activeTab === "menu" && (
          <MenuTab
            categories={menuState.categories}
            menuItems={menuState.menuItems}
            menuPage={menuState.menuPage}
            setMenuPage={menuState.setMenuPage}
            menuTotalPages={menuState.menuTotalPages}
            menuTotal={menuState.menuTotal}
            variantsByItem={menuState.variantsByItem}
            selectedCategory={menuState.selectedCategory}
            setSelectedCategory={menuState.setSelectedCategory}
            searchQuery={menuState.searchQuery}
            setSearchQuery={menuState.setSearchQuery}
            authToken={accessToken || undefined}
            onSaveItem={menuState.handleSaveMenuItem}
            onSaveBatchItems={menuState.handleSaveBatchMenuItems}
            onDeleteItem={menuState.handleDeleteMenuItem}
            onToggleAvailability={menuState.handleToggleAvailability}
            onOpenVariantModal={menuState.openVariantModal}
            onOpenOfferModal={menuState.openOfferModal}
            onCreateCategory={menuState.handleCreateCategory}
            onDeleteCategory={menuState.handleDeleteCategory}
            inventoryItems={inventoryState.items}
            restaurant={restaurant}
            onRestaurantUpdate={setRestaurant}
          />
        )}

        {/* Tab 4: Staff Management */}
        {activeTab === "staff" && (
          <StaffTab
            restaurant={restaurant}
            staffList={staffState.staffList}
            staffAuditLogs={staffState.staffAuditLogs}
            isLoadingStaff={staffState.isLoadingStaff}
            auditRoleFilter={staffState.auditRoleFilter}
            setAuditRoleFilter={staffState.setAuditRoleFilter}
            auditActionFilter={staffState.auditActionFilter}
            setAuditActionFilter={staffState.setAuditActionFilter}
            auditDateFilter={staffState.auditDateFilter}
            setAuditDateFilter={staffState.setAuditDateFilter}
            auditPage={staffState.auditPage}
            setAuditPage={staffState.setAuditPage}
            auditTotalPages={staffState.auditTotalPages}
            currentUserRole={userRole}
            currentUserId={currentUserId || staffState.activeStaff?.id || null}
            loadStaffMembers={staffState.loadStaffMembers}
            loadStaffAuditLogs={staffState.loadStaffAuditLogs}
            onDeactivateStaffMember={staffState.onDeactivateStaffMember}
            onActivateStaffMember={staffState.onActivateStaffMember}
            onDeleteStaffMemberPermanently={staffState.onDeleteStaffMemberPermanently}
            onOpenCreateStaff={() => {
              staffState.setEditingStaffId(null);
              staffState.setStaffFormState({
                outlet_id: restaurant?.id || "",
                name: "",
                email: "",
                phone: "",
                role: userRole === "MANAGER" ? "CASHIER" : "STAFF",
                password: "",
                pin: "",
              });
              staffState.setStaffModalOpen(true);
            }}
            onOpenEditStaff={(member: StaffMember) => {
              staffState.setEditingStaffId(member.id);
              staffState.setStaffFormState({
                outlet_id: restaurant?.id || "",
                name: member.name,
                email: member.email,
                phone: member.phone || "",
                role: member.role,
                password: "",
                pin: "",
              });
              staffState.setStaffModalOpen(true);
            }}
            onOpenPinSetup={(member: StaffMember) => {
              staffState.setPinTargetStaff(member);
              staffState.setPinModalOpen(true);
            }}
            onOpenPinSwitch={() => {
              void staffState.loadStaffMembers();
              staffState.setPinSwitchModalOpen(true);
            }}
          />
        )}

        {/* Tab 5: Analytics */}
        {activeTab === "analytics" && (staffState.staffPermissions?.can_view_analytics ?? true) && (
          <AnalyticsTab
            restaurant={restaurant}
            categories={menuState.categories}
            {...analyticsState}
          />
        )}

        {/* Tab 6: Inventory, Barcode Scanner, Batches & Wastage */}
        {activeTab === "inventory" && (
          <InventoryTab
            activeSubTab={inventoryState.activeSubTab}
            setActiveSubTab={inventoryState.setActiveSubTab}
            inventoryViewMode={inventoryState.inventoryViewMode}
            setInventoryViewMode={inventoryState.setInventoryViewMode}
            items={inventoryState.items}
            itemsPage={inventoryState.itemsPage}
            setItemsPage={inventoryState.setItemsPage}
            itemsTotalPages={inventoryState.itemsTotalPages}
            itemsTotal={inventoryState.itemsTotal}
            batches={inventoryState.batches}
            batchesPage={inventoryState.batchesPage}
            setBatchesPage={inventoryState.setBatchesPage}
            batchesTotalPages={inventoryState.batchesTotalPages}
            batchesTotal={inventoryState.batchesTotal}
            suppliers={inventoryState.suppliers}
            createSupplier={inventoryState.createSupplier}
            updateSupplier={inventoryState.updateSupplier}
            fetchBatches={inventoryState.fetchBatches}
            fetchItems={inventoryState.fetchItems}
            alerts={inventoryState.alerts}
            ledgerEntries={inventoryState.ledgerEntries}
            ledgerTotal={inventoryState.ledgerTotal}
            ledgerPage={inventoryState.ledgerPage}
            setLedgerPage={inventoryState.setLedgerPage}
            ledgerPageSize={inventoryState.ledgerPageSize}
            ledgerFilterItem={inventoryState.ledgerFilterItem}
            setLedgerFilterItem={inventoryState.setLedgerFilterItem}
            ledgerFilterType={inventoryState.ledgerFilterType}
            setLedgerFilterType={inventoryState.setLedgerFilterType}
            isLoading={inventoryState.isLoading}
            error={inventoryState.error}
            scanQty={inventoryState.scanQty}
            setScanQty={inventoryState.setScanQty}
            scanWeight={inventoryState.scanWeight}
            setScanWeight={inventoryState.setScanWeight}
            scannedBarcode={inventoryState.scannedBarcode}
            setScannedBarcode={inventoryState.setScannedBarcode}
            isRegisterModalOpen={inventoryState.isRegisterModalOpen}
            setIsRegisterModalOpen={inventoryState.setIsRegisterModalOpen}
            unregisteredBarcode={inventoryState.unregisteredBarcode}
            scanFeed={inventoryState.scanFeed}
            handleBarcodeScan={inventoryState.handleBarcodeScan}
            onboardScannedItem={inventoryState.onboardScannedItem}
            selectedBatchItem={inventoryState.selectedBatchItem}
            isBatchDrawerOpen={inventoryState.isBatchDrawerOpen}
            openBatchDrawer={inventoryState.openBatchDrawer}
            closeBatchDrawer={inventoryState.closeBatchDrawer}
            isAddSupplierModalOpen={inventoryState.isAddSupplierModalOpen}
            setIsAddSupplierModalOpen={inventoryState.setIsAddSupplierModalOpen}
            editingSupplier={inventoryState.editingSupplier}
            setEditingSupplier={inventoryState.setEditingSupplier}
            openEditSupplierModal={inventoryState.openEditSupplierModal}
            isWastageModalOpen={inventoryState.isWastageModalOpen}
            selectedWastageItem={inventoryState.selectedWastageItem}
            selectedWastageBatch={inventoryState.selectedWastageBatch}
            openWastageModal={inventoryState.openWastageModal}
            closeWastageModal={inventoryState.closeWastageModal}
            deleteInventoryItem={inventoryState.deleteInventoryItem}
            deleteBatch={inventoryState.deleteBatch}
            updateBatchMetadata={inventoryState.updateBatchMetadata}
            logWastage={inventoryState.logWastage}
            selectedEditItem={inventoryState.selectedEditItem}
            isEditItemModalOpen={inventoryState.isEditItemModalOpen}
            openEditItemModal={inventoryState.openEditItemModal}
            closeEditItemModal={inventoryState.closeEditItemModal}
            updateInventoryItem={async (itemId, data) => {
              const res = await inventoryState.updateInventoryItem(itemId, data);
              await menuState.loadCategoriesAndMenuItems();
              return res;
            }}
            catalogCategories={menuState.categories}
            authToken={accessToken || undefined}
            restaurant={restaurant}
          />
        )}

        {/* Tab 7: Customer Services (Customer Directory & QR Codes) */}
        {activeTab === "customerservices" && (staffState.staffPermissions?.allowed_sidebar_tabs?.includes("customerservices") ?? true) && (
          <CustomerServicesTab
            restaurant={restaurant}
            authToken={accessToken || undefined}
            outletId={restaurant?.id}
          />
        )}

        {/* Tab 8: Restaurant Settings */}
        {activeTab === "settings" && (
          <SettingsTab
            restaurant={restaurant}
            menuItems={menuState.menuItems}
            restaurantForm={settingsState.restaurantForm}
            setRestaurantForm={settingsState.setRestaurantForm}
            isSavingRestaurant={settingsState.isSavingRestaurant}
            onSubmitRestaurantSettings={settingsState.onSubmitRestaurantSettings}
            accessToken={accessToken}
            setNotice={setNotice}
            setError={setError}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <AbandonedCartsPanel
        isOpen={sessionsState.showAbandonedCartsPanel}
        onClose={() => sessionsState.setShowAbandonedCartsPanel(false)}
        activeSessions={sessionsState.activeSessions}
        abandonedCarts={sessionsState.abandonedCarts}
        isLoadingCarts={sessionsState.isLoadingCarts}
        convertAbandonedCart={sessionsState.convertAbandonedCart}
        dismissAbandonedCart={sessionsState.dismissAbandonedCart}
        terminateSession={sessionsState.terminateSession}
        onAssistSession={(session) => setAssistTargetSession(session)}
      />

      <StaffAssistBasketModal
        isOpen={!!assistTargetSession}
        onClose={() => setAssistTargetSession(null)}
        session={assistTargetSession}
        menuItems={menuState.menuItems}
        authToken={accessToken || undefined}
        onSuccess={() => {
          setNotice(`Added items to Basket #${assistTargetSession?.basket_number} (${assistTargetSession?.customer_name})`);
          void sessionsState.fetchActiveSessions();
          void loadDashboard();
        }}
      />

      <CreateBillDrawer
        isOpen={billingState.createBillModalOpen}
        onClose={billingState.handleCloseCreateBillDrawer}
        inventoryItems={inventoryState.items}
        menuItems={menuState.menuItems}
        menuPage={menuState.menuPage}
        setMenuPage={menuState.setMenuPage}
        menuTotalPages={menuState.menuTotalPages}
        variantsByItem={menuState.variantsByItem}
        draftCartItems={billingState.draftCartItems}
        setDraftCartItems={billingState.setDraftCartItems}
        selectedTable={billingState.selectedTable}
        setSelectedTable={billingState.setSelectedTable}
        customerName={billingState.customerName}
        setCustomerName={billingState.setCustomerName}
        customerPhone={billingState.customerPhone}
        setCustomerPhone={billingState.setCustomerPhone}
        isWalkIn={billingState.isWalkIn}
        setIsWalkIn={billingState.setIsWalkIn}
        customerExtraDetail={billingState.customerExtraDetail}
        setCustomerExtraDetail={billingState.setCustomerExtraDetail}
        isInterstate={billingState.isInterstate}
        setIsInterstate={billingState.setIsInterstate}
        placeOfSupply={billingState.placeOfSupply}
        setPlaceOfSupply={billingState.setPlaceOfSupply}
        customerGstin={billingState.customerGstin}
        setCustomerGstin={billingState.setCustomerGstin}
        customerLegalName={billingState.customerLegalName}
        setCustomerLegalName={billingState.setCustomerLegalName}
        handleCreateBill={billingState.handleCreateBill}
        eveningPriceActive={restaurant?.evening_price_active ?? false}
        restaurant={restaurant}
        editingCompletedBill={billingState.editingCompletedBill}
        onQuickEditOffer={async (itemId, updates) => {

          try {
            const updated = await apiRequest<AdminMenuItem>(`/api/admin/menu-items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify(updates),
            });
            menuState.setMenuItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
            setNotice("Special offer updated");
          } catch (err: any) {
            setError(err.message || "Failed to quick-edit offer");
            throw err;
          }
        }}
      />

      <PaymentModal
        isOpen={billingState.paymentModalOpen}
        onClose={() => void billingState.handleDiscardPaymentBill()}
        onBackToDrawer={billingState.handleBackToDrawer}
        onKeepAsDraft={() => void billingState.handleKeepAsDraft()}
        onDiscardBill={() => void billingState.handleDiscardPaymentBill()}
        paymentTargetBill={billingState.paymentTargetBill}
        selectedPaymentMethod={billingState.selectedPaymentMethod}
        setSelectedPaymentMethod={billingState.setSelectedPaymentMethod}
        cashTendered={billingState.cashTendered}
        setCashTendered={billingState.setCashTendered}
        editingCompletedBill={billingState.editingCompletedBill}
        handleMarkPaid={billingState.handleMarkPaid}
        onOpenDiscountModal={billingState.openDiscountModal}
        restaurant={restaurant}
      />

      <DiscountModal
        isOpen={billingState.discountModalOpen}
        onClose={() => billingState.setDiscountModalOpen(false)}
        discountTargetBill={billingState.discountTargetBill}
        discountType={billingState.discountType}
        setDiscountType={billingState.setDiscountType}
        discountValue={billingState.discountValue}
        setDiscountValue={billingState.setDiscountValue}
        discountReason={billingState.discountReason}
        setDiscountReason={billingState.setDiscountReason}
        staffPermissions={staffState.staffPermissions}
        handleApplyDiscount={billingState.handleApplyDiscount}
      />

      <VariantModal
        isOpen={menuState.isVariantModalOpen}
        onClose={menuState.closeVariantModal}
        selectedVariantItemId={menuState.selectedItemForVariants?.id || null}
        menuItems={menuState.menuItems}
        variantsByItem={menuState.variantsByItem}
        variantForm={{ name: "", price_delta: "0.00", is_available: true }}
        setVariantForm={() => { }}
        editingVariantId={null}
        setEditingVariantId={() => { }}
        isSavingVariant={false}
        onSubmitVariant={(e) => e.preventDefault()}
        onToggleVariantAvailable={async () => { }}
        onDeleteVariant={async (id) => {
          if (menuState.selectedItemForVariants) {
            await menuState.handleDeleteVariant(menuState.selectedItemForVariants.id, id);
          }
        }}
      />

      <OfferModal
        isOpen={menuState.isOfferModalOpen}
        onClose={menuState.closeOfferModal}
        selectedOfferItemId={menuState.selectedItemForOffer?.id || null}
        menuItems={menuState.menuItems}
        offerForm={menuState.offerForm}
        setOfferForm={menuState.setOfferForm}
        isSavingOffer={menuState.isSavingOffer}
        onSubmitOffer={menuState.handleSaveOffer}
      />

      <StaffModal
        isOpen={staffState.staffModalOpen}
        onClose={() => staffState.setStaffModalOpen(false)}
        editingStaffId={staffState.editingStaffId}
        staffFormState={staffState.staffFormState}
        setStaffFormState={staffState.setStaffFormState}
        isSavingStaff={staffState.isSavingStaff}
        onSubmitStaffMember={staffState.onSubmitStaffMember}
        currentUserRole={userRole}
      />

      <PinModal
        isOpen={staffState.pinModalOpen}
        onClose={() => staffState.setPinModalOpen(false)}
        pinTargetStaff={staffState.pinTargetStaff}
        pinInput={staffState.pinInput}
        setPinInput={staffState.setPinInput}
        isSavingPin={staffState.isSavingPin}
        onSubmitSetStaffPin={staffState.onSubmitSetStaffPin}
      />

      <PinSwitchModal
        isOpen={staffState.pinSwitchModalOpen}
        onClose={() => staffState.setPinSwitchModalOpen(false)}
        staffList={staffState.staffList}
        pinSwitchStaffId={staffState.pinSwitchStaffId}
        setPinSwitchStaffId={staffState.setPinSwitchStaffId}
        pinSwitchInput={staffState.pinSwitchInput}
        setPinSwitchInput={staffState.setPinSwitchInput}
        isSwitchingPin={staffState.isSwitchingPin}
        onSubmitPinQuickSwitch={staffState.onSubmitPinQuickSwitch}
      />

      {/* Top-Right Notification Bell Panel */}
      <NotificationPanel
        isOpen={notificationState.isNotificationPanelOpen}
        onClose={() => notificationState.setIsNotificationPanelOpen(false)}
        notifications={notificationState.notifications}
        unreadCount={notificationState.unreadCount}
        thresholdDays={notificationState.thresholdDays}
        onRefresh={() => void notificationState.fetchNotifications()}
        onMarkRead={notificationState.handleMarkRead}
      />

      {/* Mandatory Shift Punch-In Modal for Cashiers */}
      <PunchInModal
        isOpen={punchState.punchInModalOpen}
        activeStaff={staffState.activeStaff}
        userRole={userRole}
        isPunchingIn={punchState.isPunchingIn}
        onPunchIn={punchState.handlePunchIn}
        onSwitchUser={() => {
          punchState.setPunchInModalOpen(false);
          void staffState.loadStaffMembers();
          staffState.setPinSwitchModalOpen(true);
        }}
        onLogout={logout}
      />

      {/* Shift Punch-Out Confirmation Modal */}
      <PunchOutModal
        isOpen={punchState.punchOutModalOpen}
        onClose={() => punchState.setPunchOutModalOpen(false)}
        activeStaff={staffState.activeStaff}
        punchInAt={punchState.punchStatus?.punch_in_at}
        elapsedSeconds={punchState.liveShiftSeconds}
        isPunchingOut={punchState.isPunchingOut}
        onConfirmPunchOut={punchState.handlePunchOut}
      />
    </div>
  );
}
