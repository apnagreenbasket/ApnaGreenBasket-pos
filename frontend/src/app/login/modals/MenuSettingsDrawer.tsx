/**
 * MenuSettingsDrawer — slide-over drawer with two tabs:
 *   1. Bulk Price Setting (inline BulkPriceModal)
 *   2. Catalogue Print (CataloguePrintTab)
 */

"use client";

import React, { useState } from "react";
import { X, DollarSign, FileText } from "lucide-react";
import type { AdminMenuItem, AdminCategory, RestaurantProfile } from "../adminTypes";
import { BulkPriceModal } from "../modals/BulkPriceModal";
import { CataloguePrintTab } from "../components/CataloguePrintTab";
import type { OutletPrintHeader } from "../components/catalogue/templates/templateRegistry";

interface MenuSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  categories: AdminCategory[];
  menuItems: AdminMenuItem[];
  restaurant: RestaurantProfile | null;
  onSaveBatchItems: (updates: { id: string; name: string; mrp: string; price: string; evening_price: string }[]) => Promise<void>;
  onRestaurantUpdate?: (r: RestaurantProfile) => void;
}

type SettingsTab = "bulk-price" | "catalogue";

export function MenuSettingsDrawer({
  isOpen,
  onClose,
  categories,
  menuItems,
  restaurant,
  onSaveBatchItems,
  onRestaurantUpdate,
}: MenuSettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("bulk-price");

  if (!isOpen) return null;

  const outletInfo: OutletPrintHeader = {
    name: restaurant?.name || "My Store",
    logo_url: restaurant?.logo_url || undefined,
    address: restaurant?.address || undefined,
    phone: restaurant?.phone || undefined,
    gstin: restaurant?.gstin || undefined,
    fssai_no: restaurant?.fssai_no || undefined,
    bill_qr_url: restaurant?.bill_qr_url || undefined,
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "bulk-price", label: "Bulk Price Setting", icon: <DollarSign className="h-3.5 w-3.5" /> },
    { id: "catalogue", label: "Catalogue Print", icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[640px] bg-[var(--bg-base)] border-l border-[var(--border-strong)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Catalog Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-subtle)] px-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition ${
                activeTab === tab.id
                  ? "border-[var(--accent-brand)] text-[var(--accent-brand)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "bulk-price" && (
            <BulkPriceModal
              isOpen={true}
              onClose={onClose}
              menuItems={menuItems}
              categories={categories}
              onSaveBatch={onSaveBatchItems}
              inline={true}
              restaurant={restaurant}
              onRestaurantUpdate={onRestaurantUpdate}
            />
          )}

          {activeTab === "catalogue" && (
            <CataloguePrintTab
              menuItems={menuItems}
              categories={categories}
              outletInfo={outletInfo}
            />
          )}
        </div>
      </div>
    </>
  );
}
