"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Boxes,
  Edit,
  Filter,
  Image as ImageIcon,
  Layers,
  Moon,
  Percent,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  AdminCategory,
  AdminMenuItem,
  AdminVariant,
  MenuItemFormState,
  RestaurantProfile,
} from "../adminTypes";

export type MenuSortOption =
  | "recent"
  | "oldest"
  | "alpha_asc"
  | "alpha_desc"
  | "price_asc"
  | "price_desc"
  | "discount_desc"
  | "available_first"
  | "popular_desc";

export type MenuAvailabilityFilter =
  | "ALL"
  | "IN_STOCK"
  | "OUT_OF_STOCK"
  | "UNAVAILABLE"
  | "OFFERS"
  | "EVENING_PRICE";
import { MenuSettingsDrawer } from "../modals/MenuSettingsDrawer";
import { BulkOperationsMenu } from "../components/BulkOperationsMenu";
import { resolveImageUrl } from "@/lib/api";
import { uploadImageFile } from "../adminUtils";

interface MenuTabProps {
  categories: AdminCategory[];
  menuItems: AdminMenuItem[];
  menuPage?: number;
  setMenuPage?: (p: number | ((prev: number) => number)) => void;
  menuTotalPages?: number;
  menuTotal?: number;
  variantsByItem: Record<string, AdminVariant[]>;
  selectedCategory: string;
  setSelectedCategory: (catId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSaveItem: (itemId: string | null, data: MenuItemFormState) => Promise<void>;
  onSaveBatchItems?: (updates: { id: string; name: string; mrp: string; price: string; evening_price: string }[]) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => Promise<void>;
  onOpenVariantModal: (item: AdminMenuItem) => void;
  onOpenOfferModal: (item: AdminMenuItem) => void;
  onCreateCategory?: (name: string) => Promise<any>;
  onDeleteCategory?: (catId: string) => Promise<void>;
  inventoryItems?: {
    id: string;
    name: string;
    barcode?: string | null;
    current_stock?: number | string | null;
    unit?: string;
  }[];
  restaurant?: RestaurantProfile | null;
  onRestaurantUpdate?: (r: RestaurantProfile) => void;
  authToken?: string;
}

export function MenuTab({
  categories,
  menuItems,
  menuPage = 1,
  setMenuPage,
  menuTotalPages = 1,
  menuTotal = 0,
  variantsByItem,
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  onSaveItem,
  onSaveBatchItems,
  onDeleteItem,
  onToggleAvailability,
  onOpenVariantModal,
  onOpenOfferModal,
  onCreateCategory,
  onDeleteCategory,
  inventoryItems,
  restaurant,
  onRestaurantUpdate,
  authToken,
}: MenuTabProps) {
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminMenuItem | null>(null);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

  const [localPage, setLocalPage] = useState(1);
  const itemsPerPage = 52;

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [isSubmittingCat, setIsSubmittingCat] = useState(false);

  // Delete Warning Confirmation States
  const [itemPendingDelete, setItemPendingDelete] = useState<AdminMenuItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const [catPendingDelete, setCatPendingDelete] = useState<AdminCategory | null>(null);
  const [isDeletingCat, setIsDeletingCat] = useState(false);

  const handleConfirmDeleteItem = async () => {
    if (!itemPendingDelete) return;
    setIsDeletingItem(true);
    try {
      await onDeleteItem(itemPendingDelete.id);
      setItemPendingDelete(null);
      if (editingItem?.id === itemPendingDelete.id) {
        setIsItemModalOpen(false);
        setEditingItem(null);
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!catPendingDelete || !onDeleteCategory) return;
    setIsDeletingCat(true);
    try {
      await onDeleteCategory(catPendingDelete.id);
      setCatPendingDelete(null);
    } catch (err) {
      console.error("Failed to delete category:", err);
    } finally {
      setIsDeletingCat(false);
    }
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim() || !onCreateCategory) return;
    try {
      setIsSubmittingCat(true);
      await onCreateCategory(newCatName.trim());
      setNewCatName("");
      setIsCategoryModalOpen(false);
    } catch {
      /* handled in hook */
    } finally {
      setIsSubmittingCat(false);
    }
  };

  const [formData, setFormData] = useState<MenuItemFormState>({
    category_id: categories[0]?.id || "",
    inventory_item_id: null,
    name: "",
    barcode: "",
    price: "",
    description: "",
    is_available: true,
    is_on_offer: false,
    is_verification_required: false,
    offer_price: "",
    offer_label: "",
    mrp: "",
    tax_category: "GST 0%",
    tax_rate: "0",
    hsn_code: "",
    pricing_mode: "FIXED_UNIT",
    unit_label: "piece",
    alternate_units: [],
    allow_oversell: true,
  });

  const [modalError, setModalError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Inline Category Creation & Custom Tax state
  const [showInlineCatInput, setShowInlineCatInput] = useState(false);
  const [inlineCatName, setInlineCatName] = useState("");
  const [isCreatingInlineCat, setIsCreatingInlineCat] = useState(false);
  const [isCustomTax, setIsCustomTax] = useState(false);

  const handleInlineCategoryCreate = async () => {
    if (!inlineCatName.trim() || !onCreateCategory) return;
    try {
      setIsCreatingInlineCat(true);
      const created = await onCreateCategory(inlineCatName.trim());
      setInlineCatName("");
      setShowInlineCatInput(false);
      if (created?.id) {
        setFormData((prev) => ({ ...prev, category_id: created.id }));
      }
    } catch (err: any) {
      setModalError(err?.message || "Failed to create category");
    } finally {
      setIsCreatingInlineCat(false);
    }
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingImage(true);
      setModalError(null);
      const url = await uploadImageFile(file);
      setFormData((prev) => ({ ...prev, image_url: url }));
    } catch (err: any) {
      setModalError(err.message || "Failed to upload image photo.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setModalError(null);
    setShowInlineCatInput(false);
    setInlineCatName("");
    setIsCustomTax(false);
    setFormData({
      category_id: selectedCategory !== "ALL" ? selectedCategory : (categories[0]?.id || ""),
      inventory_item_id: null,
      name: "",
      barcode: "",
      image_url: "",
      price: "",
      wholesale_price: "",
      evening_price: "",
      description: "",
      is_available: true,
      is_on_offer: false,
      is_verification_required: false,
      offer_price: "",
      offer_label: "",
      mrp: "",
      tax_category: "GST 0%",
      tax_rate: "0",
      hsn_code: "",
      pricing_mode: "FIXED_UNIT",
      unit_label: "piece",
      alternate_units: [],
      allow_oversell: true,
    });
    setIsItemModalOpen(true);
  };

  const openEditModal = (item: AdminMenuItem) => {
    setEditingItem(item);
    setModalError(null);
    setShowInlineCatInput(false);
    setInlineCatName("");
    const isCustom = !!item.tax_category && !["GST 0%", "GST 5%", "GST 12%", "GST 18%", "GST 28%"].includes(item.tax_category);
    setIsCustomTax(isCustom);
    setFormData({
      category_id: item.category_id,
      inventory_item_id: item.inventory_item_id || null,
      name: item.name,
      barcode: item.barcode || "",
      image_url: item.image_url || "",
      price: item.price,
      wholesale_price: item.wholesale_price ? String(item.wholesale_price) : "",
      evening_price: item.evening_price ? String(item.evening_price) : "",
      description: item.description || "",
      is_available: item.is_available,
      is_on_offer: !!item.is_on_offer,
      is_verification_required: !!item.is_verification_required,
      offer_price: item.offer_price || "",
      offer_label: item.offer_label || "",
      mrp: item.mrp || "",
      tax_category: item.tax_category || "GST 0%",
      tax_rate: String(item.tax_rate ?? 0),
      hsn_code: item.hsn_code || "",
      pricing_mode: item.pricing_mode || "FIXED_UNIT",
      unit_label: item.unit_label || "piece",
      alternate_units: (item.alternate_units as any) || [],
      allow_oversell: item.allow_oversell ?? true,
    });
    setIsItemModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const priceNum = parseFloat(formData.price) || 0;
    const eveningPriceNum = formData.evening_price ? parseFloat(formData.evening_price) : null;
    const isEveningActive = restaurant?.evening_price_active ?? false;
    const effectivePriceNum = (isEveningActive && eveningPriceNum !== null && !isNaN(eveningPriceNum) && eveningPriceNum > 0)
      ? eveningPriceNum
      : priceNum;
    const mrpNum = formData.mrp ? parseFloat(formData.mrp) : null;

    if (!formData.category_id || formData.category_id.trim() === "") {
      setModalError("Please select a valid Category. If no categories exist, click '+ Category' to create one first.");
      return;
    }

    if (mrpNum !== null && !isNaN(mrpNum) && mrpNum > 0 && mrpNum < effectivePriceNum) {
      setModalError(`MRP (₹${mrpNum.toFixed(2)}) cannot be smaller than effective Selling Price (₹${effectivePriceNum.toFixed(2)}). MRP must be greater than or equal to Selling Price.`);
      return;
    }

    try {
      await onSaveItem(editingItem ? editingItem.id : null, formData);
      setIsItemModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || "Failed to save product.");
    }
  };

  const [sortOption, setSortOption] = useState<MenuSortOption>("recent");
  const [availabilityFilter, setAvailabilityFilter] = useState<MenuAvailabilityFilter>("ALL");

  const isEveningActive = restaurant?.evening_price_active ?? false;

  useEffect(() => {
    if (!isEveningActive && availabilityFilter === "EVENING_PRICE") {
      setAvailabilityFilter("ALL");
    }
  }, [isEveningActive, availabilityFilter]);

  const inventoryMap = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; barcode?: string | null; current_stock?: number | string | null; unit?: string }
    >();
    if (inventoryItems) {
      for (const inv of inventoryItems) {
        map.set(inv.id, inv);
      }
    }
    return map;
  }, [inventoryItems]);

  const getItemStockInfo = useCallback(
    (item: AdminMenuItem) => {
      const hasLinkedInventory = Boolean(item.inventory_item_id);
      if (!hasLinkedInventory) {
        return {
          hasLinkedInventory: false,
          stockVal: null,
          isOutOfStock: false,
        };
      }

      const linkedInv = item.inventory_item_id ? inventoryMap.get(item.inventory_item_id) : undefined;
      const rawStock = linkedInv?.current_stock !== undefined ? linkedInv.current_stock : item.current_stock;
      const stockVal =
        rawStock !== undefined && rawStock !== null && rawStock !== ""
          ? parseFloat(String(rawStock))
          : null;

      // Out of stock if stockVal is <= 0 (zero or negative / deficit), or item.is_out_of_stock is true
      const isOutOfStock =
        (stockVal !== null && !isNaN(stockVal) && stockVal <= 0) || Boolean(item.is_out_of_stock);

      return {
        hasLinkedInventory: true,
        stockVal,
        isOutOfStock,
      };
    },
    [inventoryMap]
  );

  const catalogCounts = useMemo(() => {
    const scopeItems = menuItems.filter(
      (item) => selectedCategory === "ALL" || item.category_id === selectedCategory
    );
    let inStock = 0;
    let outOfStock = 0;
    let unavailable = 0;
    let specialOffers = 0;
    let eveningPriceSupported = 0;

    scopeItems.forEach((item) => {
      const stockInfo = getItemStockInfo(item);

      if (!item.is_available) {
        unavailable++;
      } else if (stockInfo.hasLinkedInventory && stockInfo.isOutOfStock) {
        outOfStock++;
      } else {
        inStock++;
      }

      if (item.is_on_offer) {
        specialOffers++;
      }

      const evePrice = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
      if (evePrice > 0) {
        eveningPriceSupported++;
      }
    });

    return {
      all: scopeItems.length,
      inStock,
      outOfStock,
      unavailable,
      specialOffers,
      eveningPriceSupported,
    };
  }, [menuItems, selectedCategory, getItemStockInfo]);

  const filteredAndSortedItems = useMemo(() => {
    let list = menuItems.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat =
        selectedCategory === "ALL" || item.category_id === selectedCategory;
      return matchesSearch && matchesCat;
    });

    // Quick Filter Toggles
    if (availabilityFilter === "IN_STOCK") {
      list = list.filter((item) => {
        if (!item.is_available) return false;
        const stockInfo = getItemStockInfo(item);
        return !stockInfo.hasLinkedInventory || !stockInfo.isOutOfStock;
      });
    } else if (availabilityFilter === "OUT_OF_STOCK") {
      list = list.filter((item) => {
        const stockInfo = getItemStockInfo(item);
        return stockInfo.hasLinkedInventory && stockInfo.isOutOfStock;
      });
    } else if (availabilityFilter === "UNAVAILABLE") {
      list = list.filter((item) => !item.is_available);
    } else if (availabilityFilter === "OFFERS") {
      list = list.filter((item) => !!item.is_on_offer);
    } else if (availabilityFilter === "EVENING_PRICE") {
      list = list.filter((item) => {
        const eve = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
        return eve > 0;
      });
    }

    list.sort((a, b) => {
      switch (sortOption) {
        case "recent": {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tB - tA;
        }
        case "oldest": {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tA - tB;
        }
        case "alpha_asc":
          return (a.name || "").localeCompare(b.name || "");
        case "alpha_desc":
          return (b.name || "").localeCompare(a.name || "");
        case "price_asc": {
          const isEveningActive = restaurant?.evening_price_active ?? false;
          const getEffectivePrice = (item: AdminMenuItem) => {
            const raw = parseFloat(item.price) || 0;
            const eve = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
            return isEveningActive && eve > 0 ? eve : raw;
          };
          return getEffectivePrice(a) - getEffectivePrice(b);
        }
        case "price_desc": {
          const isEveningActive = restaurant?.evening_price_active ?? false;
          const getEffectivePrice = (item: AdminMenuItem) => {
            const raw = parseFloat(item.price) || 0;
            const eve = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
            return isEveningActive && eve > 0 ? eve : raw;
          };
          return getEffectivePrice(b) - getEffectivePrice(a);
        }
        case "discount_desc": {
          const getDiscountPct = (item: AdminMenuItem) => {
            const mrp = item.mrp ? parseFloat(item.mrp) : 0;
            const price = parseFloat(item.price) || 0;
            if (mrp > price && mrp > 0) {
              return ((mrp - price) / mrp) * 100;
            }
            return 0;
          };
          return getDiscountPct(b) - getDiscountPct(a);
        }
        case "available_first": {
          if (a.is_available === b.is_available) return 0;
          return a.is_available ? -1 : 1;
        }
        case "popular_desc": {
          return (b.total_sold || 0) - (a.total_sold || 0);
        }
        default:
          return 0;
      }
    });

    return list;
  }, [menuItems, searchQuery, selectedCategory, availabilityFilter, sortOption, restaurant?.evening_price_active, getItemStockInfo]);

  const localTotalPages = Math.ceil(filteredAndSortedItems.length / itemsPerPage) || 1;
  const filteredItems = filteredAndSortedItems.slice((localPage - 1) * itemsPerPage, localPage * itemsPerPage);

  useEffect(() => {
    setLocalPage(1);
  }, [searchQuery, selectedCategory, availabilityFilter, sortOption]);

  return (
    <div className="space-y-4">
      {/* Category Pills & Actions Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`flex-shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
              selectedCategory === "ALL"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            All Products ({menuItems.length})
          </button>
          {categories.map((c) => {
            const isSelected = selectedCategory === c.id;
            return (
              <div
                key={c.id}
                className={`group flex-shrink-0 inline-flex items-center rounded-xl transition ${
                  isSelected
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategory(c.id)}
                  className="px-3.5 py-1.5 text-xs font-bold cursor-pointer"
                >
                  {c.name}
                </button>
                {onDeleteCategory && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCatPendingDelete(c);
                    }}
                    className={`pr-2 py-1.5 text-xs transition cursor-pointer ${
                      isSelected
                        ? "text-[var(--text-on-accent)]/70 hover:text-[var(--text-on-accent)]"
                        : "opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-rose-500"
                    }`}
                    title={`Delete category "${c.name}"`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search items or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition cursor-pointer"
          >
            <Tag className="h-4 w-4 text-[var(--accent-brand)]" />
            + Category
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-1.5 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>

          <BulkOperationsMenu entity="menu-items" authToken={authToken} />

          <button
            type="button"
            onClick={() => setIsSettingsDrawerOpen(true)}
            className="p-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent-brand)] hover:text-[var(--accent-brand)] transition cursor-pointer"
            title="Catalog Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Option B: Dedicated Filter & Sort Sub-Strip */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/60 shadow-sm">
        {/* Left side: Live product counter + Quick filter toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 pr-2.5 border-r border-[var(--border-subtle)]">
            <Boxes className="h-4 w-4 text-[var(--accent-brand)]" />
            <span className="font-display font-bold text-xs text-[var(--text-primary)]">
              {filteredItems.length} {filteredItems.length === 1 ? "Product" : "Products"}
            </span>
          </div>

          {/* Quick Filter Toggles */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAvailabilityFilter("ALL")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                availabilityFilter === "ALL"
                  ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-sm"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]"
              }`}
            >
              All ({catalogCounts.all})
            </button>

            <button
              type="button"
              onClick={() => setAvailabilityFilter("IN_STOCK")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                availabilityFilter === "IN_STOCK"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-[var(--bg-surface)] text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              In Stock ({catalogCounts.inStock})
            </button>

            <button
              type="button"
              onClick={() => setAvailabilityFilter("OFFERS")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                availabilityFilter === "OFFERS"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-[var(--bg-surface)] text-purple-400 hover:bg-purple-500/10 border border-purple-500/20"
              }`}
            >
              <Sparkles className="h-3 w-3" />
              Special Offers ({catalogCounts.specialOffers})
            </button>

            {isEveningActive && (
              <button
                type="button"
                onClick={() => setAvailabilityFilter("EVENING_PRICE")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  availabilityFilter === "EVENING_PRICE"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-[var(--bg-surface)] text-amber-400 hover:bg-amber-500/10 border border-amber-500/20"
                }`}
              >
                <Moon className="h-3 w-3" />
                Evening Price Items ({catalogCounts.eveningPriceSupported})
              </button>
            )}

            {/* Out of Stock (linked inventory item stock <= 0 or deficit) */}
            {(catalogCounts.outOfStock > 0 || availabilityFilter === "OUT_OF_STOCK") && (
              <button
                type="button"
                onClick={() =>
                  setAvailabilityFilter(availabilityFilter === "OUT_OF_STOCK" ? "ALL" : "OUT_OF_STOCK")
                }
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  availabilityFilter === "OUT_OF_STOCK"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-[var(--bg-surface)] text-amber-400 hover:bg-amber-500/10 border border-amber-500/20"
                }`}
              >
                <Boxes className="h-3 w-3" />
                Out of Stock ({catalogCounts.outOfStock})
              </button>
            )}

            {/* Unavailable (marked unavailable in catalog) */}
            {(catalogCounts.unavailable > 0 || availabilityFilter === "UNAVAILABLE") && (
              <button
                type="button"
                onClick={() =>
                  setAvailabilityFilter(availabilityFilter === "UNAVAILABLE" ? "ALL" : "UNAVAILABLE")
                }
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  availabilityFilter === "UNAVAILABLE"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-[var(--bg-surface)] text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                Unavailable ({catalogCounts.unavailable})
              </button>
            )}
          </div>
        </div>

        {/* Right side: Prominent Sort By selector */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 shadow-sm hover:border-[var(--accent-brand)] transition">
            <ArrowUpDown className="h-3.5 w-3.5 text-[var(--accent-brand)] flex-shrink-0" />
            <span className="text-[11px] text-[var(--text-muted)] font-semibold whitespace-nowrap">
              Sort By:
            </span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as MenuSortOption)}
              className="bg-transparent text-xs font-bold text-[var(--text-primary)] focus:outline-none cursor-pointer pr-1"
            >
              <option value="recent">Most Recent (Default)</option>
              <option value="oldest">Oldest Added</option>
              <option value="alpha_asc">Product Name: A → Z</option>
              <option value="alpha_desc">Product Name: Z → A</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="discount_desc">Highest Discount %</option>
              <option value="available_first">Available First</option>
              <option value="popular_desc">Most Popular / Sold</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Cards Grid / Empty State */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-12 text-center">
          <div className="rounded-full bg-[var(--accent-brand)]/10 p-4 text-[var(--accent-brand)] mb-3">
            <Sparkles className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">No products in catalog</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-sm">
            Your catalog is currently empty. Click the <span className="font-semibold text-[var(--accent-brand)]">+ Add Item</span> button above to create your first product.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition"
          >
            <Plus className="h-4 w-4" />
            Add First Product
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => {
            const variants = variantsByItem[item.id] || [];
            const mrpVal = item.mrp ? parseFloat(item.mrp) : 0;
            const rawPriceVal = parseFloat(item.price) || 0;
            const eveningPriceVal = item.evening_price ? parseFloat(String(item.evening_price)) : 0;
            const isEveningActive = restaurant?.evening_price_active ?? false;
            const priceVal = (isEveningActive && eveningPriceVal > 0) ? eveningPriceVal : rawPriceVal;
            const hasDiscount = mrpVal > priceVal;
            const discPercent = hasDiscount ? Math.round(((mrpVal - priceVal) / mrpVal) * 100) : 0;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 hover:border-[var(--accent-brand)] transition"
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail Image */}
                  <div className="h-12 w-12 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img
                        src={resolveImageUrl(item.image_url)}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-[var(--text-muted)] opacity-50" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                        <span className="truncate">{item.name}</span>
                      </h4>
                      <div className="text-right shrink-0">
                        {hasDiscount && (
                          <span className="line-through text-xs text-[var(--text-muted)] font-mono block">
                            ₹{mrpVal.toFixed(2)}
                          </span>
                        )}
                        <span className="font-mono text-sm font-bold text-[var(--text-primary)] flex items-center gap-1 justify-end">
                          {isEveningActive && eveningPriceVal > 0 && (
                            <span title={`Evening Price Active: ₹${eveningPriceVal.toFixed(2)}`}>
                              <Moon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/20 shrink-0 cursor-pointer" />
                            </span>
                          )}
                          ₹{priceVal.toFixed(2)}
                        </span>
                        {item.pricing_mode === "WEIGHT_BASED" && (
                          <span className="text-[10px] text-[var(--text-muted)] block">
                            per {item.unit_label || "kg"}
                          </span>
                        )}
                      </div>
                    </div>

                    {item.barcode && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-brand)] mt-0.5">
                        <Barcode className="h-3 w-3" />
                        {item.barcode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {(() => {
                    const stockInfo = getItemStockInfo(item);
                    if (!item.is_available) {
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => onToggleAvailability(item.id, true)}
                            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold transition bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 cursor-pointer"
                            title="Marked unavailable in catalog. Click to make available."
                          >
                            Unavailable
                          </button>
                          {stockInfo.hasLinkedInventory && stockInfo.isOutOfStock && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30"
                              title={`Out of stock in inventory (${stockInfo.stockVal ?? 0})`}
                            >
                              Out of Stock{stockInfo.stockVal !== null && stockInfo.stockVal < 0 ? ` (${stockInfo.stockVal})` : ""}
                            </span>
                          )}
                        </>
                      );
                    }

                    if (stockInfo.hasLinkedInventory && stockInfo.isOutOfStock) {
                      return (
                        <button
                          type="button"
                          onClick={() => onToggleAvailability(item.id, false)}
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold transition bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 cursor-pointer"
                          title={`Out of stock in inventory (${stockInfo.stockVal ?? 0}). Click to mark unavailable in catalog.`}
                        >
                          Out of Stock{stockInfo.stockVal !== null && stockInfo.stockVal < 0 ? ` (${stockInfo.stockVal})` : ""}
                        </button>
                      );
                    }

                    return (
                      <button
                        type="button"
                        onClick={() => onToggleAvailability(item.id, false)}
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold transition bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="In Stock. Click to mark unavailable in catalog."
                      >
                        In Stock
                      </button>
                    );
                  })()}

                  {hasDiscount && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20">
                      🏷️ {discPercent}% OFF
                    </span>
                  )}

                  {item.inventory_item_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                      Direct 1:1 Stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-bold text-gray-400 border border-gray-500/30">
                      Recipe / Auto Match
                    </span>
                  )}

                  {item.tax_category && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                      {item.tax_category}
                    </span>
                  )}

                  {item.hsn_code && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300 border border-amber-500/30">
                      HSN: {item.hsn_code}
                    </span>
                  )}

                  {item.is_verification_required && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                      <ShieldAlert className="h-3 w-3" />
                      Anti-Theft Verified
                    </span>
                  )}

                  {item.is_on_offer && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">
                      <Sparkles className="h-3 w-3" />
                      Offer: ₹{item.offer_price}
                    </span>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenVariantModal(item)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--accent-brand)] transition"
                      title="Manage Variants"
                    >
                      <Layers className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenOfferModal(item)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-purple-400 transition"
                      title="Special Offer"
                    >
                      <Percent className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-blue-400 transition"
                      title="Edit Item"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setItemPendingDelete(item)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 transition cursor-pointer"
                    title="Delete Item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {localTotalPages > 1 && (
        <div className="flex items-center justify-between border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 sm:px-6 rounded-2xl shadow-sm mt-4">
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-[var(--text-secondary)]">
                Showing <span className="font-semibold text-[var(--text-primary)]">{filteredItems.length}</span> items on page{" "}
                <span className="font-semibold text-[var(--text-primary)]">{localPage}</span> of{" "}
                <span className="font-semibold text-[var(--text-primary)]">{localTotalPages}</span>
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setLocalPage((p: number) => Math.max(1, p - 1))}
                  disabled={localPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-1 text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <span className="sr-only">Previous</span>
                  <ArrowUpDown className="h-4 w-4 rotate-90" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setLocalPage((p: number) => Math.min(localTotalPages, p + 1))}
                  disabled={localPage === localTotalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-1 text-[var(--text-muted)] ring-1 ring-inset ring-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <span className="sr-only">Next</span>
                  <ArrowUpDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {isItemModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setIsItemModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 flex-shrink-0">
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {editingItem ? "Edit Product" : "Add New Product"}
              </h3>
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {modalError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400">
                  ⚠️ {modalError}
                </div>
              )}

              <form id="menu-item-form" onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Barcode (Optional)</label>
                <input
                  type="text"
                  placeholder="Scan or enter barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Product Photo / Image (Optional)</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="https://... or upload photo"
                      value={formData.image_url || ""}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                    />
                    <label className="flex items-center gap-1.5 cursor-pointer rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition shrink-0">
                      <Upload className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                      <span>{isUploadingImage ? "Uploading..." : "Upload File"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploadingImage}
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {formData.image_url && (
                    <div className="relative flex items-center gap-3 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]">
                      <img
                        src={resolveImageUrl(formData.image_url)}
                        alt="Preview"
                        className="h-10 w-10 rounded-lg object-cover bg-black/20 shrink-0"
                      />
                      <span className="text-[11px] text-[var(--text-muted)] truncate flex-1 font-mono">
                        {formData.image_url}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image_url: "" })}
                        className="p-1 text-rose-400 hover:text-rose-300 transition shrink-0"
                        title="Remove photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {inventoryItems && inventoryItems.length > 0 && (
                <div>
                  <label className="block font-semibold mb-1">Direct Inventory Item (1:1 Stock Link)</label>
                  <select
                    value={formData.inventory_item_id || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, inventory_item_id: e.target.value || null })
                    }
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <option value="">-- Direct 1:1 Auto-Match / Recipe Managed --</option>
                    {inventoryItems.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} {inv.barcode ? `(${inv.barcode})` : ""}{inv.current_stock !== undefined && inv.current_stock !== null ? ` [Stock: ${inv.current_stock}]` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-xs">Category *</label>
                    <button
                      type="button"
                      onClick={() => setShowInlineCatInput(!showInlineCatInput)}
                      className="text-[11px] font-bold text-[var(--accent-brand)] hover:underline"
                    >
                      {showInlineCatInput ? "Cancel" : "+ New"}
                    </button>
                  </div>

                  {showInlineCatInput ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        type="text"
                        placeholder="Category name"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleInlineCategoryCreate();
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={isCreatingInlineCat || !inlineCatName.trim()}
                        onClick={() => void handleInlineCategoryCreate()}
                        className="rounded-xl bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 shrink-0"
                      >
                        {isCreatingInlineCat ? "..." : "Add"}
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.category_id}
                      onChange={(e) => {
                        if (e.target.value === "__ADD_NEW__") {
                          setShowInlineCatInput(true);
                        } else {
                          setFormData({ ...formData, category_id: e.target.value });
                        }
                      }}
                      required
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                    >
                      {(!formData.category_id || categories.length === 0) && (
                        <option value="">-- Choose Category --</option>
                      )}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Add New Category...</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block font-semibold mb-1 text-xs">Pricing Mode *</label>
                  <select
                    value={formData.pricing_mode}
                    onChange={(e) => setFormData({ ...formData, pricing_mode: e.target.value as any })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <option value="FIXED_UNIT">Fixed Unit Price</option>
                    <option value="WEIGHT_BASED">Weight/Custom Unit Based</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-xs">Base Unit (e.g. piece, kg) *</label>
                  <input
                    type="text"
                    list="menu-units"
                    required
                    value={formData.unit_label}
                    onChange={(e) => setFormData({ ...formData, unit_label: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  />
                  <datalist id="menu-units">
                    <option value="piece">Piece (pcs)</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="l">Liter (l)</option>
                    <option value="ml">Milliliter (ml)</option>
                    <option value="box">Box</option>
                    <option value="dozen">Dozen</option>
                  </datalist>
                </div>
              </div>

              {/* Alternate Units */}
              <div className="mt-3 p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)]/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-xs text-[var(--text-primary)]">Alternate Units</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, alternate_units: [...formData.alternate_units, { unit_label: "", conversion_factor: 1 }] })}
                    className="text-[10px] font-bold text-[var(--accent-brand)] hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Unit
                  </button>
                </div>
                {formData.alternate_units.length > 0 && (
                  <div className="space-y-2">
                    {formData.alternate_units.map((altUnit, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <div className="flex items-center gap-1.5 shrink-0 px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">1</span>
                          <span className="text-xs font-medium text-[var(--text-muted)] max-w-[60px] truncate" title={formData.unit_label || "base"}>
                            {formData.unit_label || "base"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-[var(--text-muted)] shrink-0">=</span>
                        
                        <div className="flex items-center flex-1 min-w-0 gap-2">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            placeholder="factor"
                            value={altUnit.conversion_factor}
                            onChange={(e) => {
                              const newUnits = [...formData.alternate_units];
                              newUnits[idx].conversion_factor = parseFloat(e.target.value) || 1;
                              setFormData({ ...formData, alternate_units: newUnits });
                            }}
                            className="w-16 shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none text-center"
                          />
                          <input
                            type="text"
                            placeholder="e.g. piece, box"
                            value={altUnit.unit_label}
                            onChange={(e) => {
                              const newUnits = [...formData.alternate_units];
                              newUnits[idx].unit_label = e.target.value;
                              setFormData({ ...formData, alternate_units: newUnits });
                            }}
                            className="flex-1 min-w-0 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newUnits = formData.alternate_units.filter((_, i) => i !== idx);
                            setFormData({ ...formData, alternate_units: newUnits });
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 transition"
                          title="Remove unit"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block font-semibold mb-1 text-xs">Tax Category</label>
                  <select
                    value={isCustomTax ? "CUSTOM" : (formData.tax_category || "GST 0%")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "CUSTOM") {
                        setIsCustomTax(true);
                        const rate = formData.tax_rate || "5";
                        setFormData({
                          ...formData,
                          tax_category: `GST Custom (${rate}%)`,
                          tax_rate: rate,
                        });
                      } else {
                        setIsCustomTax(false);
                        let rate = "0";
                        if (val === "GST 5%") rate = "5";
                        else if (val === "GST 12%") rate = "12";
                        else if (val === "GST 18%") rate = "18";
                        else if (val === "GST 28%") rate = "28";
                        setFormData({ ...formData, tax_category: val, tax_rate: rate });
                      }
                    }}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  >
                    <option value="GST 0%">GST 0% (Exempt)</option>
                    <option value="GST 5%">GST 5%</option>
                    <option value="GST 12%">GST 12%</option>
                    <option value="GST 18%">GST 18%</option>
                    <option value="GST 28%">GST 28%</option>
                    <option value="CUSTOM">Custom Tax Rate...</option>
                  </select>

                  {isCustomTax && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="Rate e.g. 3"
                        value={formData.tax_rate || ""}
                        onChange={(e) => {
                          const rateVal = e.target.value;
                          setFormData({
                            ...formData,
                            tax_category: rateVal ? `GST Custom (${rateVal}%)` : "GST Custom",
                            tax_rate: rateVal,
                          });
                        }}
                        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 font-mono text-xs text-[var(--text-primary)]"
                      />
                      <span className="text-xs font-bold text-[var(--text-muted)]">%</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-xs">HSN / SAC Code</label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 2106 or 1006"
                    value={formData.hsn_code || ""}
                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value.trim() })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Printed price"
                    value={formData.mrp || ""}
                    onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="POS Billed price"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 flex items-center justify-between">
                  <span>Evening Price (₹) <span className="text-[10px] text-[var(--text-muted)] font-normal">(Optional)</span></span>
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">Priority Override</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Evening override price (replaces selling price)"
                  value={formData.evening_price || ""}
                  onChange={(e) => setFormData({ ...formData, evening_price: e.target.value })}
                  className="w-full rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_available}
                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>Available in Store</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_verification_required}
                    onChange={(e) =>
                      setFormData({ ...formData, is_verification_required: e.target.checked })
                    }
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>Anti-Theft Verified</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.allow_oversell ?? true}
                    onChange={(e) =>
                      setFormData({ ...formData, allow_oversell: e.target.checked })
                    }
                    className="rounded border-[var(--border-strong)] text-emerald-500"
                  />
                  <span title="Allow POS overselling when physical stock is 0">Allow Oversell</span>
                </label>
              </div>

              </form>
            </div>

            {/* Fixed Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 flex-shrink-0">
              {editingItem ? (
                <button
                  type="button"
                  onClick={() => setItemPendingDelete(editingItem)}
                  className="rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Item
                </button>
              ) : <div />}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold hover:bg-[var(--bg-surface)] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="menu-item-form"
                  className="rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition cursor-pointer"
                >
                  Save Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setIsCategoryModalOpen(false)}
        >
          <div 
            className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-[var(--accent-brand)]" />
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Manage Categories
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Create Category Form */}
            <form onSubmit={handleCreateCategorySubmit} className="space-y-3 text-xs bg-[var(--bg-surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
              <label className="block font-bold text-[var(--text-primary)]">Add New Category</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="e.g. Fresh Fruits, Vegetables, Dairy"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubmittingCat || !newCatName.trim()}
                  className="rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-md disabled:opacity-50 transition shrink-0 cursor-pointer"
                >
                  {isSubmittingCat ? "Adding..." : "Add"}
                </button>
              </div>
            </form>

            {/* Existing Categories List */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)]">Existing Categories</span>
                <span className="text-[11px] text-[var(--text-muted)]">{categories.length} total</span>
              </div>
              {categories.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic py-2 text-center">No categories created yet.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {categories.map((cat) => {
                    const itemCount = menuItems.filter((m) => m.category_id === cat.id).length;
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="h-3.5 w-3.5 text-[var(--accent-brand)] shrink-0" />
                          <span className="font-semibold text-xs text-[var(--text-primary)] truncate">{cat.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-surface)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)] shrink-0">
                            {itemCount} {itemCount === 1 ? "item" : "items"}
                          </span>
                        </div>
                        {onDeleteCategory && (
                          <button
                            type="button"
                            onClick={() => setCatPendingDelete(cat)}
                            className="p-1 rounded-lg hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-500 transition cursor-pointer shrink-0 ml-2"
                            title={`Delete "${cat.name}"`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Delete Confirmation Modal */}
      {itemPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !isDeletingItem && setItemPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="rounded-full bg-rose-500/10 p-2.5 text-rose-500 border border-rose-500/20 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Delete Product?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Are you sure you want to delete <span className="font-bold text-[var(--text-primary)]">"{itemPendingDelete.name}"</span>?
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Selling Price:</span>
                <span className="font-bold text-[var(--text-primary)]">₹{Number(itemPendingDelete.price).toFixed(2)}</span>
              </div>
              {(itemPendingDelete as any).category_name && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Category:</span>
                  <span className="font-medium text-[var(--text-secondary)]">{(itemPendingDelete as any).category_name}</span>
                </div>
              )}
              {itemPendingDelete.barcode && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Barcode:</span>
                  <span className="font-mono text-[var(--text-secondary)]">{itemPendingDelete.barcode}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-[11px] text-amber-500 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>This will permanently remove the item from your catalog and POS billing.</span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setItemPendingDelete(null)}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={handleConfirmDeleteItem}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeletingItem ? "Deleting..." : "Delete Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Delete Confirmation Modal */}
      {catPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !isDeletingCat && setCatPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="rounded-full bg-rose-500/10 p-2.5 text-rose-500 border border-rose-500/20 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Delete Category?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Are you sure you want to delete category <span className="font-bold text-[var(--text-primary)]">"{catPendingDelete.name}"</span>?
                </p>
              </div>
            </div>

            {(() => {
              const productsInCat = menuItems.filter((m) => m.category_id === catPendingDelete.id);
              if (productsInCat.length > 0) {
                return (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 space-y-2 text-xs text-rose-500">
                    <div className="flex items-center gap-2 font-bold">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span>Warning: {productsInCat.length} product(s) inside this category</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-400">
                      Deleting category <strong className="text-rose-300">"{catPendingDelete.name}"</strong> will permanently delete all <span className="font-bold underline">{productsInCat.length} product(s)</span> inside it!
                    </p>
                    <div className="mt-2 max-h-24 overflow-y-auto space-y-1 pr-1">
                      {productsInCat.slice(0, 5).map((p) => (
                        <div key={p.id} className="text-[10px] bg-rose-500/10 px-2 py-0.5 rounded flex justify-between border border-rose-500/10">
                          <span className="truncate mr-2">{p.name}</span>
                          <span className="shrink-0 font-medium">₹{Number(p.price).toFixed(2)}</span>
                        </div>
                      ))}
                      {productsInCat.length > 5 && (
                        <p className="text-[10px] text-rose-400 italic">...and {productsInCat.length - 5} more product(s)</p>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                  <Tag className="h-4 w-4 text-[var(--accent-brand)] shrink-0" />
                  <span>This category currently contains no products. It can be safely deleted.</span>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDeletingCat}
                onClick={() => setCatPendingDelete(null)}
                className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingCat}
                onClick={handleConfirmDeleteCategory}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeletingCat ? "Deleting..." : "Delete Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Settings Drawer (Bulk Price + Catalogue Print) */}
      <MenuSettingsDrawer
        isOpen={isSettingsDrawerOpen}
        onClose={() => setIsSettingsDrawerOpen(false)}
        menuItems={menuItems}
        categories={categories}
        restaurant={restaurant || null}
        onSaveBatchItems={onSaveBatchItems || (async () => {})}
        onRestaurantUpdate={onRestaurantUpdate}
      />
    </div>
  );
}
