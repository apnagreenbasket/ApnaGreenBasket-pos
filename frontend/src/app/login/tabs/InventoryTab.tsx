"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Barcode,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  Edit3,
  Filter,
  History,
  Hourglass,
  Layers,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  PackageX,
  Phone,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  Tag,
  RotateCcw,
  FileText,
  Printer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Receipt,
  FileBarChart,
  ShoppingCart,
  Edit2,
  X,
} from "lucide-react";
import type {
  BatchDetail,
  BatchExpiryAlert,
  InventoryItem,
  InventoryUnit,
  PurchaseReturn,
  StockChangeType,
  StockLedgerEntry,
  Supplier,
  WastageReason,
} from "@/types";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { BarcodeRegisterModal } from "../components/BarcodeRegisterModal";
import { LogWastageModal } from "../modals/LogWastageModal";
import { BatchHistoryDrawer } from "../components/BatchHistoryDrawer";
import { BulkOperationsMenu } from "../components/BulkOperationsMenu";
import { AddSupplierModal } from "../components/AddSupplierModal";
import { AdjustBatchStockModal } from "../components/AdjustBatchStockModal";
import { ReturnBillModal } from "../components/ReturnBillModal";
import { PrintBarcodesModal } from "../components/PrintBarcodesModal";
import { DeleteInventoryModal } from "../modals/DeleteInventoryModal";
import { EditBatchModal } from "../modals/EditBatchModal";
import { EditInventoryModal } from "../modals/EditInventoryModal";
import { parseUTCDate } from "../adminUtils";
import type { InventoryTabType, ScanFeedItem } from "../hooks/useInventoryManagement";
import type { RestaurantProfile } from "../adminTypes";

export type BatchSortOption =
  | "recent"           // Default: Most recent arrival
  | "oldest"           // Oldest arrival
  | "expiry_asc"       // Expiry Date (Earliest date first)
  | "expiry_desc"      // Expiry Date (Latest date first)
  | "shelf_life_asc"   // Shelf Life Alert (Shortest alert duration first)
  | "urgency_asc"      // Freshness Urgency (Earliest of expiry date OR intake + shelf life hrs)
  | "alpha_asc"        // Product Name (A to Z)
  | "alpha_desc"       // Product Name (Z to A)
  | "stock_desc"       // Remaining Stock (High to Low)
  | "stock_asc"        // Remaining Stock (Low to High)
  | "batch_num";       // Batch Number

export type ItemSortOption =
  | "recent"           // Most recently added item
  | "oldest"           // Oldest added item
  | "alpha_asc"        // Item Name (A to Z)
  | "alpha_desc"       // Item Name (Z to A)
  | "stock_desc"       // Current Stock (High to Low)
  | "stock_asc"        // Current Stock (Low to High)
  | "cost_desc"        // Cost Price (High to Low)
  | "cost_asc";        // Cost Price (Low to High)

interface InventoryTabProps {
  activeSubTab: InventoryTabType;
  setActiveSubTab: (tab: InventoryTabType) => void;
  inventoryViewMode?: "combined" | "batches";
  setInventoryViewMode?: (mode: "combined" | "batches") => void;
  items: InventoryItem[];
  itemsPage?: number;
  setItemsPage?: (p: number | ((prev: number) => number)) => void;
  itemsTotalPages?: number;
  itemsTotal?: number;
  batches: BatchDetail[];
  batchesPage?: number;
  setBatchesPage?: (p: number | ((prev: number) => number)) => void;
  batchesTotalPages?: number;
  batchesTotal?: number;
  suppliers?: Supplier[];
  createSupplier?: (data: { name: string; phone?: string; email?: string; address?: string }) => Promise<any>;
  updateSupplier?: (supplierId: string, data: any) => Promise<any>;
  fetchBatches?: (itemId?: string) => Promise<any>;
  fetchItems?: () => Promise<any>;
  alerts: BatchExpiryAlert[];
  ledgerEntries: StockLedgerEntry[];
  ledgerTotal: number;
  ledgerPage: number;
  setLedgerPage: (page: number) => void;
  ledgerPageSize: number;
  ledgerFilterItem: string;
  setLedgerFilterItem: (id: string) => void;
  ledgerFilterType: StockChangeType | "";
  setLedgerFilterType: (type: StockChangeType | "") => void;
  isLoading: boolean;
  error: string | null;
  scanQty: number;
  setScanQty: (m: number) => void;
  scanWeight: number | "";
  setScanWeight: (w: number | "") => void;
  scannedBarcode: string;
  setScannedBarcode: (code: string) => void;
  isRegisterModalOpen: boolean;
  setIsRegisterModalOpen: (open: boolean) => void;
  unregisteredBarcode: string;
  scanFeed: ScanFeedItem[];
  handleBarcodeScan: (code: string) => void;
  onboardScannedItem: (data: any) => Promise<any>;
  // Batch Drawer & Supplier Modal
  selectedBatchItem?: InventoryItem | null;
  isBatchDrawerOpen?: boolean;
  openBatchDrawer?: (item: InventoryItem) => void;
  closeBatchDrawer?: () => void;
  deleteInventoryItem?: (itemId: string) => Promise<boolean>;
  deleteBatch?: (batchId: string) => Promise<boolean>;
  updateBatchMetadata?: (
    batchId: string,
    data: {
      batch_number?: string | null;
      expiry_date?: string | null;
      intake_date?: string | null;
      supplier_id?: string | null;
      notes?: string | null;
      shelf_life_alert_hrs?: number | null;
      mrp?: number | null;
      retail_price?: number | null;
      wholesale_price?: number | null;
      alternate_units?: Array<{ unit_label: string; conversion_factor: number }> | null;
      sync_catalog_price?: boolean;
    }
  ) => Promise<any>;
  isAddSupplierModalOpen?: boolean;
  setIsAddSupplierModalOpen?: (open: boolean) => void;
  openEditSupplierModal?: (supplier: Supplier) => void;
  editingSupplier?: Supplier;
  setEditingSupplier?: (supplier: Supplier | undefined) => void;
  // Wastage
  isWastageModalOpen: boolean;
  selectedWastageItem: InventoryItem | null;
  selectedWastageBatch: BatchDetail | null;
  openWastageModal: (item: InventoryItem, batch?: BatchDetail | null) => void;
  closeWastageModal: () => void;
  logWastage: (data: {
    item_id: string;
    quantity: number;
    reason: WastageReason;
    notes?: string;
    batch_number?: string;
  }) => Promise<void>;
  catalogCategories?: { id: string; name: string }[];
  authToken?: string;
  // Edit Inventory Item Modal
  selectedEditItem?: InventoryItem | null;
  isEditItemModalOpen?: boolean;
  openEditItemModal?: (item: InventoryItem) => void;
  closeEditItemModal?: () => void;
  updateInventoryItem?: (itemId: string, data: any) => Promise<any>;
  restaurant?: RestaurantProfile | null;
}

