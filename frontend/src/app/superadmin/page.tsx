/**
 * SuperadminPage — Main orchestrator for Multi-Outlet Platform Administration.
 *
 * Coordinates platform directory, tenant provisioning wizard, and store settings.
 */

"use client";

import { Search, Store } from "lucide-react";
import { parseUTCDate } from "@/lib/api";
import { useSuperadminData } from "./hooks/useSuperadminData";
import { SuperadminLoginForm } from "./components/SuperadminLoginForm";
import { SuperadminHeader } from "./components/SuperadminHeader";
import { ToastNotification } from "../components/ToastNotification";
import { CreateOutletWizard } from "./components/CreateOutletWizard";
import { OutletCard } from "./components/OutletCard";
import { EditOutletModal } from "./components/EditOutletModal";
import { ConfirmDeleteModal } from "./components/ConfirmDeleteModal";

function formatDateTime(value: string): string {
  const parsed = parseUTCDate(value);
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SuperadminPage() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    accessToken,
    isMounted,
    isAuthenticating,
    error,
    setError,
    notice,
    setNotice,
    theme,
    toggleTheme,
    restaurants,
    isLoadingRestaurants,
    searchQuery,
    setSearchQuery,
    expandedIds,
    toggleExpand,
    copiedId,
    copyToClipboard,
    staffByOutlet,
    restaurantForm,
    setRestaurantForm,
    isCreatingRestaurant,
    settingsOutlet,
    setSettingsOutlet,
    settingsForm,
    setSettingsForm,
    isSavingSettings,
    adminUserForm,
    setAdminUserForm,
    selectedRestaurantId,
    setSelectedRestaurantId,
    isCreatingUser,
    step,
    setStep,
    filteredRestaurants,
    onLogin,
    onImpersonateOutlet,
    onLogout,
    loadRestaurants,
    onCreateRestaurant,
    openOutletSettings,
    onSaveOutletSettings,
    onCreateAdminUser,
    onActivateUser,
    onDeactivateUser,
    deleteRestaurant,
    deleteUser,
    deleteTarget,
    setDeleteTarget,
    isDeletingEntity,
    executeConfirmedDelete,
    startAddUserForRestaurant,
    autoSlug,
  } = useSuperadminData();

  // Wait until mounted on client before rendering to prevent SSR hydration mismatch
  if (!isMounted) return null;

  // Pre-auth: Superadmin Sign In
  if (!accessToken) {
    return (
      <SuperadminLoginForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        isAuthenticating={isAuthenticating}
        theme={theme}
        toggleTheme={toggleTheme}
        error={error}
        notice={notice}
        setNotice={setNotice}
        setError={setError}
        onLogin={onLogin}
      />
    );
  }

  // Post-auth: Superadmin Console
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <SuperadminHeader
        theme={theme}
        toggleTheme={toggleTheme}
        isLoadingRestaurants={isLoadingRestaurants}
        onRefresh={() => void loadRestaurants()}
        onLogout={() => void onLogout()}
      />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {/* Action Stepper / Creator Widget */}
        <CreateOutletWizard
          step={step}
          setStep={setStep}
          restaurantForm={restaurantForm}
          setRestaurantForm={setRestaurantForm}
          isCreatingRestaurant={isCreatingRestaurant}
          onCreateRestaurant={onCreateRestaurant}
          restaurants={restaurants}
          selectedRestaurantId={selectedRestaurantId}
          setSelectedRestaurantId={setSelectedRestaurantId}
          adminUserForm={adminUserForm}
          setAdminUserForm={setAdminUserForm}
          isCreatingUser={isCreatingUser}
          onCreateAdminUser={onCreateAdminUser}
          autoSlug={autoSlug}
        />

        {/* Directory Section */}
        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                Onboarded Outlets Directory
              </h2>
              <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
                Viewing {filteredRestaurants.length} of {restaurants.length} total outlets along with their assigned admins and staff.
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative flex items-center w-full sm:w-auto sm:min-w-[260px]">
              <Search className="absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search outlet or user email..."
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-4 text-xs focus:border-[var(--accent-brand)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoadingRestaurants && restaurants.length === 0 && (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-40 w-full animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                />
              ))}
            </div>
          )}

          {/* Empty Directory */}
          {!isLoadingRestaurants && filteredRestaurants.length === 0 && (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center">
              <Store className="mx-auto h-12 w-12 text-[var(--text-muted)] mb-3" />
              <h3 className="font-display text-lg font-bold">No Outlets Found</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {searchQuery ? `No outlets match "${searchQuery}"` : "Get started by onboarding your first outlet above."}
              </p>
            </div>
          )}

          {/* Directory Restaurant Cards */}
          <div className="space-y-4">
            {filteredRestaurants.map((r) => (
              <OutletCard
                key={r.id}
                outlet={r}
                isExpanded={expandedIds.has(r.id)}
                copiedId={copiedId}
                staffList={staffByOutlet[r.id] || []}
                onToggleExpand={() => toggleExpand(r.id)}
                onCopyId={(id) => copyToClipboard(id, id)}
                onOpenSettings={(outlet) => openOutletSettings(outlet)}
                onImpersonateOutlet={onImpersonateOutlet}
                onAddUser={(id) => startAddUserForRestaurant(id)}
                onDeleteRestaurant={(id, name) => void deleteRestaurant(id, name)}
                onDeleteUser={(id, userEmail) => void deleteUser(id, userEmail)}
                onActivateUser={(id, userEmail) => void onActivateUser(id, userEmail)}
                onDeactivateUser={(id, userEmail) => void onDeactivateUser(id, userEmail)}
                formatDateTime={formatDateTime}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Outlet Settings Modal */}
      <EditOutletModal
        settingsOutlet={settingsOutlet}
        onClose={() => setSettingsOutlet(null)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        isSavingSettings={isSavingSettings}
        onSaveOutletSettings={onSaveOutletSettings}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void executeConfirmedDelete()}
        title={deleteTarget?.type === "OUTLET" ? "Delete Outlet" : "Delete User Account"}
        itemName={deleteTarget?.name}
        message={
          deleteTarget?.type === "OUTLET"
            ? `Are you sure you want to delete "${deleteTarget.name}"? This will permanently delete this outlet, all categories, products, variants, orders, and associated user accounts!`
            : `Are you sure you want to permanently delete deactivated user account "${deleteTarget?.name}"? This action cannot be undone.`
        }
        isDeleting={isDeletingEntity}
      />

      <ToastNotification 
        notice={notice} 
        error={error} 
        clear={() => { setNotice(null); setError(null); }} 
      />
    </div>
  );
}
