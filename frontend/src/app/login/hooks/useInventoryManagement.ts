"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BatchDetail,
  BatchExpiryAlert,
  InventoryItem,
  InventoryUnit,
  RecipeIngredient,
  ScanLookupResponse,
  StockChangeType,
  StockIntake,
  StockLedgerEntry,
  Supplier,
  WastageReason,
} from "@/types";
import { isAuthError } from "../adminUtils";

export type InventoryTabType =
  | "items"
  | "intake"
  | "batches"
  | "recipes"
  | "ledger"
  | "alerts"
  | "suppliers";

export interface ScanFeedItem {
  id: string;
  barcode: string;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  newStock: string;
  timestamp: string;
  batchNumber?: string;
}

export function useInventoryManagement(
  apiRequest: <T>(url: string, options?: RequestInit) => Promise<T>,
  playBeep?: (freq?: number) => void,
  enabled: boolean = true,
  onItemOnboarded?: (item: InventoryItem, hadSellingPrice: boolean) => void
) {
  const [activeSubTab, setActiveSubTabState] = useState<InventoryTabType>("items");
  const [inventoryViewMode, setInventoryViewMode] = useState<"combined" | "batches">("combined");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("admin_inventory_subtab") as InventoryTabType;
      if (saved && ["items", "intake", "batches", "recipes", "ledger", "alerts", "suppliers"].includes(saved)) {
        setActiveSubTabState(saved);
      }
    }
  }, []);

  const setActiveSubTab = useCallback((subtab: InventoryTabType) => {
    setActiveSubTabState(subtab);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin_inventory_subtab", subtab);
    }
  }, []);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsTotalPages, setItemsTotalPages] = useState(1);
  const [itemsTotal, setItemsTotal] = useState(0);

  const [batches, setBatches] = useState<BatchDetail[]>([]);
  const [batchesPage, setBatchesPage] = useState(1);
  const [batchesTotalPages, setBatchesTotalPages] = useState(1);
  const [batchesTotal, setBatchesTotal] = useState(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<BatchExpiryAlert[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<StockLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize] = useState(20);
  const [ledgerFilterItem, setLedgerFilterItem] = useState<string>("");
  const [ledgerFilterType, setLedgerFilterType] = useState<StockChangeType | "">("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanQty, setScanQty] = useState<number>(1);
  const [scanWeight, setScanWeight] = useState<number | "">("");
  
  // Batch History Drawer state
  const [selectedBatchItem, setSelectedBatchItem] = useState<InventoryItem | null>(null);
  const [isBatchDrawerOpen, setIsBatchDrawerOpen] = useState(false);

  // Edit Item Modal state
  const [selectedEditItem, setSelectedEditItem] = useState<InventoryItem | null>(null);
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);

  // Supplier Modal
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>();

  // Barcode Scanner Station state
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState("");
  const [scanFeed, setScanFeed] = useState<ScanFeedItem[]>([]);

  // Wastage Modal state
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [selectedWastageItem, setSelectedWastageItem] = useState<InventoryItem | null>(null);
  const [selectedWastageBatch, setSelectedWastageBatch] = useState<BatchDetail | null>(null);

  // Load ALL inventory items (no server-side pagination).
  // ~500 items is ~200-300KB, loads instantly, and enables
  // client-side search/filter/sort on the full dataset.
  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiRequest<any>(`/api/admin/inventory/items`);
      if (Array.isArray(data)) {
        setItems(data);
        setItemsTotalPages(1);
        setItemsTotal(data.length);
      } else if (data.items !== undefined) {
        setItems(data.items);
        setItemsTotalPages(1);
        setItemsTotal(data.items.length);
      }
    } catch (err: any) {
      if (isAuthError(err)) return;
      setError(err?.message || "Failed to load inventory items");
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest]);

  // Load suppliers list
  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await apiRequest<Supplier[]>("/api/admin/inventory/suppliers");
      setSuppliers(data || []);
    } catch (err: any) {
      if (isAuthError(err)) return;
      console.error("Failed to load suppliers:", err);
    }
  }, [apiRequest]);

  const createSupplier = useCallback(
    async (data: { name: string; phone?: string; email?: string; address?: string }) => {
      const created = await apiRequest<Supplier>("/api/admin/inventory/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setSuppliers((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      return created;
    },
    [apiRequest]
  );

  const updateSupplier = useCallback(
    async (supplierId: string, data: any) => {
      const updated = await apiRequest<Supplier>(`/api/admin/inventory/suppliers/${supplierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? updated : s))
      );
      return updated;
    },
    [apiRequest]
  );

  const openEditSupplierModal = useCallback((supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsAddSupplierModalOpen(true);
  }, []);

  // Load batches with FEFO status (optionally filter by itemId)
  const fetchBatches = useCallback(
    async (itemId?: string, page: number = batchesPage, pageSize: number = 50): Promise<BatchDetail[]> => {
      try {
        let url = `/api/admin/inventory/batches?page=${page}&page_size=${pageSize}`;
        if (itemId) {
          url += `&item_id=${encodeURIComponent(itemId)}`;
        }
        const data = await apiRequest<any>(url);
        
        let batchItems = [];
        if (data.items !== undefined) {
            batchItems = data.items;
            if (!itemId) {
                setBatchesTotalPages(data.total_pages);
                setBatchesTotal(data.total);
            }
        } else {
            batchItems = data;
            if (!itemId) {
                setBatchesTotalPages(1);
                setBatchesTotal(data.length);
            }
        }

        if (!itemId) {
          setBatches(batchItems);
        }
        return batchItems;
      } catch (err: any) {
        if (isAuthError(err)) return [];
        console.error("Failed to load batches:", err);
        return [];
      }
    },
    [apiRequest, batchesPage]
  );

  // Load expiry alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await apiRequest<BatchExpiryAlert[]>(
        "/api/admin/inventory/near-expiry-alerts"
      );
      setAlerts(data);
    } catch (err: any) {
      if (isAuthError(err)) return;
      console.error("Failed to load expiry alerts:", err);
    }
  }, [apiRequest]);

  // Load paginated stock ledger
  const fetchLedger = useCallback(async () => {
    try {
      let url = `/api/admin/inventory/ledger?page=${ledgerPage}&page_size=${ledgerPageSize}`;
      if (ledgerFilterItem) url += `&item_id=${ledgerFilterItem}`;
      if (ledgerFilterType) url += `&change_type=${ledgerFilterType}`;

      const data = await apiRequest<{
        items: StockLedgerEntry[];
        total: number;
        page: number;
        total_pages: number;
      }>(url);
      setLedgerEntries(data.items);
      setLedgerTotal(data.total);
    } catch (err: any) {
      if (isAuthError(err)) return;
      console.error("Failed to load ledger:", err);
    }
  }, [apiRequest, ledgerPage, ledgerPageSize, ledgerFilterItem, ledgerFilterType]);

  useEffect(() => {
    if (enabled) {
      fetchItems();
      fetchBatches();
      fetchAlerts();
      fetchSuppliers();
    }
  }, [enabled, fetchItems, fetchBatches, fetchAlerts, fetchSuppliers]);

  const openBatchDrawer = (item: InventoryItem) => {
    setSelectedBatchItem(item);
    setIsBatchDrawerOpen(true);
  };

  const closeBatchDrawer = () => {
    setIsBatchDrawerOpen(false);
    setSelectedBatchItem(null);
  };

  const deleteInventoryItem = useCallback(
    async (itemId: string) => {
      try {
        await apiRequest(`/api/admin/inventory/items/${itemId}`, {
          method: "DELETE",
        });
        setItems((prev) => prev.filter((it) => it.id !== itemId));
        return true;
      } catch (err: any) {
        setError(err?.message || "Failed to delete item");
        throw err;
      }
    },
    [apiRequest]
  );

  const deleteBatch = useCallback(
    async (batchId: string) => {
      try {
        await apiRequest(`/api/admin/inventory/batches/${batchId}`, {
          method: "DELETE",
        });
        // We also need to refresh batches and items since stock might have changed
        fetchBatches();
        fetchItems();
        return true;
      } catch (err: any) {
        setError(err?.message || "Failed to delete batch");
        throw err;
      }
    },
    [apiRequest, fetchBatches, fetchItems]
  );

  const updateBatchMetadata = useCallback(
    async (
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
    ) => {
      try {
        const res = await apiRequest(`/api/admin/inventory/batches/${batchId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        await Promise.all([fetchBatches(), fetchItems()]);
        return res;
      } catch (err: any) {
        setError(err?.message || "Failed to update batch details");
        throw err;
      }
    },
    [apiRequest, fetchBatches, fetchItems]
  );

  const openEditItemModal = useCallback((item: InventoryItem) => {
    setSelectedEditItem(item);
    setIsEditItemModalOpen(true);
  }, []);

  const closeEditItemModal = useCallback(() => {
    setIsEditItemModalOpen(false);
    setSelectedEditItem(null);
  }, []);

  const updateInventoryItem = useCallback(
    async (itemId: string, data: any) => {
      try {
        const res = await apiRequest<InventoryItem>(
          `/api/admin/inventory/items/${itemId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        );
        await Promise.all([fetchItems(), fetchBatches()]);
        return res;
      } catch (err: any) {
        setError(err?.message || "Failed to update inventory item");
        throw err;
      }
    },
    [apiRequest, fetchItems, fetchBatches]
  );

  useEffect(() => {
    if (activeSubTab === "ledger") {
      fetchLedger();
    }
  }, [activeSubTab, fetchLedger]);

  // Handle hardware barcode scan event
  const handleBarcodeScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setScannedBarcode(trimmed);

      const effectiveQty = (scanWeight !== "" && scanWeight > 0) ? scanQty * scanWeight : scanQty;

      try {
        // First, check if barcode exists in inventory
        const lookup = await apiRequest<ScanLookupResponse>(
          `/api/admin/inventory/barcode/${encodeURIComponent(trimmed)}`
        );

        if (lookup.found && lookup.item) {
          // Recognized barcode -> Rapid auto-increment
          const updatedItem = await apiRequest<InventoryItem>(
            "/api/admin/inventory/scan-increment",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ barcode: trimmed, quantity: effectiveQty }),
            }
          );

          if (playBeep) playBeep(880); // Higher success tone

          // Update local state
          setItems((prev) =>
            prev.map((it) => (it.id === updatedItem.id ? updatedItem : it))
          );

          // Add to live scan feed
          setScanFeed((prev) => [
            {
              id: Math.random().toString(36).substring(2, 9),
              barcode: trimmed,
              name: updatedItem.name,
              quantity: effectiveQty,
              unit: updatedItem.unit,
              newStock: updatedItem.current_stock,
              timestamp: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 19),
          ]);

          fetchBatches();
        } else {
          // New unrecognized barcode -> Open registration modal
          if (playBeep) playBeep(440); // Alert prompt tone
          setUnregisteredBarcode(trimmed);
          setIsRegisterModalOpen(true);
        }
      } catch (err: any) {
        setError(err?.message || "Failed to process barcode scan");
      }
    },
    [apiRequest, playBeep, fetchBatches, scanQty, scanWeight]
  );

  // First-time scan onboarding submission
  const onboardScannedItem = useCallback(
    async (data: {
      item_id?: string;
      barcode: string;
      name: string;
      category: string;
      unit: InventoryUnit;
      initial_stock: number;
      cost_per_unit: number;
      selling_price?: number;
      reorder_threshold?: number;
      batch_number?: string;
      expiry_date?: string;
      supplier_id?: string;
      margin_type?: string;
      retail_margin_pct?: number;
      mrp_margin_pct?: number;
      wholesale_margin_pct?: number;
      mrp?: number;
      wholesale_price?: number;
      tax_category?: string;
      tax_rate?: number;
      sorted_quantity?: number;
      total_billed_amount?: number;
      hsn_code?: string;
      alternate_units?: Array<{ unit_label: string; conversion_factor: number }>;
    }) => {
      const newItem = await apiRequest<InventoryItem>(
        "/api/admin/inventory/scan-onboard",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      setItems((prev) => [newItem, ...prev.filter((it) => it.id !== newItem.id)]);
      setScanFeed((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          barcode: data.barcode,
          name: newItem.name,
          quantity: data.initial_stock,
          unit: newItem.unit,
          newStock: newItem.current_stock,
          timestamp: new Date().toLocaleTimeString(),
          batchNumber: data.batch_number,
        },
        ...prev.slice(0, 19),
      ]);

      fetchBatches();
      fetchItems();
      if (data.selling_price != null && Number(data.selling_price) > 0) {
        onItemOnboarded?.(newItem, true);
      } else {
        onItemOnboarded?.(newItem, false);
      }
    },
    [apiRequest, fetchBatches, fetchItems, onItemOnboarded]
  );

  // Log stock wastage / write-off
  const logWastage = useCallback(
    async (data: {
      item_id: string;
      quantity: number;
      reason: WastageReason;
      notes?: string;
      batch_number?: string;
    }) => {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        item_id: string;
        item_name: string;
        quantity_wasted: number;
        new_current_stock: string;
        estimated_loss_amount: number;
      }>("/api/admin/inventory/wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Update item in local list
      setItems((prev) =>
        prev.map((it) =>
          it.id === data.item_id
            ? { ...it, current_stock: String(res.new_current_stock) }
            : it
        )
      );

      fetchBatches();
      fetchLedger();
    },
    [apiRequest, fetchBatches, fetchLedger]
  );

  const openWastageModal = (item: InventoryItem, batch?: BatchDetail | null) => {
    setSelectedWastageItem(item);
    setSelectedWastageBatch(batch || null);
    setIsWastageModalOpen(true);
  };

  const closeWastageModal = () => {
    setIsWastageModalOpen(false);
    setSelectedWastageItem(null);
    setSelectedWastageBatch(null);
  };

  const fetchPurchaseReturns = useCallback(async () => {
    try {
      const data = await apiRequest<any[]>("/api/admin/inventory/purchase-returns");
      setPurchaseReturns(data);
    } catch (err: any) {
      if (isAuthError(err)) return;
      console.error("Failed to fetch purchase returns:", err);
    }
  }, [apiRequest]);

  return {
    activeSubTab,
    setActiveSubTab,
    inventoryViewMode,
    setInventoryViewMode,
    items,
    itemsPage,
    setItemsPage,
    itemsTotalPages,
    itemsTotal,
    batches,
    batchesPage,
    setBatchesPage,
    batchesTotalPages,
    batchesTotal,
    suppliers,
    purchaseReturns,
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
    setError,
    fetchItems,
    fetchBatches,
    fetchSuppliers,
    fetchPurchaseReturns,
    createSupplier,
    updateSupplier,
    fetchAlerts,
    fetchLedger,
    // Batch Drawer
    selectedBatchItem,
    isBatchDrawerOpen,
    openBatchDrawer,
    closeBatchDrawer,
    // Edit Item Modal
    selectedEditItem,
    isEditItemModalOpen,
    openEditItemModal,
    closeEditItemModal,
    updateInventoryItem,
    // Supplier Modal
    isAddSupplierModalOpen,
    setIsAddSupplierModalOpen,
    editingSupplier,
    setEditingSupplier,
    openEditSupplierModal,
    // Scanner
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
    // Operations
    deleteInventoryItem,
    deleteBatch,
    updateBatchMetadata,
    // Wastage
    isWastageModalOpen,
    selectedWastageItem,
    selectedWastageBatch,
    openWastageModal,
    closeWastageModal,
    logWastage,
  };
}