export function InventoryTab({
  activeSubTab,
  setActiveSubTab,
  inventoryViewMode = "combined",
  setInventoryViewMode,
  items,
  itemsPage = 1,
  setItemsPage,
  itemsTotalPages = 1,
  itemsTotal = 0,
  batches,
  batchesPage = 1,
  setBatchesPage,
  batchesTotalPages = 1,
  batchesTotal = 0,
  suppliers = [],
  createSupplier,
  updateSupplier,
  fetchBatches,
  fetchItems,
  alerts,
  ledgerEntries,
  ledgerTotal,
  ledgerPage,
  setLedgerPage,
  ledgerPageSize,
  ledgerFilterItem,
  setLedgerFilterItem,
  ledgerFilterType,
  setLedgerFilterType,
  isLoading,
  error,
  scanQty,
  setScanQty,
  scanWeight,
  setScanWeight,
  scannedBarcode,
  setScannedBarcode,
  isRegisterModalOpen,
  setIsRegisterModalOpen,
  unregisteredBarcode,
  scanFeed,
  handleBarcodeScan,
  onboardScannedItem,
  selectedBatchItem,
  isBatchDrawerOpen = false,
  openBatchDrawer,
  closeBatchDrawer,
  deleteInventoryItem,
  deleteBatch,
  updateBatchMetadata,
  isAddSupplierModalOpen = false,
  setIsAddSupplierModalOpen,
  openEditSupplierModal,
  editingSupplier,
  setEditingSupplier,
  isWastageModalOpen,
  selectedWastageItem,
  selectedWastageBatch,
  openWastageModal,
  closeWastageModal,
  logWastage,
  catalogCategories,
  authToken,
  selectedEditItem: propSelectedEditItem,
  isEditItemModalOpen: propIsEditItemModalOpen,
  openEditItemModal: propOpenEditItemModal,
  closeEditItemModal: propCloseEditItemModal,
  updateInventoryItem,
  restaurant,
}: InventoryTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const manualBarcodeRef = useRef<HTMLInputElement>(null);

  const [localError, setLocalError] = useState<string | null>(null);

  // Edit Batch Modal State
  const [selectedEditBatch, setSelectedEditBatch] = useState<BatchDetail | null>(null);
  const [isEditBatchModalOpen, setIsEditBatchModalOpen] = useState(false);

  // Edit Inventory Item Modal State
  const [localEditItem, setLocalEditItem] = useState<InventoryItem | null>(null);
  const [isLocalEditModalOpen, setIsLocalEditModalOpen] = useState(false);

  const activeEditItem = propSelectedEditItem !== undefined ? propSelectedEditItem : localEditItem;
  const isEditOpen = propIsEditItemModalOpen !== undefined ? propIsEditItemModalOpen : isLocalEditModalOpen;

  const handleOpenEditItem = (item: InventoryItem) => {
    if (propOpenEditItemModal) {
      propOpenEditItemModal(item);
    } else {
      setLocalEditItem(item);
      setIsLocalEditModalOpen(true);
    }
  };

  const handleCloseEditItem = () => {
    setIsLocalEditModalOpen(false);
    setLocalEditItem(null);
    if (propCloseEditItemModal) {
      propCloseEditItemModal();
    }
  };

  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => setLocalError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [localError]);

  useBarcodeScanner({
    onScan: (barcode) => {
      setSearchQuery(barcode);
    },
    enabled: activeSubTab === "items" && !isEditOpen && !isRegisterModalOpen, // only listen when looking at products table and no modal is open
  });

  // Prefill Item state for adding a batch to an existing product
  const [prefillItem, setPrefillItem] = useState<InventoryItem | null>(null);

  // Batch Stock Adjustment Modal state
  const [selectedAdjustBatch, setSelectedAdjustBatch] = useState<BatchDetail | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  // Return Bill Modal state
  const [selectedReturnBill, setSelectedReturnBill] = useState<PurchaseReturn | null>(null);
  const [isReturnBillModalOpen, setIsReturnBillModalOpen] = useState(false);

  // Print Barcodes Modal state
  const [selectedPrintItem, setSelectedPrintItem] = useState<InventoryItem | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Delete Inventory Item Modal state
  const [selectedDeleteItem, setSelectedDeleteItem] = useState<InventoryItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    if (catalogCategories && catalogCategories.length > 0) {
      catalogCategories.forEach((c) => set.add(c.name));
    }
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [items, catalogCategories]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchQuery.trim()) return suppliers;
    const q = supplierSearchQuery.toLowerCase().trim();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
    );
  }, [suppliers, supplierSearchQuery]);

  const [itemSortOption, setItemSortOption] = useState<ItemSortOption>("recent");
  const [stockFilter, setStockFilter] = useState<"ALL" | "LOW_STOCK">("ALL");

  // Map of item_id -> latest batch arrival/creation timestamp (ms) based on all batches loaded
  const latestBatchTimeMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!batches || batches.length === 0) return map;
    for (const b of batches) {
      if (!b.item_id) continue;
      const intakeTime = b.intake_date ? parseUTCDate(b.intake_date).getTime() : 0;
      const createdTime = (b as any).created_at ? parseUTCDate((b as any).created_at).getTime() : 0;
      const bTime = Math.max(intakeTime, createdTime);
      if (bTime > 0) {
        const current = map.get(b.item_id) || 0;
        if (bTime > current) {
          map.set(b.item_id, bTime);
        }
      }
    }
    return map;
  }, [batches]);

  // Compute the most recent activity/addition timestamp for an item (item created vs its batches)
  const getMostRecentAddedTime = useCallback(
    (item: InventoryItem): number => {
      const itemCreated = (item as any).created_at
        ? parseUTCDate((item as any).created_at).getTime()
        : 0;
      const itemLatestBatch = (item as any).latest_batch_date
        ? parseUTCDate((item as any).latest_batch_date).getTime()
        : 0;
      const batchTime = latestBatchTimeMap.get(item.id) || 0;
      return Math.max(itemCreated, itemLatestBatch, batchTime);
    },
    [latestBatchTimeMap]
  );

  const filteredAndSortedItems = useMemo(() => {
    const list = items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        selectedCategory === "ALL" || item.category === selectedCategory;
      const matchesStock =
        stockFilter === "ALL" ||
        parseFloat(String(item.current_stock || 0)) <= parseFloat(String(item.reorder_threshold || 0));
      return matchesSearch && matchesCategory && matchesStock;
    });

    list.sort((a, b) => {
      switch (itemSortOption) {
        case "recent": {
          const tA = getMostRecentAddedTime(a);
          const tB = getMostRecentAddedTime(b);
          if (tB !== tA) {
            return tB - tA;
          }
          return (a.name || "").localeCompare(b.name || "");
        }
        case "oldest": {
          const tA = (a as any).created_at ? parseUTCDate((a as any).created_at).getTime() : 0;
          const tB = (b as any).created_at ? parseUTCDate((b as any).created_at).getTime() : 0;
          return tA - tB;
        }
        case "alpha_asc":
          return (a.name || "").localeCompare(b.name || "");
        case "alpha_desc":
          return (b.name || "").localeCompare(a.name || "");
        case "stock_desc":
          return parseFloat(String(b.current_stock || 0)) - parseFloat(String(a.current_stock || 0));
        case "stock_asc":
          return parseFloat(String(a.current_stock || 0)) - parseFloat(String(b.current_stock || 0));
        case "cost_desc":
          return parseFloat(String(b.cost_per_unit || 0)) - parseFloat(String(a.cost_per_unit || 0));
        case "cost_asc":
          return parseFloat(String(a.cost_per_unit || 0)) - parseFloat(String(b.cost_per_unit || 0));
        default:
          return 0;
      }
    });

    return list;
  }, [items, searchQuery, selectedCategory, stockFilter, itemSortOption, getMostRecentAddedTime]);

  const filteredItems = filteredAndSortedItems;

  // ── Batch Freshness & FEFO Resolution: Whichever is shorter duration takes lead ──
  const getBatchFreshnessMeta = useCallback((b: BatchDetail, matchedItem?: InventoryItem) => {
    const remQty = Number(b.remaining_quantity || 0);
    const now = Date.now();

    // 1. Expiry date timestamp
    let expiryTime: number | null = null;
    if (b.expiry_date) {
      expiryTime = parseUTCDate(b.expiry_date).getTime();
    }

    // 2. Shelf life hours & deadline (batch level or inherited from parent item)
    const shelfLifeHours = b.shelf_life_alert_hrs ?? matchedItem?.shelf_life_alert_hrs ?? null;
    let shelfDeadline: number | null = null;
    if (shelfLifeHours != null && b.intake_date) {
      shelfDeadline = parseUTCDate(b.intake_date).getTime() + shelfLifeHours * 3600 * 1000;
    }

    // 3. Whichever is shorter duration takes lead
    let effectiveDeadline: number | null = null;
    let leadType: "EXPIRY" | "SHELF_LIFE" | "NONE" = "NONE";

    if (expiryTime != null && shelfDeadline != null) {
      if (expiryTime <= shelfDeadline) {
        effectiveDeadline = expiryTime;
        leadType = "EXPIRY";
      } else {
        effectiveDeadline = shelfDeadline;
        leadType = "SHELF_LIFE";
      }
    } else if (expiryTime != null) {
      effectiveDeadline = expiryTime;
      leadType = "EXPIRY";
    } else if (shelfDeadline != null) {
      effectiveDeadline = shelfDeadline;
      leadType = "SHELF_LIFE";
    }

    // 4. Compute effective status & countdowns
    let effectiveStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "DEPLETED" | "OVERSOLD" = "ACTIVE";
    let isExpired = false;
    let isExpiringSoon = false;
    let daysUntilDeadline: number | null = null;
    let hoursUntilDeadline: number | null = null;

    if (remQty < 0) {
      effectiveStatus = "OVERSOLD";
    } else if (remQty <= 0) {
      effectiveStatus = "DEPLETED";
    } else if (effectiveDeadline != null) {
      const msLeft = effectiveDeadline - now;
      hoursUntilDeadline = Math.round(msLeft / (3600 * 1000));
      daysUntilDeadline = Math.ceil(msLeft / (24 * 3600 * 1000));

      if (effectiveDeadline < now) {
        effectiveStatus = "EXPIRED";
        isExpired = true;
      } else if (effectiveDeadline <= now + 7 * 24 * 3600 * 1000) {
        effectiveStatus = "EXPIRING_SOON";
        isExpiringSoon = true;
      } else {
        effectiveStatus = "ACTIVE";
      }
    } else {
      effectiveStatus = "ACTIVE";
    }

    return {
      expiryTime,
      shelfDeadline,
      effectiveDeadline,
      leadType,
      effectiveStatus,
      shelfLifeHours,
      daysUntilDeadline,
      hoursUntilDeadline,
      isExpired,
      isExpiringSoon,
    };
  }, []);

  // Batch Lots & FEFO Search, Status Filter & Sorting
  const [batchSearchQuery, setBatchSearchQuery] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState<string>("ALL");
  const [batchSortOption, setBatchSortOption] = useState<BatchSortOption>("expiry_asc");

  const batchCounts = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, depleted = 0, oversold = 0;
    batches.forEach((b) => {
      const matchedItem = items.find((it) => it.id === b.item_id);
      const meta = getBatchFreshnessMeta(b, matchedItem);
      if (meta.effectiveStatus === "OVERSOLD") oversold++;
      else if (meta.effectiveStatus === "ACTIVE") active++;
      else if (meta.effectiveStatus === "EXPIRING_SOON") expiring++;
      else if (meta.effectiveStatus === "EXPIRED") expired++;
      else if (meta.effectiveStatus === "DEPLETED") depleted++;
    });
    return { all: batches.length, active, expiring, expired, depleted, oversold };
  }, [batches, items, getBatchFreshnessMeta]);

  const filteredAndSortedBatches = useMemo(() => {
    let result = [...batches];

    // 1. Status Filter (uses dynamic freshness status)
    if (batchStatusFilter !== "ALL") {
      result = result.filter((b) => {
        const matchedItem = items.find((it) => it.id === b.item_id);
        const meta = getBatchFreshnessMeta(b, matchedItem);
        return meta.effectiveStatus === batchStatusFilter;
      });
    }

    // 2. Search Filter (batch number, product name, barcode)
    if (batchSearchQuery.trim()) {
      const q = batchSearchQuery.toLowerCase().trim();
      result = result.filter(
        (b) =>
          b.batch_number.toLowerCase().includes(q) ||
          b.item_name.toLowerCase().includes(q) ||
          (b.item_barcode && b.item_barcode.toLowerCase().includes(q))
      );
    }

    // 3. Sorting with shorter duration rule
    result.sort((a, b) => {
      const matchedA = items.find((it) => it.id === a.item_id);
      const matchedB = items.find((it) => it.id === b.item_id);
      const metaA = getBatchFreshnessMeta(a, matchedA);
      const metaB = getBatchFreshnessMeta(b, matchedB);

      switch (batchSortOption) {
        case "recent": {
          const tA = a.intake_date ? new Date(a.intake_date).getTime() : 0;
          const tB = b.intake_date ? new Date(b.intake_date).getTime() : 0;
          return tB - tA; // Newest arrival first
        }
        case "oldest": {
          const tA = a.intake_date ? new Date(a.intake_date).getTime() : 0;
          const tB = b.intake_date ? new Date(b.intake_date).getTime() : 0;
          return tA - tB; // Oldest arrival first (FIFO)
        }
        case "expiry_asc":
        case "urgency_asc": {
          // Whichever is shorter duration leads (FEFO)
          if (metaA.effectiveDeadline == null && metaB.effectiveDeadline == null) {
            const tA = a.intake_date ? new Date(a.intake_date).getTime() : 0;
            const tB = b.intake_date ? new Date(b.intake_date).getTime() : 0;
            return tA - tB;
          }
          if (metaA.effectiveDeadline == null) return 1;
          if (metaB.effectiveDeadline == null) return -1;
          return metaA.effectiveDeadline - metaB.effectiveDeadline;
        }
        case "expiry_desc": {
          if (metaA.effectiveDeadline == null && metaB.effectiveDeadline == null) return 0;
          if (metaA.effectiveDeadline == null) return 1;
          if (metaB.effectiveDeadline == null) return -1;
          return metaB.effectiveDeadline - metaA.effectiveDeadline;
        }
        case "shelf_life_asc": {
          const hrsA = metaA.shelfLifeHours;
          const hrsB = metaB.shelfLifeHours;
          if (hrsA == null && hrsB == null) return 0;
          if (hrsA == null) return 1;
          if (hrsB == null) return -1;
          return hrsA - hrsB;
        }
        case "alpha_asc":
          return (a.item_name || "").localeCompare(b.item_name || "");
        case "alpha_desc":
          return (b.item_name || "").localeCompare(a.item_name || "");
        case "stock_desc":
          return Number(b.remaining_quantity) - Number(a.remaining_quantity);
        case "stock_asc":
          return Number(a.remaining_quantity) - Number(b.remaining_quantity);
        case "batch_num":
          return (a.batch_number || "").localeCompare(b.batch_number || "");
        default:
          return 0;
      }
    });

    return result;
  }, [batches, items, batchStatusFilter, batchSearchQuery, batchSortOption, getBatchFreshnessMeta]);

  const lowStockCount = items.filter(
    (i) => parseFloat(i.current_stock) <= parseFloat(i.reorder_threshold)
  ).length;

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcodeInput.trim()) {
      handleBarcodeScan(manualBarcodeInput.trim());
      setManualBarcodeInput("");
      setTimeout(() => manualBarcodeRef.current?.focus(), 0);
    }
  };

  return (
    <div className="space-y-6">
      {localError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex items-center justify-between text-sm font-bold text-rose-500">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full bg-rose-500 p-0.5 text-[var(--bg-surface)]">
              <X className="h-4 w-4" />
            </span>
            {localError}
          </div>
          <button type="button" onClick={() => setLocalError(null)} className="opacity-70 hover:opacity-100 uppercase text-[10px] tracking-wider px-2 py-1 rounded bg-rose-500/20">
            Dismiss
          </button>
        </div>
      )}
      
      {/* Top Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab("items");
            setStockFilter("ALL");
          }}
          className={`text-left rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs hover:border-[var(--accent-brand)]/40 hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer group ${
            activeSubTab === "items" && stockFilter === "ALL"
              ? "border-[var(--accent-brand)]/60 ring-1 ring-[var(--accent-brand)]/20"
              : "border-[var(--border-subtle)]"
          }`}
          title="Click to view Barcode & Item Master catalog"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="group-hover:text-[var(--text-primary)] transition">Total Catalog Items</span>
            <Boxes className="h-4 w-4 text-[var(--accent-brand)] group-hover:scale-110 transition" />
          </div>
          <p className="font-display text-2xl font-bold text-[var(--text-primary)]">
            {itemsTotal || items.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab("batches");
            setBatchStatusFilter("ACTIVE");
          }}
          className="text-left rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs hover:border-emerald-500/40 hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer group"
          title="Click to view Active Batch Lots (excluding depleted lots)"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="group-hover:text-[var(--text-primary)] transition">Active Batch Lots</span>
            <Layers className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition" />
          </div>
          <p className="font-display text-2xl font-bold text-emerald-400">
            {batchCounts.active}
          </p>
          {batchCounts.depleted > 0 && (
            <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">
              ({batchCounts.depleted} depleted excluded)
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab("items");
            if (activeSubTab === "items" && stockFilter === "LOW_STOCK") {
              setStockFilter("ALL");
            } else {
              setStockFilter("LOW_STOCK");
              setItemSortOption("stock_asc");
            }
          }}
          className={`text-left rounded-2xl border bg-[var(--bg-surface)] p-4 shadow-xs hover:border-amber-500/50 hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer group ${
            activeSubTab === "items" && stockFilter === "LOW_STOCK"
              ? "border-amber-500/80 ring-2 ring-amber-500/30 bg-amber-500/10"
              : "border-[var(--border-subtle)]"
          }`}
          title="Click to filter catalog items touching reorder threshold (sorted low to high for emergency replenishment)"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className={`transition ${activeSubTab === "items" && stockFilter === "LOW_STOCK" ? "text-amber-300 font-bold" : "group-hover:text-[var(--text-primary)]"}`}>
              Low Stock Alerts
            </span>
            <TrendingDown className="h-4 w-4 text-amber-400 group-hover:scale-110 transition" />
          </div>
          <p className="font-display text-2xl font-bold text-amber-400">
            {lowStockCount}
          </p>
          {activeSubTab === "items" && stockFilter === "LOW_STOCK" && (
            <span className="text-[10px] text-amber-400/90 mt-0.5 block font-medium">
              (Filter Active • Click to clear)
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab("batches");
            setBatchSortOption("expiry_asc");
            if (batchCounts.expiring > 0) {
              setBatchStatusFilter("EXPIRING_SOON");
            } else if (batchCounts.expired > 0) {
              setBatchStatusFilter("EXPIRED");
            } else {
              setBatchStatusFilter("EXPIRING_SOON");
            }
          }}
          className="text-left rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs hover:border-red-500/40 hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer group"
          title="Click to open Batch Lots & FEFO with expiry filter sorted from nearest on top"
        >
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span className="group-hover:text-[var(--text-primary)] transition">Near Expiry / Shelf Life</span>
            <AlertTriangle className="h-4 w-4 text-red-400 group-hover:scale-110 transition" />
          </div>
          <p className="font-display text-2xl font-bold text-red-400">
            {batchCounts.expiring + batchCounts.expired}
          </p>
          {batchCounts.expired > 0 && batchCounts.expiring > 0 ? (
            <span className="text-[10px] text-red-400/80 mt-0.5 block">
              ({batchCounts.expiring} near, {batchCounts.expired} expired)
            </span>
          ) : batchCounts.expired > 0 ? (
            <span className="text-[10px] text-rose-400 mt-0.5 block">
              ({batchCounts.expired} expired)
            </span>
          ) : null}
        </button>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab("items")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "items"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <ScanLine className="h-4 w-4" />
            Barcode & Item Master
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("batches")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "batches"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <Layers className="h-4 w-4" />
            Batch Lots & FEFO
            {batches.length > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                {batches.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("suppliers")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "suppliers"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <Building2 className="h-4 w-4 text-purple-400" />
            Suppliers & Vendors
            {suppliers.length > 0 && (
              <span className="rounded-full bg-purple-500/20 text-purple-300 px-1.5 py-0.2 text-[10px] font-mono">
                {suppliers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("ledger")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubTab === "ledger"
                ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-md"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            }`}
          >
            <History className="h-4 w-4" />
            Movement Ledger
          </button>
        </div>

        <div className="flex items-center gap-2">
          <BulkOperationsMenu entity="inventory" authToken={authToken} />
          <button
            type="button"
            onClick={() => {
              setScannedBarcode("");
              setIsRegisterModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Stock / Register Product
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Barcode Scanner Station & Item Master */}
      {activeSubTab === "items" && (
        <div className="space-y-6">
          {/* Hardware Barcode Scanner Live Station Banner */}
          <div className="rounded-2xl border border-[var(--border-strong)] bg-gradient-to-r from-emerald-950/40 via-[var(--bg-surface)] to-emerald-950/30 p-4 sm:p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-4 ring-emerald-500/10">
                  <Barcode className="h-6 w-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                      Hardware Barcode Scanner Station
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Gun Ready
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Pull the physical scanner trigger anytime. Known items auto-increment count; new barcodes pop up a quick registration modal.
                  </p>
                </div>
              </div>

              {/* Manual Scan Code Entry */}
              <form
                onSubmit={handleManualScanSubmit}
                className="flex items-center gap-2 min-w-[280px]"
              >
                <div className="flex items-center gap-1 border border-[var(--border-strong)] rounded-xl bg-[var(--bg-surface-elevated)] h-9 px-1">
                  <span className="pl-2 text-xs text-[var(--text-muted)] font-bold">Qty:</span>
                  <input
                    type="number"
                    min="1"
                    value={scanQty}
                    onChange={(e) => setScanQty(parseInt(e.target.value) || 1)}
                    className="w-10 bg-transparent py-1 text-xs text-center text-[var(--text-primary)] font-mono font-bold focus:outline-none"
                    title="Batch count multiplier for next scan"
                  />
                  <span className="text-[var(--border-strong)]">|</span>
                  <span className="text-xs text-[var(--text-muted)] font-bold">Wgt:</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={scanWeight}
                    onChange={(e) => setScanWeight(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    placeholder="Auto"
                    className="w-14 bg-transparent py-1 text-xs text-center text-[var(--text-primary)] font-mono font-bold focus:outline-none"
                    title="Optional: Weight per unit (kg). If provided, it multiplies with Qty."
                  />
                </div>
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    ref={manualBarcodeRef}
                    type="text"
                    placeholder="Scan or type barcode..."
                    value={manualBarcodeInput}
                    onChange={(e) => setManualBarcodeInput(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 pl-9 pr-3 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow hover:opacity-90 transition"
                >
                  Lookup
                </button>
              </form>
            </div>

            {/* Live Scan Feed Strip */}
            {scanFeed.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
                  Recent Scan Feed
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {scanFeed.slice(0, 5).map((scan) => (
                    <div
                      key={scan.id}
                      className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-[var(--bg-surface-elevated)] px-3 py-1.5 border border-[var(--border-subtle)] text-xs"
                    >
                      <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="font-semibold text-[var(--text-primary)]">{scan.name}</span>
                      <span className="font-mono text-emerald-400 font-bold">+{scan.quantity}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        (Now: {scan.newStock})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto flex-1 max-w-2xl">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search product name or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Low Stock Quick Filter Button */}
              <button
                type="button"
                onClick={() => {
                  if (stockFilter === "LOW_STOCK") {
                    setStockFilter("ALL");
                  } else {
                    setStockFilter("LOW_STOCK");
                    setItemSortOption("stock_asc");
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition border cursor-pointer shrink-0 ${
                  stockFilter === "LOW_STOCK"
                    ? "border-amber-500/80 bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                    : "border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
                }`}
                title={
                  stockFilter === "LOW_STOCK"
                    ? "Click to show all catalog items"
                    : "Filter to items that reached reorder threshold (emergency replenishment)"
                }
              >
                <TrendingDown className={`h-3.5 w-3.5 ${stockFilter === "LOW_STOCK" ? "text-amber-400" : "text-[var(--text-muted)]"}`} />
                <span>Low Stock</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    stockFilter === "LOW_STOCK"
                      ? "bg-amber-500/30 text-amber-200 font-bold"
                      : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
                  }`}
                >
                  {lowStockCount}
                </span>
                {stockFilter === "LOW_STOCK" && (
                  <X className="h-3 w-3 ml-0.5 opacity-70 hover:opacity-100" />
                )}
              </button>
            </div>

            {/* Item Catalog Sorting Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 shadow-sm">
                <ArrowUpDown className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
                <span className="text-[11px] text-[var(--text-muted)] font-semibold whitespace-nowrap">Sort:</span>
                <select
                  value={itemSortOption}
                  onChange={(e) => setItemSortOption(e.target.value as ItemSortOption)}
                  className="bg-transparent text-xs text-[var(--text-primary)] font-medium focus:outline-none cursor-pointer"
                >
                  <option value="recent">Most Recent Added (Default)</option>
                  <option value="oldest">Oldest Added</option>
                  <option value="alpha_asc">Item Name: A → Z</option>
                  <option value="alpha_desc">Item Name: Z → A</option>
                  <option value="stock_asc">Current Stock: Low → High (Emergency)</option>
                  <option value="stock_desc">Current Stock: High → Low</option>
                  <option value="cost_desc">Cost Price: High → Low</option>
                  <option value="cost_asc">Cost Price: Low → High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th
                      className="py-3 px-4 cursor-pointer select-none hover:text-[var(--text-primary)] transition"
                      onClick={() => setItemSortOption(itemSortOption === "alpha_asc" ? "alpha_desc" : "alpha_asc")}
                      title="Click to sort by item name"
                    >
                      <div className="flex items-center gap-1">
                        <span>Item Name</span>
                        {itemSortOption === "alpha_asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        ) : itemSortOption === "alpha_desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Barcode</th>
                    <th className="py-3 px-4">Category</th>
                    <th
                      className="py-3 px-4 cursor-pointer select-none hover:text-[var(--text-primary)] transition"
                      onClick={() => setItemSortOption(itemSortOption === "stock_desc" ? "stock_asc" : "stock_desc")}
                      title="Click to sort by current stock"
                    >
                      <div className="flex items-center gap-1">
                        <span>Current Stock</span>
                        {itemSortOption === "stock_desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        ) : itemSortOption === "stock_asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer select-none hover:text-[var(--text-primary)] transition"
                      onClick={() => setItemSortOption(itemSortOption === "cost_desc" ? "cost_asc" : "cost_desc")}
                      title="Click to sort by cost price"
                    >
                      <div className="flex items-center gap-1">
                        <span>Cost Price</span>
                        {itemSortOption === "cost_desc" ? (
                          <ArrowDown className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        ) : itemSortOption === "cost_asc" ? (
                          <ArrowUp className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">HSN</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Package className="h-10 w-10 text-[var(--text-muted)] opacity-50" />
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            {stockFilter === "LOW_STOCK"
                              ? "No items currently at or below reorder threshold."
                              : "No inventory items found. Scan a barcode or inward stock."}
                          </p>
                          {stockFilter === "LOW_STOCK" ? (
                            <button
                              type="button"
                              onClick={() => setStockFilter("ALL")}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] shadow-md transition active:scale-95 cursor-pointer"
                            >
                              Show All Catalog Items
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setScannedBarcode("");
                                setIsRegisterModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition active:scale-95"
                            >
                              <Plus className="h-4 w-4" />
                              + Add First Stock / Register Product
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const stockNum = parseFloat(item.current_stock) || 0;
                      const thresholdNum = parseFloat(item.reorder_threshold) || 0;
                      const isLow = stockNum <= thresholdNum;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-[var(--bg-surface-elevated)] transition"
                        >
                          <td className="py-3 px-4">
                            <span className="font-bold text-[var(--text-primary)] block">
                              {item.name}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {item.barcode ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[var(--accent-brand)] rounded bg-[var(--bg-surface-elevated)] px-2 py-0.5 border border-[var(--border-subtle)]">
                                <Barcode className="h-3 w-3" />
                                {item.barcode}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)] italic">
                                No barcode
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            {item.category}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-mono font-bold ${
                                isLow ? "text-red-400" : "text-emerald-400"
                              }`}
                            >
                              {stockNum} {item.unit}
                            </span>
                            {isLow && (
                              <span
                                className="ml-1.5 text-[10px] text-amber-400 font-semibold"
                                title={`Reorder threshold: ${thresholdNum} ${item.unit}`}
                              >
                                (Low • ≤{thresholdNum})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                            ₹{parseFloat(item.cost_per_unit).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">
                            {item.hsn_code ? (
                              <span className="rounded bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 border border-[var(--border-subtle)] text-[11px] font-bold text-amber-400">
                                {item.hsn_code}
                              </span>
                            ) : (
                              <span className="text-[11px] text-[var(--text-muted)] italic">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Edit Item Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditItem(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
                                title="Edit inventory item (HSN, barcode, category, alternate units, tax, pricing)"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Edit
                              </button>

                              {/* View Batches Button */}
                              {openBatchDrawer && (
                                <button
                                  type="button"
                                  onClick={() => openBatchDrawer(item)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer"
                                  title="View all arrival batches for this item"
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                  View Batches
                                </button>
                              )}

                              {/* Print Barcode Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPrintItem(item);
                                  setIsPrintModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-400 hover:bg-purple-500/20 transition cursor-pointer"
                                title="Print custom barcodes for this item"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Print
                              </button>

                              {/* Log Wastage Button */}
                              {(() => {
                                const isOutOfStock = parseFloat(item.current_stock) <= 0;
                                return (
                                  <button
                                    type="button"
                                    disabled={isOutOfStock}
                                    onClick={() => openWastageModal(item)}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                      isOutOfStock
                                        ? "border-gray-500/20 bg-gray-500/10 text-gray-500 cursor-not-allowed opacity-50"
                                        : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                                    }`}
                                    title={
                                      isOutOfStock
                                        ? "Cannot log wastage for item with 0 stock"
                                        : "Log spoilage, damage, or loss write-off"
                                    }
                                  >
                                    <PackageX className="h-3.5 w-3.5" />
                                    Log Wastage
                                  </button>
                                );
                              })()}

                              {/* Delete Item Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDeleteItem(item);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition cursor-pointer"
                                title="Delete this item entirely"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {itemsTotalPages && itemsTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 sm:px-6 rounded-b-2xl shadow-sm">
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Showing <span className="font-semibold text-[var(--text-primary)]">{filteredItems.length}</span> items on page{" "}
                    <span className="font-semibold text-[var(--text-primary)]">{itemsPage}</span> of{" "}
                    <span className="font-semibold text-[var(--text-primary)]">{itemsTotalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => setItemsPage?.((p: number) => Math.max(1, p - 1))}
                      disabled={itemsPage === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-1 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <ArrowDown className="h-4 w-4 rotate-90" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setItemsPage?.((p: number) => Math.min(itemsTotalPages || 1, p + 1))}
                      disabled={itemsPage === itemsTotalPages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-1 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Next</span>
                      <ArrowDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: Batch Lots & FEFO */}
      {activeSubTab === "batches" && (
        <div className="space-y-4">
          {/* Header & Controls Toolbar */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Package className="h-4 w-4 text-[var(--accent-brand)]" />
                  Unique Arrival Batch Lots &amp; FEFO Tracking
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Showing <span className="font-semibold text-[var(--text-primary)]">{filteredAndSortedBatches.length}</span> of {batches.length} arrival lots.
                </p>
              </div>

              {/* Sort Selector Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap flex items-center gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                  Sort By:
                </label>
                <select
                  value={batchSortOption}
                  onChange={(e) => setBatchSortOption(e.target.value as BatchSortOption)}
                  className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none transition cursor-pointer"
                >
                  <option value="expiry_asc">⏳ Earliest Expiry / Shelf Deadline First (FEFO)</option>
                  <option value="expiry_desc">⌛ Latest Expiry / Shelf Deadline First</option>
                  <option value="recent">⏱️ Most Recent Arrival (Default)</option>
                  <option value="oldest">🕰️ Oldest Arrival (FIFO)</option>
                  <option value="shelf_life_asc">🌿 Shelf Life: Shortest Alert First</option>
                  <option value="alpha_asc">🔤 Product Name: A → Z</option>
                  <option value="alpha_desc">🔤 Product Name: Z → A</option>
                  <option value="stock_desc">📦 Remaining Stock: High → Low</option>
                  <option value="stock_asc">📉 Remaining Stock: Low → High</option>
                  <option value="batch_num">🏷️ Batch Number (A → Z)</option>
                </select>
              </div>
            </div>

            {/* Filter & Search Sub-bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search batch #, product, or barcode..."
                  value={batchSearchQuery}
                  onChange={(e) => setBatchSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-7 text-xs text-[var(--text-primary)] focus:border-[var(--accent-brand)] focus:outline-none"
                />
                {batchSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBatchSearchQuery("")}
                    className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                <button
                  type="button"
                  onClick={() => setBatchStatusFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                    batchStatusFilter === "ALL"
                      ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                      : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  All ({batchCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchStatusFilter("ACTIVE")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                    batchStatusFilter === "ACTIVE"
                      ? "bg-emerald-500 text-white shadow-xs"
                      : "bg-[var(--bg-surface-elevated)] text-emerald-500/80 hover:text-emerald-400"
                  }`}
                >
                  Active ({batchCounts.active})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchStatusFilter("EXPIRING_SOON")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                    batchStatusFilter === "EXPIRING_SOON"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-[var(--bg-surface-elevated)] text-amber-500/80 hover:text-amber-400"
                  }`}
                >
                  Expiring Soon ({batchCounts.expiring})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchStatusFilter("EXPIRED")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                    batchStatusFilter === "EXPIRED"
                      ? "bg-rose-500 text-white shadow-xs"
                      : "bg-[var(--bg-surface-elevated)] text-rose-500/80 hover:text-rose-400"
                  }`}
                >
                  Expired ({batchCounts.expired})
                </button>
                <button
                  type="button"
                  onClick={() => setBatchStatusFilter("DEPLETED")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                    batchStatusFilter === "DEPLETED"
                      ? "bg-gray-600 text-white shadow-xs"
                      : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  Depleted ({batchCounts.depleted})
                </button>
                {batchCounts.oversold > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchStatusFilter("OVERSOLD")}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                      batchStatusFilter === "OVERSOLD"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-rose-500/15 text-rose-400 hover:text-rose-300"
                    }`}
                  >
                    Oversold ({batchCounts.oversold})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Batches Table with interactive sort headers */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider select-none">
                  <tr>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)] transition"
                      onClick={() => setBatchSortOption(batchSortOption === "batch_num" ? "recent" : "batch_num")}
                      title="Sort by Batch Number"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Batch Number</span>
                        {batchSortOption === "batch_num" ? (
                          <ArrowUp className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : batchSortOption === "recent" ? (
                          <ArrowDown className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)] transition"
                      onClick={() => setBatchSortOption(batchSortOption === "alpha_asc" ? "alpha_desc" : "alpha_asc")}
                      title="Sort by Product Name"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Product Name</span>
                        {batchSortOption === "alpha_asc" ? (
                          <ArrowUp className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : batchSortOption === "alpha_desc" ? (
                          <ArrowDown className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Initial Gross Qty</th>
                    <th className="py-3 px-4">Sorted Usable Qty</th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)] transition"
                      onClick={() => setBatchSortOption(batchSortOption === "stock_desc" ? "stock_asc" : "stock_desc")}
                      title="Sort by Remaining Stock"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Remaining</span>
                        {batchSortOption === "stock_desc" ? (
                          <ArrowDown className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : batchSortOption === "stock_asc" ? (
                          <ArrowUp className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)] transition"
                      onClick={() => setBatchSortOption(batchSortOption === "expiry_asc" ? "expiry_desc" : "expiry_asc")}
                      title="Sort by Expiry Date"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Expiry / Shelf Life</span>
                        {batchSortOption === "expiry_asc" ? (
                          <ArrowUp className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : batchSortOption === "expiry_desc" ? (
                          <ArrowDown className="h-3 w-3 text-[var(--accent-brand)]" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredAndSortedBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[var(--text-muted)]">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="font-semibold text-xs text-[var(--text-primary)]">No matching batch records found</p>
                        <p className="text-[11px] mt-1">Try adjusting your search query, status filter, or sorting option.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedBatches.map((b) => {
                      const matchedItem = items.find((it) => it.id === b.item_id);
                      const shelfLifeHours = b.shelf_life_alert_hrs ?? matchedItem?.shelf_life_alert_hrs;
                      return (
                        <tr
                          key={b.id}
                          className="hover:bg-[var(--bg-surface-elevated)] transition"
                        >
                          <td className="py-3 px-4 font-mono font-bold text-[var(--accent-brand)]">
                            <div>{b.batch_number}</div>
                            {b.intake_date && (
                              <div className="text-[10px] text-[var(--text-muted)] font-normal flex items-center gap-1 mt-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {parseUTCDate(b.intake_date).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[var(--text-primary)]">
                              {b.item_name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {b.item_barcode && (
                                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                  {b.item_barcode}
                                </span>
                              )}
                              {shelfLifeHours != null && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                  <Hourglass className="h-2.5 w-2.5" />
                                  {shelfLifeHours >= 24 && shelfLifeHours % 24 === 0
                                    ? `${shelfLifeHours / 24}d (${shelfLifeHours}h)`
                                    : `${shelfLifeHours}h`}{" "}
                                  shelf life
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                            {Number(b.initial_quantity ?? b.quantity).toFixed(2)} {b.unit}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                            {Number(b.quantity).toFixed(2)} {b.unit}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold">
                            {Number(b.remaining_quantity) < 0 ? (
                              <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                                {b.remaining_quantity} {b.unit}
                              </span>
                            ) : (
                              <span className="text-emerald-400">
                                {b.remaining_quantity} {b.unit}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">
                            {(() => {
                              const meta = getBatchFreshnessMeta(b, matchedItem);

                              if (meta.effectiveDeadline == null) {
                                return (
                                  <span className="text-[var(--text-muted)] italic text-[11px]">
                                    No Expiry (Non-perishable)
                                  </span>
                                );
                              }

                              const deadlineDate = new Date(meta.effectiveDeadline);
                              const formattedDate = deadlineDate.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              });

                              return (
                                <div className="space-y-1">
                                  {/* Lead deadline badge */}
                                  <div>
                                    {meta.isExpired ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 font-mono bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-md">
                                        <AlertCircle className="h-3 w-3" />
                                        Expired {Math.abs(meta.daysUntilDeadline!)}d ago ({formattedDate})
                                      </span>
                                    ) : meta.isExpiringSoon ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 font-mono bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                                        <Clock className="h-3 w-3" />
                                        In {meta.hoursUntilDeadline != null && meta.hoursUntilDeadline <= 48 ? `${meta.hoursUntilDeadline}h` : `${meta.daysUntilDeadline}d`} ({formattedDate})
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-primary)] font-mono">
                                        <Calendar className="h-3 w-3 text-sky-400" />
                                        {formattedDate} ({meta.daysUntilDeadline}d left)
                                      </span>
                                    )}
                                  </div>

                                  {/* Sub-label showing if shelf life or expiry took lead */}
                                  {meta.expiryTime != null && meta.shelfDeadline != null ? (
                                    <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 pt-0.5">
                                      <span className="font-semibold text-cyan-400">
                                        {meta.leadType === "SHELF_LIFE" ? "⚡ Shelf life leads (shorter)" : "⏳ Expiry leads (shorter)"}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {meta.leadType === "SHELF_LIFE"
                                          ? `Exp: ${new Date(meta.expiryTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
                                          : `Shelf: ${meta.shelfLifeHours}h`}
                                      </span>
                                    </div>
                                  ) : meta.leadType === "SHELF_LIFE" ? (
                                    <span className="text-[10px] text-[var(--text-muted)] block">
                                      ({meta.shelfLifeHours}h shelf life from arrival)
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-4">
                            {(() => {
                              const meta = getBatchFreshnessMeta(b, matchedItem);
                              return (
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    meta.effectiveStatus === "OVERSOLD"
                                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                      : meta.effectiveStatus === "ACTIVE"
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                      : meta.effectiveStatus === "EXPIRING_SOON"
                                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                      : meta.effectiveStatus === "EXPIRED"
                                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                      : "bg-gray-500/15 text-[var(--text-muted)] border border-[var(--border-subtle)]"
                                  }`}
                                >
                                  {meta.effectiveStatus === "EXPIRING_SOON"
                                    ? "Expiring Soon"
                                    : meta.effectiveStatus === "ACTIVE"
                                    ? "Active"
                                    : meta.effectiveStatus === "EXPIRED"
                                    ? "Expired"
                                    : meta.effectiveStatus === "DEPLETED"
                                    ? "Depleted"
                                    : "Oversold"}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEditBatch(b);
                                  setIsEditBatchModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
                                title="Edit batch lot number, arrival date, expiry, or notes"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAdjustBatch(b);
                                  setIsAdjustModalOpen(true);
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition cursor-pointer ${
                                  Number(b.remaining_quantity) < 0
                                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                }`}
                                title={Number(b.remaining_quantity) < 0 ? "Reconcile oversold deficit stock" : "Adjust stock, return to supplier (issue bill), or void batch"}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {Number(b.remaining_quantity) < 0 ? "Reconcile Stock" : "Adjust / Return"}
                              </button>

                              {matchedItem && (
                                (() => {
                                  const isBatchEmpty = parseFloat(String(b.remaining_quantity)) <= 0;
                                  return (
                                    <button
                                      type="button"
                                      disabled={isBatchEmpty}
                                      onClick={() => openWastageModal(matchedItem, b)}
                                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                        isBatchEmpty
                                          ? "border-gray-500/20 bg-gray-500/10 text-gray-500 cursor-not-allowed opacity-50"
                                          : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                                      }`}
                                      title={isBatchEmpty ? "Batch has 0 remaining stock" : "Log wastage write-off"}
                                    >
                                      <PackageX className="h-3.5 w-3.5" />
                                      Write Off
                                    </button>
                                  );
                                })()
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {batchesTotalPages && batchesTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 sm:px-6 rounded-b-2xl shadow-sm">
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Showing <span className="font-semibold text-[var(--text-primary)]">{filteredAndSortedBatches.length}</span> batches on page{" "}
                    <span className="font-semibold text-[var(--text-primary)]">{batchesPage}</span> of{" "}
                    <span className="font-semibold text-[var(--text-primary)]">{batchesTotalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => setBatchesPage?.((p: number) => Math.max(1, p - 1))}
                      disabled={batchesPage === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-1 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Previous</span>
                      <ArrowDown className="h-4 w-4 rotate-90" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setBatchesPage?.((p: number) => Math.min(batchesTotalPages || 1, p + 1))}
                      disabled={batchesPage === batchesTotalPages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-1 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Next</span>
                      <ArrowDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab: Suppliers & Vendors Directory */}
      {activeSubTab === "suppliers" && (
        <div className="space-y-4">
          {/* Header Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search vendor name, phone, email, location..."
                value={supplierSearchQuery}
                onChange={(e) => setSupplierSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-xs text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
              />
            </div>

            {setIsAddSupplierModalOpen && (
              <button
                type="button"
                onClick={() => setIsAddSupplierModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs font-bold shadow-md transition active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                + Add New Supplier
              </button>
            )}
          </div>

          {/* Suppliers List Table */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Supplier / Company Name</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Location / Address</th>
                    <th className="py-3 px-4">Registered Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Building2 className="h-10 w-10 text-purple-400/50" />
                          <p className="text-sm font-medium text-[var(--text-muted)]">
                            {supplierSearchQuery.trim()
                              ? "No suppliers match your search query."
                              : "No registered suppliers found. Add vendors to track inward stock arrivals."}
                          </p>
                          {setIsAddSupplierModalOpen && (
                            <button
                              type="button"
                              onClick={() => setIsAddSupplierModalOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-md transition active:scale-95 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                              + Add First Supplier
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-[var(--bg-surface-elevated)] transition">
                        <td className="py-3 px-4 font-bold text-[var(--text-primary)]">
                          <span className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              <Building2 className="h-3.5 w-3.5" />
                            </span>
                            {s.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                          {s.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                              {s.phone}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">
                          {s.email ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                              {s.email}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs truncate">
                          {s.address ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-[var(--text-muted)] flex-shrink-0" />
                              {s.address}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[var(--text-muted)]">
                          {parseUTCDate(s.created_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {openEditSupplierModal && (
                            <button
                              type="button"
                              onClick={() => openEditSupplierModal(s)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-purple-400 transition"
                              title="Edit Supplier"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Stock Movement Ledger */}
      {activeSubTab === "ledger" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  Stock Movement Audit Ledger
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Immutable audit trail of all inwarding, auto-deductions, and manual wastage adjustments.
                </p>
              </div>

              {/* Ledger Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={ledgerFilterType}
                  onChange={(e) => setLedgerFilterType(e.target.value as any)}
                  className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="">All Change Types</option>
                  <option value="INTAKE">Stock Intake / Inwarding</option>
                  <option value="AUTO_DEDUCTION">POS Auto-Deduction</option>
                  <option value="OVERSOLD">POS Oversold Deficit</option>
                  <option value="MANUAL_ADJUSTMENT">Manual / Wastage Adjustment</option>
                  <option value="RESTOCK">Customer Return / Deficit Restock</option>
                  <option value="PURCHASE_RETURN">Supplier Purchase Return</option>
                  <option value="VOID_BATCH">Void / Discarded Batch</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Batch No.</th>
                    <th className="py-3 px-4">Change Type</th>
                    <th className="py-3 px-4">Quantity Delta</th>
                    <th className="py-3 px-4">Batch Balance</th>
                    <th className="py-3 px-4">Total Store Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                        No movement ledger entries found.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((row) => {
                      const deltaNum = parseFloat(row.quantity_change) || 0;
                      const isPositive = deltaNum > 0;
                      const bBalNum = row.batch_balance != null ? parseFloat(String(row.batch_balance)) : null;

                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-[var(--bg-surface-elevated)] transition"
                        >
                          <td className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                            {new Date(row.created_at + (row.created_at.endsWith("Z") ? "" : "Z")).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                            {row.item_name || "—"}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px]">
                            {row.batch_number ? (
                              <span className={row.batch_number.includes("-OV-") ? "text-amber-400 font-semibold" : "text-[var(--text-secondary)]"}>
                                #{row.batch_number}
                              </span>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                                String(row.change_type).toUpperCase().includes("OVERSOLD")
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                  : String(row.change_type).toUpperCase().includes("INTAKE")
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : String(row.change_type).toUpperCase().includes("RESTOCK")
                                  ? "bg-sky-500/10 text-sky-500"
                                  : String(row.change_type).toUpperCase().includes("DEDUCTION")
                                  ? "bg-orange-500/10 text-orange-400"
                                  : String(row.change_type).toUpperCase().includes("PURCHASE_RETURN")
                                  ? "bg-rose-500/10 text-rose-500"
                                  : String(row.change_type).toUpperCase().includes("VOID")
                                  ? "bg-rose-500/10 text-rose-500"
                                  : String(row.change_type).toUpperCase().includes("MANUAL_ADJUSTMENT")
                                  ? "bg-purple-500/10 text-purple-400"
                                  : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border border-[var(--border-strong)]"
                              }`}
                            >
                              {row.change_type === "MANUAL_ADJUSTMENT"
                                ? ((row as any).reason ? `WASTAGE / ADJ. (${(row as any).reason})` : "WASTAGE / ADJ.")
                                : row.change_type === "OVERSOLD"
                                ? "OVERSOLD"
                                : row.change_type === "RESTOCK"
                                ? "RESTOCK"
                                : row.change_type}
                            </span>
                            {row.notes && (
                              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 max-w-[240px] truncate" title={row.notes}>
                                {row.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold">
                            <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                              {isPositive ? `+${deltaNum}` : deltaNum} {row.unit || ""}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold">
                            {bBalNum != null ? (
                              <span className={bBalNum < 0 ? "text-amber-400" : "text-[var(--text-primary)]"}>
                                {bBalNum} {row.unit || ""}
                              </span>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[var(--text-secondary)]">
                            {row.resulting_stock} {row.unit || ""}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Register Modal (First-time scan onboarding & Inward Stock) */}
      <BarcodeRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => {
          setIsRegisterModalOpen(false);
          setPrefillItem(null);
        }}
        barcode={unregisteredBarcode}
        categories={categories}
        items={items}
        suppliers={suppliers}
        prefillItem={prefillItem}
        scaleBarcodeFormat={restaurant?.weighing_scale_barcode_format}
        onOpenAddSupplierModal={() => setIsAddSupplierModalOpen?.(true)}
        onSuccess={(name, stock) => {
          console.log(`Registered ${name} with initial stock ${stock}`);
          setPrefillItem(null);
        }}
        onboardItem={onboardScannedItem}
      />

      {/* Batch History Slide-over Drawer */}
      {fetchBatches && (
        <BatchHistoryDrawer
          isOpen={isBatchDrawerOpen}
          onClose={() => closeBatchDrawer?.()}
          item={selectedBatchItem || null}
          fetchBatches={fetchBatches}
          onLogWastageClick={(itm, b) => openWastageModal(itm, b)}
          onAddStockClick={(itm) => {
            setScannedBarcode("");
            setPrefillItem(itm);
            setIsRegisterModalOpen(true);
          }}
          onEditBatchClick={(b) => {
            setSelectedEditBatch(b);
            setIsEditBatchModalOpen(true);
          }}
          onAdjustBatchClick={(b) => {
            setSelectedAdjustBatch(b);
            setIsAdjustModalOpen(true);
          }}
          onDeleteBatchClick={async (b) => {
            if (deleteBatch) {
              try {
                await deleteBatch(b.id);
                closeBatchDrawer?.();
              } catch (err: any) {
                setLocalError(err.message || "Failed to delete batch");
              }
            }
          }}
        />
      )}

      {/* Add New Supplier Modal */}
      {createSupplier && (
        <AddSupplierModal
          isOpen={isAddSupplierModalOpen}
          onClose={() => {
            setIsAddSupplierModalOpen?.(false);
            setEditingSupplier?.(undefined);
          }}
          createSupplier={createSupplier}
          updateSupplier={updateSupplier}
          editingSupplier={editingSupplier}
        />
      )}

      {/* Log Wastage / Write-Off Modal */}
      <LogWastageModal
        isOpen={isWastageModalOpen}
        onClose={closeWastageModal}
        item={selectedWastageItem}
        batch={selectedWastageBatch}
        batches={batches}
        onLogWastage={logWastage}
      />

      {/* Adjust Batch Stock Modal */}
      <AdjustBatchStockModal
        isOpen={isAdjustModalOpen}
        onClose={() => {
          setIsAdjustModalOpen(false);
          setSelectedAdjustBatch(null);
        }}
        batch={selectedAdjustBatch}
        item={items.find((i) => i.id === selectedAdjustBatch?.item_id)}
        suppliers={suppliers}
        authToken={authToken}
        onSuccess={async (res) => {
          if (fetchBatches) await fetchBatches();
          if (fetchItems) await fetchItems();
          // If return bill generated, fetch details and open ReturnBillModal
          if (res.return_id) {
            try {
              const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
              const r = await fetch(`${apiBase}/api/admin/inventory/purchase-returns/${res.return_id}`, {
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              });
              if (r.ok) {
                const returnData = await r.json();
                setSelectedReturnBill(returnData);
                setIsReturnBillModalOpen(true);
              }
            } catch (err) {
              console.error("Failed to load return bill details:", err);
            }
          }
        }}
      />

      {/* Edit Batch Metadata & Pricing Modal */}
      <EditBatchModal
        isOpen={isEditBatchModalOpen}
        onClose={() => {
          setIsEditBatchModalOpen(false);
          setSelectedEditBatch(null);
        }}
        batch={selectedEditBatch}
        item={items.find((i) => i.id === selectedEditBatch?.item_id)}
        suppliers={suppliers}
        onSave={async (batchId, data) => {
          if (updateBatchMetadata) {
            await updateBatchMetadata(batchId, data);
          }
        }}
      />

      {/* Return Bill Modal */}
      <ReturnBillModal
        isOpen={isReturnBillModalOpen}
        onClose={() => {
          setIsReturnBillModalOpen(false);
          setSelectedReturnBill(null);
        }}
        purchaseReturn={selectedReturnBill}
      />
      {/* Print Barcodes Modal */}
      <PrintBarcodesModal
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setSelectedPrintItem(null);
        }}
        item={selectedPrintItem}
        restaurant={restaurant}
      />

      {/* Delete Inventory Item Confirmation Modal */}
      <DeleteInventoryModal
        isOpen={isDeleteModalOpen}
        item={selectedDeleteItem}
        batches={batches}
        onOpenBatchDrawer={openBatchDrawer}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedDeleteItem(null);
        }}
        onConfirm={async (itemId) => {
          if (deleteInventoryItem) {
            await deleteInventoryItem(itemId);
          }
        }}
      />

      {/* Edit Inventory Item Modal */}
      <EditInventoryModal
        isOpen={isEditOpen}
        onClose={handleCloseEditItem}
        item={activeEditItem}
        existingCategories={Array.from(new Set(items.map((i) => i.category).filter(Boolean)))}
        onSave={async (itemId, data) => {
          if (updateInventoryItem) {
            await updateInventoryItem(itemId, data);
          } else {
            const res = await fetch(`/api/admin/inventory/items/${itemId}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.detail || "Failed to update item");
            }
            if (fetchItems) await fetchItems();
            if (fetchBatches) await fetchBatches();
          }
        }}
      />
    </div>
  );
}
