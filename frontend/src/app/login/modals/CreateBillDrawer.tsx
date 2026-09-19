"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Barcode, CreditCard, Minus, Moon, Plus, Receipt, ScanLine, Search, Trash2, X, Flame, Edit3, CheckCircle2, Sparkles, PhoneCall } from "lucide-react";
import type { AdminMenuItem, AdminVariant } from "../adminTypes";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

import { apiRequest } from "../adminUtils";
import { CustomerInsightsModal, CustomerAnalytics } from "./CustomerInsightsModal";
import { OversellBatchModal, type BatchAllocation } from "./OversellBatchModal";
import type { ItemBatchSummary } from "@/types";

export type DraftCartItem = {
  menu_item_id: string;
  variant_id?: string | null;
  selected_batch_id?: string | null;
  selected_batch_number?: string | null;
  allow_oversell?: boolean;
  item_name: string;
  unit_price: number;
  mrp?: number | null;
  tax_rate?: number | null;
  hsn_code?: string | null;
  quantity: number;
  pricing_type?: "RETAIL" | "WHOLESALE";
  is_complimentary: boolean;
  is_custom_price?: boolean;
  selected_unit?: string | null;
  base_unit_price?: number;
  base_mrp?: number | null;
};

export const getUnitFactor = (
  item: AdminMenuItem | undefined,
  selectedUnit: string | null | undefined
): number => {
  if (!item || !selectedUnit) return 1;
  const base = (item.unit_label || "piece").trim().toLowerCase();
  const target = selectedUnit.trim().toLowerCase();
  if (base === target) return 1;
  const altUnit = (item.alternate_units as any[])?.find(
    (au: any) => (au?.unit_label || "").trim().toLowerCase() === target
  );
  return altUnit ? (Number(altUnit.conversion_factor) || 1) : 1;
};

export const stockInUnit = (
  baseStock: number,
  item: AdminMenuItem | undefined,
  selectedUnit: string | null | undefined
): number => {
  const factor = getUnitFactor(item, selectedUnit);
  return factor > 0 ? baseStock * factor : baseStock;
};

export const getUnallocatedBatchStock = (
  batchId: string | null | undefined,
  nominalStock: number, // in base units
  cart: DraftCartItem[],
  excludeCartIndex?: number,
  origItem?: AdminMenuItem,
  selectedUnit?: string | null
): number => {
  if (!batchId) return nominalStock;
  
  const nominalStockInSelectedUnit = stockInUnit(nominalStock, origItem, selectedUnit);

  const alreadyAllocated = cart
    .filter((item, i) => i !== excludeCartIndex && item.selected_batch_id === batchId)
    .reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      // Convert cart item's qty from its selected_unit to base unit
      const itemFactor = getUnitFactor(origItem, item.selected_unit);
      const qtyInBaseUnit = itemFactor > 0 ? qty / itemFactor : qty;
      // Convert base unit to the caller's selectedUnit
      const callerFactor = getUnitFactor(origItem, selectedUnit);
      const qtyInCallerUnit = callerFactor > 0 ? qtyInBaseUnit * callerFactor : qtyInBaseUnit;
      return sum + qtyInCallerUnit;
    }, 0);
    
  return Math.max(0, nominalStockInSelectedUnit - alreadyAllocated);
};

/**
 * Authoritative item price resolver.
 * Priority Rules:
 * 1. Special Offer Price and Evening Price have the HIGHEST priorities over batch/lot rates or catalog prices.
 * 2. If both Special Offer and Evening Price are active simultaneously, whichever is lesser takes precedence.
 * 3. Batch retail_price is used only when no promotional price is active.
 * 4. Variant delta and alternate unit conversion factor are consistently applied.
 */
export function resolveEffectiveItemPrice(
  item: AdminMenuItem | undefined,
  options?: {
    pricingMode?: "RETAIL" | "WHOLESALE";
    eveningPriceActive?: boolean;
    batch?: { retail_price?: number | string | null; mrp?: number | string | null } | null;
    variant?: AdminVariant | null;
    selectedUnit?: string | null;
  }
): {
  unitPrice: number;
  baseUnitPrice: number;
  mrp: number;
  baseMrp: number;
  isOfferApplied: boolean;
  isEveningApplied: boolean;
} {
  if (!item) {
    return {
      unitPrice: 0,
      baseUnitPrice: 0,
      mrp: 0,
      baseMrp: 0,
      isOfferApplied: false,
      isEveningApplied: false,
    };
  }

  const pricingMode = options?.pricingMode ?? "RETAIL";
  const eveningActive = Boolean(options?.eveningPriceActive);

  const hasOffer = Boolean(
    item.is_on_offer &&
    item.offer_price != null &&
    parseFloat(String(item.offer_price)) > 0
  );
  const offerPrice = hasOffer ? parseFloat(String(item.offer_price)) : null;

  // Evening price applies only in RETAIL mode
  const hasEvening = Boolean(
    eveningActive &&
    pricingMode !== "WHOLESALE" &&
    item.evening_price != null &&
    parseFloat(String(item.evening_price)) > 0
  );
  const eveningPrice = hasEvening ? parseFloat(String(item.evening_price)) : null;

  let effectiveBasePrice: number;
  let isOfferApplied = false;
  let isEveningApplied = false;

  if (pricingMode === "WHOLESALE" && item.wholesale_price != null && parseFloat(String(item.wholesale_price)) > 0) {
    const wholesalePrice = parseFloat(String(item.wholesale_price));
    if (hasOffer && offerPrice! < wholesalePrice) {
      effectiveBasePrice = offerPrice!;
      isOfferApplied = true;
    } else {
      effectiveBasePrice = wholesalePrice;
    }
  } else if (hasOffer && hasEvening) {
    if (offerPrice! <= eveningPrice!) {
      effectiveBasePrice = offerPrice!;
      isOfferApplied = true;
    } else {
      effectiveBasePrice = eveningPrice!;
      isEveningApplied = true;
    }
  } else if (hasOffer) {
    effectiveBasePrice = offerPrice!;
    isOfferApplied = true;
  } else if (hasEvening) {
    effectiveBasePrice = eveningPrice!;
    isEveningApplied = true;
  } else {
    // Neither promotion is active; fallback to batch retail price or catalog price
    if (options?.batch?.retail_price != null && !isNaN(Number(options.batch.retail_price))) {
      effectiveBasePrice = Number(options.batch.retail_price);
    } else {
      effectiveBasePrice = parseFloat(String(item.price)) || 0;
    }
  }

  // Base MRP resolution:
  const rawMrp =
    options?.batch?.mrp != null && !isNaN(Number(options.batch.mrp)) && Number(options.batch.mrp) > 0
      ? Number(options.batch.mrp)
      : item.mrp != null && parseFloat(String(item.mrp)) > 0
      ? parseFloat(String(item.mrp))
      : parseFloat(String(item.price)) || effectiveBasePrice;

  let effectiveBaseMrp = Math.max(rawMrp, effectiveBasePrice);

  // Variant price delta
  const variantDelta = options?.variant?.price_delta ? parseFloat(String(options.variant.price_delta)) || 0 : 0;
  effectiveBasePrice += variantDelta;
  effectiveBaseMrp += variantDelta;
  effectiveBaseMrp = Math.max(effectiveBaseMrp, effectiveBasePrice);

  // Unit conversion factor
  const factor = getUnitFactor(item, options?.selectedUnit);
  const unitPrice = factor > 0 ? effectiveBasePrice / factor : effectiveBasePrice;
  const mrp = factor > 0 ? Math.max(effectiveBaseMrp / factor, unitPrice) : Math.max(effectiveBaseMrp, unitPrice);

  return {
    unitPrice,
    baseUnitPrice: effectiveBasePrice,
    mrp,
    baseMrp: effectiveBaseMrp,
    isOfferApplied,
    isEveningApplied,
  };
}


type CreateBillDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  menuItems: AdminMenuItem[];
  variantsByItem: Record<string, AdminVariant[]>;
  draftCartItems: DraftCartItem[];
  setDraftCartItems: React.Dispatch<React.SetStateAction<DraftCartItem[]>>;
  selectedTable: string;
  setSelectedTable: (table: string) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  isWalkIn?: boolean;
  setIsWalkIn?: (walkIn: boolean) => void;
  customerExtraDetail: string;
  setCustomerExtraDetail: (detail: string) => void;
  isInterstate?: boolean;
  setIsInterstate?: (v: boolean) => void;
  placeOfSupply?: string;
  setPlaceOfSupply?: (v: string) => void;
  customerGstin?: string;
  setCustomerGstin?: (v: string) => void;
  customerLegalName?: string;
  setCustomerLegalName?: (v: string) => void;
  handleCreateBill: (instantPayment: boolean) => Promise<void>;
  eveningPriceActive?: boolean;
  restaurant?: import("../adminTypes").RestaurantProfile | null;
  onQuickEditOffer?: (itemId: string, updates: Partial<AdminMenuItem>) => Promise<void>;
  inventoryItems?: { id: string; current_stock?: number | string | null }[];
  menuPage?: number;
  setMenuPage?: (page: number | ((p: number) => number)) => void;
  menuTotalPages?: number;
  editingCompletedBill?: import("@/types").ManualBill | null;
};


function CartItemQuantityInput({
  initialQuantity,
  onQuantityChange,
}: {
  initialQuantity: number;
  onQuantityChange: (q: number) => void;
}) {
  const [localVal, setLocalVal] = useState(initialQuantity.toString());
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(initialQuantity.toString());
    }
  }, [initialQuantity, isFocused]);

  return (
    <input
      type="text"
      value={localVal}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => {
        const val = e.target.value;
        if (/^\d*\.?\d*$/.test(val)) {
          setLocalVal(val);
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed > 0) {
            onQuantityChange(parsed);
          }
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseFloat(localVal);
        if (isNaN(parsed) || parsed <= 0) {
          onQuantityChange(0);
        } else {
          onQuantityChange(parsed);
          setLocalVal(initialQuantity.toString());
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="font-mono font-bold w-12 text-center text-sm bg-transparent border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent-brand)] focus:ring-1 focus:ring-[var(--accent-brand)] rounded outline-none p-0.5 transition-all text-[var(--text-primary)]"
    />
  );
}

function CartItemPriceInput({
  initialPrice,
  onPriceChange,
}: {
  initialPrice: number;
  onPriceChange: (newPrice: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localVal, setLocalVal] = useState(initialPrice.toFixed(2));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setLocalVal(initialPrice.toFixed(2));
    }
  }, [initialPrice, isEditing]);

  const commitPrice = () => {
    const val = parseFloat(localVal);
    if (!isNaN(val) && val >= 0) {
      onPriceChange(val);
    } else {
      setLocalVal(initialPrice.toFixed(2));
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-sky-400 font-bold text-sm">₹</span>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={localVal}
          onChange={(e) => {
            const val = e.target.value;
            if (/^\d*\.?\d*$/.test(val)) {
              setLocalVal(val);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPrice();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setLocalVal(initialPrice.toFixed(2));
              setIsEditing(false);
            }
          }}
          onBlur={commitPrice}
          className="font-mono font-bold w-16 text-left text-sm bg-[var(--bg-surface-elevated)] border border-[var(--accent-brand)] rounded px-1 py-0.5 text-sky-400 outline-none shadow-inner"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
        setTimeout(() => inputRef.current?.select(), 50);
      }}
      className="group/price inline-flex items-center gap-1 hover:bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] border border-transparent px-1 py-0.5 rounded cursor-pointer transition-colors"
      title="Click to edit item price"
    >
      <span className="text-sky-400 font-bold">₹{initialPrice.toFixed(2)}</span>
      <Edit3 className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-60 group-hover/price:opacity-100 group-hover/price:text-sky-400 transition-opacity" />
    </button>
  );
}

export function CreateBillDrawer({
  isOpen,
  onClose,
  menuItems,
  variantsByItem,
  draftCartItems,
  setDraftCartItems,
  selectedTable,
  setSelectedTable,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  isWalkIn = false,
  setIsWalkIn,
  customerExtraDetail,
  setCustomerExtraDetail,
  isInterstate,
  setIsInterstate,
  placeOfSupply,
  setPlaceOfSupply,
  customerGstin,
  setCustomerGstin,
  customerLegalName,
  setCustomerLegalName,
  handleCreateBill,
  eveningPriceActive = false,
  restaurant,
  onQuickEditOffer,
  inventoryItems,
  menuPage,
  setMenuPage,
  menuTotalPages,
  editingCompletedBill,
}: CreateBillDrawerProps) {
  const { isAdminRole } = useAdminAuth();
  const isPrivileged = isAdminRole;

  const inventoryStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (inventoryItems) {
      for (const inv of inventoryItems) {
        if (inv.current_stock !== undefined && inv.current_stock !== null && inv.current_stock !== "") {
          const num = parseFloat(String(inv.current_stock));
          if (!isNaN(num)) {
            map.set(inv.id, num);
          }
        }
      }
    }
    return map;
  }, [inventoryItems]);

  const getEffectiveBatchRemaining = useCallback(
    (curBatch: { id: string; remaining_quantity: string | number }, orig?: AdminMenuItem) => {
      const rawBatchQty = Number(curBatch.remaining_quantity);
      if (!orig?.inventory_item_id) return rawBatchQty;
      const linkedStock = inventoryStockMap.get(orig.inventory_item_id);
      if (linkedStock !== undefined) {
        if (linkedStock <= 0) return 0;
        if ((orig.active_batches?.length || 0) <= 1) {
          return Math.min(rawBatchQty, Math.max(0, linkedStock));
        }
      }
      return rawBatchQty;
    },
    [inventoryStockMap]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [pricingMode, setPricingMode] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [showPhoneRequiredModal, setShowPhoneRequiredModal] = useState<boolean>(false);
  const [phoneHasError, setPhoneHasError] = useState<boolean>(false);

  // B2B GST details expansion state (only if B2B mode is enabled)
  const [showB2bFields, setShowB2bFields] = useState(false);
  useEffect(() => {
    if (restaurant?.b2b_enabled && (customerGstin || customerLegalName)) {
      setShowB2bFields(true);
    }
  }, [customerGstin, customerLegalName, restaurant?.b2b_enabled]);

  // If outlet mode is ALWAYS_ON, ensure isInterstate is set; if OFF, ensure isInterstate is false
  useEffect(() => {
    if (restaurant?.interstate_mode === "ALWAYS_ON" && setIsInterstate && !isInterstate) {
      setIsInterstate(true);
    } else if ((!restaurant?.interstate_mode || restaurant?.interstate_mode === "OFF") && setIsInterstate && isInterstate) {
      setIsInterstate(false);
    }
  }, [restaurant?.interstate_mode, setIsInterstate, isInterstate]);

  // Customer Auto-suggest & Analytics state
  const [customerSuggestions, setCustomerSuggestions] = useState<{ name: string; phone: string; gstin?: string; legal_name?: string; state_code?: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<string>("this_month");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);
  const [insightsModalOpen, setInsightsModalOpen] = useState(false);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);

  // Inline Offer Edit State
  const [inlineEditingOfferId, setInlineEditingOfferId] = useState<string | null>(null);
  const [inlineOfferActive, setInlineOfferActive] = useState(false);
  const [inlineOfferPrice, setInlineOfferPrice] = useState("");
  const [inlineOfferSaving, setInlineOfferSaving] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Oversell state for batch exhaustion & difference splitting
  const [oversellState, setOversellState] = useState<{
    cartItemIndex: number;
    itemName: string;
    selectedBatchId?: string | null;
    selectedBatchNumber: string;
    availableQty: number;
    requestedQty: number;
    activeBatches: ItemBatchSummary[];
  } | null>(null);

  // Inline notification notice for instant batch splitting
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  // Auto-dismiss inlineNotice after 4.5 seconds
  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => {
      setInlineNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  const unallocatedBatchStockMap = useMemo(() => {
    if (!oversellState) return {};
    const map: Record<string, number> = {};
    for (const b of oversellState.activeBatches) {
      map[b.id] = getUnallocatedBatchStock(
        b.id,
        Number(b.remaining_quantity),
        draftCartItems,
        oversellState.cartItemIndex
      );
    }
    return map;
  }, [oversellState, draftCartItems]);

  const handleApplyBatchAllocations = (
    cartItemIndex: number,
    allocations: BatchAllocation[]
  ) => {
    setDraftCartItems((prev) => {
      const baseItem = prev[cartItemIndex];
      if (!baseItem || allocations.length === 0) return prev;

      const newItems: DraftCartItem[] = allocations.map((alloc) => {
        const b = alloc.batch;
        const orig = menuItems.find((m) => m.id === baseItem.menu_item_id);
        const factor = getUnitFactor(orig, baseItem.selected_unit);
        const variant = baseItem.variant_id
          ? variantsByItem[orig?.id || ""]?.find((v) => v.id === baseItem.variant_id)
          : undefined;

        let altPrice: number;
        let baseBatchPrice: number;
        let altMrp: number;
        let baseBatchMrp: number;

        if (baseItem.is_custom_price) {
          baseBatchPrice = baseItem.base_unit_price ?? baseItem.unit_price;
          baseBatchMrp = baseItem.base_mrp ?? baseItem.mrp ?? baseBatchPrice;
          altPrice = factor > 0 ? baseBatchPrice / factor : baseBatchPrice;
          altMrp = factor > 0 ? Math.max(baseBatchMrp / factor, altPrice) : Math.max(baseBatchMrp, altPrice);
        } else {
          const resolved = resolveEffectiveItemPrice(orig, {
            pricingMode: baseItem.pricing_type,
            eveningPriceActive,
            batch: b,
            variant,
            selectedUnit: baseItem.selected_unit,
          });
          altPrice = resolved.unitPrice;
          baseBatchPrice = resolved.baseUnitPrice;
          altMrp = resolved.mrp;
          baseBatchMrp = resolved.baseMrp;
        }

        return {
          ...baseItem,
          quantity: alloc.quantity,
          selected_batch_id: b.id,
          selected_batch_number: b.batch_number,
          unit_price: altPrice,
          base_unit_price: baseBatchPrice,
          mrp: altMrp,
          base_mrp: baseBatchMrp,
          is_custom_price: baseItem.is_custom_price,
          allow_oversell: alloc.allowOversell,
        };
      });

      const newCart = [...prev];
      newCart.splice(cartItemIndex, 1, ...newItems);
      return newCart;
    });
  };

  /**
   * Deterministic FIFO Batch Allocation:
   * When an item quantity is updated, distribute the requested quantity across
   * available active batches in strict FIFO order (oldest first).
   * - Each batch is filled to its maximum capacity.
   * - The next batch takes only the remaining excess.
   * - Reduces or removes subsequent batches when quantity decreases.
   * - Eliminates compounding/absurd counts when typing or re-entering quantities.
   */
  const handleCartItemQuantityChange = (cartIdx: number, newQty: number) => {
    const ci = draftCartItems[cartIdx];
    if (!ci) return;

    const orig = menuItems.find((m) => m.id === ci.menu_item_id);
    const activeBatches = orig?.active_batches || [];

    // Case 1: Quantity <= 0 -> Remove this line
    if (newQty <= 0) {
      setDraftCartItems((prev) => prev.filter((_, i) => i !== cartIdx));
      return;
    }

    // Case 2: Item does not track inventory batches or has no active batches
    if (!orig?.inventory_item_id || activeBatches.length === 0) {
      if (orig?.inventory_item_id && activeBatches.length === 0) {
        if (orig.allow_oversell === false) {
          setInlineNotice(`Item '${orig.name}' is Out of Stock and overselling is disabled.`);
          return;
        }
        const cleanName = ci.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();
        setDraftCartItems((prev) =>
          prev.map((item, i) =>
            i === cartIdx
              ? {
                  ...item,
                  item_name: `${cleanName} [Oversold Backorder]`,
                  quantity: newQty,
                  allow_oversell: true,
                  selected_batch_id: null,
                  selected_batch_number: null,
                }
              : item
          )
        );
        return;
      }
      setDraftCartItems((prev) =>
        prev.map((item, i) => (i === cartIdx ? { ...item, quantity: newQty } : item))
      );
      return;
    }

    // Case 3: Item tracks batches in FIFO order
    const batchIdx = activeBatches.findIndex(
      (b) => b.id === (ci.selected_batch_id || activeBatches[0]?.id)
    );
    const curBatchEffectiveIdx = batchIdx >= 0 ? batchIdx : 0;
    const curBatch = activeBatches[curBatchEffectiveIdx] || activeBatches[0];

    // Batches available for allocation from curBatch forward
    const allocatableBatches = activeBatches.slice(curBatchEffectiveIdx);

    // Identify stock in allocatableBatches used by OTHER items/variants or strictly older lines before cartIdx
    const otherCartLines = draftCartItems.filter((it, idx) => {
      const isThisItem = it.menu_item_id === ci.menu_item_id && it.variant_id === ci.variant_id;
      if (!isThisItem) return true;
      const bIdx = activeBatches.findIndex((b) => b.id === it.selected_batch_id);
      return bIdx >= 0 && bIdx < curBatchEffectiveIdx && idx < cartIdx;
    });

    let qtyRemaining = newQty;
    const allocations: { batch: typeof activeBatches[0]; qty: number; isBackorder: boolean }[] = [];

    for (let k = 0; k < allocatableBatches.length; k++) {
      if (qtyRemaining <= 0) break;
      const b = allocatableBatches[k];
      const effectiveStock = getEffectiveBatchRemaining(b, orig);
      const effectiveStockInSelectedUnit = stockInUnit(effectiveStock, orig, ci.selected_unit);

      const usedByOthersInSelectedUnit = otherCartLines
        .filter((it) => it.selected_batch_id === b.id)
        .reduce((sum, it) => {
          const qty = Number(it.quantity) || 0;
          const itemFactor = getUnitFactor(orig, it.selected_unit);
          const qtyInBaseUnit = itemFactor > 0 ? qty / itemFactor : qty;
          const callerFactor = getUnitFactor(orig, ci.selected_unit);
          const qtyInCallerUnit = callerFactor > 0 ? qtyInBaseUnit * callerFactor : qtyInBaseUnit;
          return sum + qtyInCallerUnit;
        }, 0);
      const availForThisBatch = Math.max(0, effectiveStockInSelectedUnit - usedByOthersInSelectedUnit);

      const take = Math.min(availForThisBatch, qtyRemaining);
      if (take > 0) {
        allocations.push({ batch: b as any, qty: take, isBackorder: false });
        qtyRemaining -= take;
      }
    }

    // Handle any excess beyond total available stock across all batches
    const messages: string[] = [];
    if (qtyRemaining > 0) {
      if (orig?.allow_oversell === false) {
        messages.push(`Total stock reached. ${qtyRemaining} excess blocked (overselling disabled).`);
        qtyRemaining = 0;
      } else {
        const latestBatch = activeBatches[activeBatches.length - 1] || curBatch;
        allocations.push({ batch: latestBatch, qty: qtyRemaining, isBackorder: true });
        messages.push(`Added ${qtyRemaining} as [Oversold Backorder].`);
        qtyRemaining = 0;
      }
    }

    if (allocations.length === 0) {
      if (orig?.allow_oversell === false) {
        setInlineNotice(`Lot #${curBatch.batch_number} is out of stock. Overselling is disabled.`);
        setDraftCartItems((prev) => prev.filter((_, i) => i !== cartIdx));
        return;
      } else {
        allocations.push({ batch: curBatch, qty: newQty, isBackorder: true });
      }
    }

    // Build the new DraftCartItems from allocations
    const factor = getUnitFactor(orig, ci.selected_unit);
    const cleanName = ci.item_name.replace(/\[Oversold Backorder\]/gi, "").trim();

    const newLines: DraftCartItem[] = allocations.map((alloc) => {
      const variant = ci.variant_id
        ? variantsByItem[orig?.id || ""]?.find((v) => v.id === ci.variant_id)
        : undefined;

      let linePrice: number;
      let basePrice: number;
      let lineMrp: number;
      let baseMrp: number;

      if (ci.is_custom_price) {
        basePrice = ci.base_unit_price ?? ci.unit_price;
        baseMrp = ci.base_mrp ?? ci.mrp ?? basePrice;
        linePrice = factor > 0 ? basePrice / factor : basePrice;
        lineMrp = factor > 0 ? Math.max(baseMrp / factor, linePrice) : Math.max(baseMrp, linePrice);
      } else {
        const resolved = resolveEffectiveItemPrice(orig, {
          pricingMode: ci.pricing_type,
          eveningPriceActive,
          batch: alloc.batch,
          variant,
          selectedUnit: ci.selected_unit,
        });
        linePrice = resolved.unitPrice;
        basePrice = resolved.baseUnitPrice;
        lineMrp = resolved.mrp;
        baseMrp = resolved.baseMrp;
      }

      return {
        ...ci,
        item_name: alloc.isBackorder ? `${cleanName} [Oversold Backorder]` : cleanName,
        selected_batch_id: alloc.isBackorder ? null : alloc.batch.id,
        selected_batch_number: alloc.batch.batch_number,
        unit_price: linePrice,
        base_unit_price: basePrice,
        mrp: lineMrp,
        base_mrp: baseMrp,
        quantity: alloc.qty,
        allow_oversell: alloc.isBackorder,
      };
    });

    // Replace old lines for this item/variant at or after cartIdx with the newly allocated lines
    setDraftCartItems((prev) => {
      const indicesToRemove = new Set<number>();
      for (let i = cartIdx; i < prev.length; i++) {
        const it = prev[i];
        if (it.menu_item_id === ci.menu_item_id && it.variant_id === ci.variant_id) {
          indicesToRemove.add(i);
        }
      }
      const nextCart: DraftCartItem[] = [];
      let inserted = false;
      for (let i = 0; i < prev.length; i++) {
        if (i === cartIdx) {
          nextCart.push(...newLines);
          inserted = true;
        } else if (!indicesToRemove.has(i)) {
          nextCart.push(prev[i]);
        }
      }
      if (!inserted) {
        nextCart.push(...newLines);
      }
      return nextCart.filter((it) => it.quantity > 0);
    });

    if (allocations.length > 1) {
      const summary = allocations
        .map((a) => `${a.qty}x ${a.isBackorder ? "[Backorder]" : `Lot #${a.batch.batch_number}`}`)
        .join(" + ");
      setInlineNotice(`FIFO allocated: ${summary}`);
    } else if (messages.length > 0) {
      setInlineNotice(messages.join(" "));
    }
  };

  const handleProceedAsWalkIn = () => {
    setIsWalkIn?.(true);
    setPhoneHasError(false);
    setShowPhoneRequiredModal(false);
    void handleCreateBill(true);
  };

  const handleFocusPhoneInput = () => {
    setShowPhoneRequiredModal(false);
    setPhoneHasError(true);
    setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 100);
  };

  const validateBeforeCreateBill = (proceedToPayment: boolean) => {
    for (let i = 0; i < draftCartItems.length; i++) {
      const ci = draftCartItems[i];
      const orig = menuItems.find((m) => m.id === ci.menu_item_id);
      const curBatch = orig?.active_batches?.find((b) => b.id === ci.selected_batch_id) || orig?.active_batches?.[0];
      if (orig?.inventory_item_id && curBatch && !ci.allow_oversell) {
        const effectiveCurBatchQty = getEffectiveBatchRemaining(curBatch, orig);
        const avail = getUnallocatedBatchStock(curBatch.id, effectiveCurBatchQty, draftCartItems, i, orig, ci.selected_unit);
        if (ci.quantity > avail) {
          handleCartItemQuantityChange(i, ci.quantity);
          return;
        }
      }
    }

    // Compulsory customer phone check on Settle & Collect / Proceed to Payment
    if (proceedToPayment) {
      const cleanPhone = customerPhone.replace(/\D/g, "");
      if (!isWalkIn && cleanPhone.length < 10) {
        setPhoneHasError(true);
        setShowPhoneRequiredModal(true);
        return;
      }
    }

    void handleCreateBill(proceedToPayment);
  };

  useEffect(() => {
    if (!isOpen) {
      setCustomerAnalytics(null);
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      setSearchQuery("");
      setShowPhoneRequiredModal(false);
      setPhoneHasError(false);
    } else {
      // Auto-focus phone input when drawer opens
      setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Keyboard Shortcuts (Enter = Settle, Esc = Close)
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showPhoneRequiredModal) {
          e.preventDefault();
          setShowPhoneRequiredModal(false);
          return;
        }
        e.preventDefault();
        onClose();
        return;
      }
      
      // If pressing enter, and not inside an input (unless we want to allow it? usually inputs intercept enter)
      if (e.key === "Enter") {
        // Only trigger if not focused on an input, OR if we are specifically focused on quantity input
        if (
          e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement || 
          e.target instanceof HTMLButtonElement
        ) {
          return; // Let the focused element handle it natively
        }
        
        e.preventDefault();
        if (draftCartItems.length > 0) {
          validateBeforeCreateBill(true);
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, draftCartItems.length, handleCreateBill, onClose]);

  const fetchCustomerAnalytics = async (phone: string, period: string = analyticsPeriod, sDate: string = startDate, eDate: string = endDate) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return;
    setIsFetchingAnalytics(true);
    try {
      let url = `/api/admin/customers/analytics?phone=${encodeURIComponent(clean)}&period=${period}`;
      if (period === "custom" && sDate) {
        url += `&start_date=${encodeURIComponent(sDate)}`;
        if (eDate) url += `&end_date=${encodeURIComponent(eDate)}`;
      }
      const data = await apiRequest<CustomerAnalytics>(url);
      setCustomerAnalytics(data);
      if (data.customer_name && data.customer_name !== "Walk-In Customer") {
        setCustomerName(data.customer_name);
      }
      if (data.extra_detail) {
        setCustomerExtraDetail(data.extra_detail);
      } else {
        setCustomerExtraDetail("");
      }
      if ((data as any).gstin && setCustomerGstin) {
        setCustomerGstin((data as any).gstin);
      }
      if ((data as any).legal_name && setCustomerLegalName) {
        setCustomerLegalName((data as any).legal_name);
      }
      if ((data as any).state_code && setPlaceOfSupply) {
        setPlaceOfSupply((data as any).state_code);
      }
    } catch {
      /* ignore */
    } finally {
      setIsFetchingAnalytics(false);
    }
  };

  // Search existing customers & auto-fetch analytics when phone reaches 10 digits
  const handlePhoneChange = async (val: string) => {
    setCustomerPhone(val);
    const clean = val.replace(/\D/g, "");
    setHighlightedSuggestionIndex(-1); // Reset highlight when typing

    if (clean.length >= 10) {
      setPhoneHasError(false);
    }
    if (val.trim().length > 0 && isWalkIn) {
      setIsWalkIn?.(false);
    }

    if (clean.length === 10) {
      void fetchCustomerAnalytics(clean);
    }

    if (val.trim().length >= 2) {
      try {
        const data = await apiRequest<any>(`/api/admin/customers?search=${encodeURIComponent(val.trim())}&page=1&page_size=50`);
        setCustomerSuggestions(data.items || data);
        setShowSuggestions(true);
      } catch {
        /* ignore */
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const processBarcodeScan = (barcode: string) => {
    const bcode = barcode.trim().toLowerCase();
    
    // 1. Direct Exact Match (Current Logic)
    let match = menuItems.find(
      (m) => m.barcode && m.barcode.trim().toLowerCase() === bcode
    );
    
    let scannedQuantity = 1;

    // 2. Embedded Weight Scale Logic
    const format = restaurant?.weighing_scale_barcode_format || "21_5I_5W_GRAMS";
    
    if (!match && format.startsWith("CUSTOM:")) {
      const maskStr = format.replace("CUSTOM:", "").replace(/\s/g, "").toUpperCase();
      if (bcode.length === maskStr.length) {
        let pluStr = "";
        let weightStr = "";
        let priceStr = "";

        for (let i = 0; i < maskStr.length; i++) {
          if (maskStr[i] === 'I') pluStr += bcode[i];
          else if (maskStr[i] === 'W') weightStr += bcode[i];
          else if (maskStr[i] === 'P') priceStr += bcode[i];
        }

        if (pluStr) {
          const pluStrParsed = parseInt(pluStr, 10).toString();
          match = menuItems.find((m) => m.barcode === pluStr || m.barcode === pluStrParsed);
          if (match) {
            if (weightStr) {
              const weightGrams = parseInt(weightStr, 10);
              if (!isNaN(weightGrams)) {
                scannedQuantity = weightGrams / 1000;
              }
            } else if (priceStr) {
              const totalPrice = parseInt(priceStr, 10);
              if (!isNaN(totalPrice)) {
                const unitPrice = parseFloat(match.price) || 1;
                scannedQuantity = totalPrice / unitPrice;
              }
            }
          }
        }
      }
    } else if (!match && bcode.length === 13) {
      if (format === "21_5I_5W_GRAMS" && bcode.startsWith("21")) {
        const plu = bcode.substring(2, 7);
        const pluStr = parseInt(plu, 10).toString();
        const weightGrams = parseInt(bcode.substring(7, 12), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(weightGrams)) {
          scannedQuantity = weightGrams / 1000;
        }
      } else if (format === "21_5I_5P_INR" && bcode.startsWith("21")) {
        const plu = bcode.substring(2, 7);
        const pluStr = parseInt(plu, 10).toString();
        const totalPrice = parseInt(bcode.substring(7, 12), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(totalPrice)) {
          const unitPrice = parseFloat(match.price) || 1;
          scannedQuantity = totalPrice / unitPrice;
        }
      } else if (format === "20_6I_4W_GRAMS" && bcode.startsWith("20")) {
        const plu = bcode.substring(2, 8);
        const pluStr = parseInt(plu, 10).toString();
        const weightGrams = parseInt(bcode.substring(8, 12), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(weightGrams)) {
          scannedQuantity = weightGrams / 1000;
        }
      }
    } else if (!match && bcode.length === 10) {
      if (format === "03_3I_5W_GRAMS" && bcode.startsWith("03")) {
        const plu = bcode.substring(2, 5);
        const pluStr = parseInt(plu, 10).toString();
        const weightGrams = parseInt(bcode.substring(5, 10), 10);
        match = menuItems.find((m) => m.barcode === plu || m.barcode === pluStr);
        if (match && !isNaN(weightGrams)) {
          scannedQuantity = weightGrams / 1000;
        }
      }
    }
    
    return { match, scannedQuantity };
  };

  // Hardware barcode scan listener inside POS bill drawer
  useBarcodeScanner({
    onScan: async (barcode) => {
      let { match, scannedQuantity } = processBarcodeScan(barcode);

      if (!match) {
        try {
          const fetchedItem = await apiRequest<AdminMenuItem>(`/api/admin/menu-items/barcode/${barcode.trim()}`);
          if (fetchedItem) match = fetchedItem;
        } catch (e) {
          /* ignore or show notice */
        }
      }

      if (match) {
        const oldestBatch = match.active_batches?.[0];
        const resolved = resolveEffectiveItemPrice(match, {
          pricingMode,
          eveningPriceActive,
          batch: oldestBatch,
          selectedUnit: match.unit_label || "piece",
        });
        const taxRateNum = match.tax_rate ? parseFloat(String(match.tax_rate)) : 0;

        const isOos = match.is_out_of_stock || (match.inventory_item_id && match.current_stock !== undefined && Number(match.current_stock) <= 0);
        if (match.inventory_item_id && isOos && match.allow_oversell === false) {
          setInlineNotice(`'${match.name}' is Out of Stock. Overselling is disabled for this product.`);
          return;
        }

        const isBackorder = Boolean(match.inventory_item_id && isOos && match.allow_oversell !== false);
        const finalDishName = isBackorder ? `${match.name} [Oversold Backorder]` : match.name;

        setDraftCartItems((prev) => {
          const existingIdx = prev.findIndex(
            (ci) => ci.menu_item_id === match!.id && !ci.variant_id && ci.allow_oversell === isBackorder
          );
          if (existingIdx >= 0) {
            return prev.map((ci, i) =>
              i === existingIdx ? { ...ci, quantity: ci.quantity + scannedQuantity } : ci
            );
          }
          return [
            ...prev,
            {
              menu_item_id: match!.id,
              selected_batch_id: isBackorder ? null : (oldestBatch?.id || null),
              selected_batch_number: isBackorder ? null : (oldestBatch?.batch_number || null),
              allow_oversell: isBackorder,
              item_name: finalDishName,
              unit_price: resolved.unitPrice,
              mrp: resolved.mrp,
              tax_rate: taxRateNum,
              hsn_code: (match as any)?.hsn_code || null,
              quantity: scannedQuantity,
              pricing_type: pricingMode,
              is_complimentary: false,
              selected_unit: match!.unit_label || "piece",
              base_unit_price: resolved.baseUnitPrice,
              base_mrp: resolved.baseMrp,
            },
          ];
        });
      }
    },
    enabled: isOpen,
  });

  const [serverSearchItems, setServerSearchItems] = useState<AdminMenuItem[]>([]);
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const q = encodeURIComponent(searchQuery.trim());
      apiRequest<any>(`/api/admin/menu-items?search=${q}&page=1&page_size=50`)
        .then(res => {
          const items = res.items !== undefined ? res.items : res;
          if (Array.isArray(items)) setServerSearchItems(items);
        })
        .catch(() => {});
    } else {
      setServerSearchItems([]);
    }
  }, [searchQuery]);

  const filteredMenuItems = useMemo(() => {
    const combined = [...menuItems];
    serverSearchItems.forEach(si => {
      if (!combined.some(m => m.id === si.id)) combined.push(si);
    });

    if (!searchQuery.trim()) return combined;
    const q = searchQuery.toLowerCase().trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Regex matching start of string OR start of any word (e.g. "f" matches "Fresh" or "New Food", but NOT "tftum")
    const wordBoundaryRegex = new RegExp(`(?:^|[\\s\\-_/()])${escaped}`, "i");

    return combined.filter((m) => {
      const nameMatch = wordBoundaryRegex.test(m.name);
      const barcodeMatch = m.barcode ? m.barcode.toLowerCase().startsWith(q) : false;
      return nameMatch || barcodeMatch;
    });
  }, [menuItems, searchQuery, serverSearchItems]);

  const addItemToCart = useCallback((item: AdminMenuItem, v?: AdminVariant, qty: number = 1) => {
    const linkedStock = item.inventory_item_id ? inventoryStockMap.get(item.inventory_item_id) : undefined;
    const effectiveStock = linkedStock !== undefined ? linkedStock : (item.current_stock !== undefined && item.current_stock !== null ? Number(item.current_stock) : null);
    const isOos = item.is_out_of_stock || (item.inventory_item_id && effectiveStock !== null && effectiveStock <= 0);
    if (item.inventory_item_id && isOos && item.allow_oversell === false) {
      setInlineNotice(`'${item.name}' is Out of Stock. Overselling is disabled for this product.`);
      return;
    }

    const oldestBatch = item.active_batches?.[0];
    const resolved = resolveEffectiveItemPrice(item, {
      pricingMode,
      eveningPriceActive,
      batch: oldestBatch,
      variant: v,
      selectedUnit: item.unit_label || "piece",
    });

    const taxRate = item.tax_rate ? parseFloat(String(item.tax_rate)) : 0;
    const baseDishName = v ? `${item.name} (${v.name})` : item.name;

    const isBackorder = Boolean(item.inventory_item_id && isOos && item.allow_oversell !== false);
    const finalItemName = isBackorder ? `${baseDishName} [Oversold Backorder]` : baseDishName;

    setDraftCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (ci) => ci.menu_item_id === item.id && ci.variant_id === (v ? v.id : null) && ci.allow_oversell === isBackorder
      );
      if (existingIdx >= 0) {
        return prev.map((ci, i) =>
          i === existingIdx ? { ...ci, quantity: ci.quantity + qty } : ci
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          variant_id: v ? v.id : null,
          selected_batch_id: isBackorder ? null : (oldestBatch?.id || null),
          selected_batch_number: isBackorder ? null : (oldestBatch?.batch_number || null),
          allow_oversell: isBackorder,
          item_name: finalItemName,
          unit_price: resolved.unitPrice,
          mrp: resolved.mrp,
          tax_rate: taxRate,
          hsn_code: (item as any)?.hsn_code || null,
          quantity: qty,
          pricing_type: pricingMode,
          is_complimentary: false,
          selected_unit: item.unit_label || "piece",
          base_unit_price: resolved.baseUnitPrice,
          base_mrp: resolved.baseMrp,
        },
      ];
    });
    if (isBackorder) {
      setInlineNotice(`'${item.name}' is out of stock. Added as [Oversold Backorder].`);
    }
  }, [eveningPriceActive, pricingMode, setDraftCartItems, inventoryStockMap]);

  // Sync draft cart prices if menu items are updated (e.g. quick edit offer)
  useEffect(() => {
    setDraftCartItems((prev) => {
      let hasChanges = false;
      const updated = prev.map((ci) => {
        const item = menuItems.find((m) => m.id === ci.menu_item_id);
        if (!item) return ci;
        if (ci.is_complimentary || ci.is_custom_price) return ci;

        const v = ci.variant_id ? variantsByItem[item.id]?.find((variant) => variant.id === ci.variant_id) : undefined;
        const currentBatch = item.active_batches?.find((b) => b.id === ci.selected_batch_id) || item.active_batches?.[0];

        const resolved = resolveEffectiveItemPrice(item, {
          pricingMode: ci.pricing_type,
          eveningPriceActive,
          batch: currentBatch,
          variant: v,
          selectedUnit: ci.selected_unit,
        });

        if (
          resolved.unitPrice !== ci.unit_price ||
          resolved.baseUnitPrice !== ci.base_unit_price ||
          resolved.mrp !== ci.mrp ||
          resolved.baseMrp !== ci.base_mrp
        ) {
          hasChanges = true;
          return {
            ...ci,
            unit_price: resolved.unitPrice,
            base_unit_price: resolved.baseUnitPrice,
            mrp: resolved.mrp,
            base_mrp: resolved.baseMrp,
          };
        }
        return ci;
      });
      return hasChanges ? updated : prev;
    });
  }, [menuItems, eveningPriceActive, variantsByItem, setDraftCartItems]);

  if (!isOpen) return null;

  const subtotal = draftCartItems.reduce(
    (acc, item) => acc + (item.is_complimentary ? 0 : item.unit_price * item.quantity),
    0
  );

  const totalMrp = draftCartItems.reduce(
    (acc, item) => acc + ((item.mrp || item.unit_price) * item.quantity),
    0
  );

  const mrpDiscount = Math.max(0, totalMrp - subtotal);

  const totalTax = draftCartItems.reduce((acc, item) => {
    if (item.is_complimentary) return acc;
    const lineTotal = item.unit_price * item.quantity;
    const rate = item.tax_rate || 0;
    return acc + (lineTotal * (rate / 100));
  }, 0);

  const grandTotalPayable = subtotal;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full max-w-none max-h-none flex flex-col rounded-none border-none bg-[var(--bg-surface)] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[var(--accent-brand)]" />
            <div>
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                {editingCompletedBill ? (
                  <>
                    <span>Edit Bill #{editingCompletedBill.id.slice(0, 8).toUpperCase()}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono font-semibold uppercase">
                      Settlement Mode
                    </span>
                  </>
                ) : (
                  "Create New Manual Bill (POS)"
                )}
              </h3>
              {editingCompletedBill && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Original total: ₹{Number(editingCompletedBill.total_amount || 0).toFixed(2)} • Edits will calculate difference upon settlement and void original bill.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--border-subtle)] text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-[35%_65%] divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)] overflow-hidden">
          {/* Left Column: Product Catalog Picker */}
          <div className="p-4 space-y-3 flex flex-col h-full overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Products Catalog
                </span>
              </div>

              {/* Retail vs Wholesale Pricing Mode Toggle */}
              <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-strong)]">
                <button
                  type="button"
                  onClick={() => setPricingMode("RETAIL")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    pricingMode === "RETAIL"
                      ? "bg-sky-500 text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Retail Price
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode("WHOLESALE")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    pricingMode === "WHOLESALE"
                      ? "bg-sky-500 text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Wholesale Bulk
                </button>
              </div>

              <div className="relative flex-1 max-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search name or barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const query = searchQuery.trim().toLowerCase();
                      if (!query) return;
                      
                      let { match, scannedQuantity } = processBarcodeScan(query);
                      
                      if (!match && filteredMenuItems.length === 1) {
                        match = filteredMenuItems[0];
                        scannedQuantity = 1;
                      }

                      if (!match) {
                        try {
                          const fetchedItem = await apiRequest<AdminMenuItem>(`/api/admin/menu-items/barcode/${query}`);
                          if (fetchedItem) match = fetchedItem;
                        } catch (err) {
                          /* ignore */
                        }
                      }
                      
                      if (match) {
                        const itemVariants = variantsByItem[match.id] || [];
                        if (itemVariants.length === 0) {
                          addItemToCart(match, undefined, scannedQuantity);
                          setSearchQuery("");
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        } else if (itemVariants.length === 1) {
                          addItemToCart(match, itemVariants[0], scannedQuantity);
                          setSearchQuery("");
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        } else {
                          // Let user click variant manually
                        }
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Products Grid (Scrollable list container with fixed boxy card dimensions) */}
            <div className="grid gap-2.5 grid-cols-2 content-start flex-1 min-h-0 overflow-y-auto pr-1">
              {filteredMenuItems.map((item) => {
                const itemVariants = variantsByItem[item.id] || [];
                const oldestBatch = item.active_batches?.[0];
                const resolved = resolveEffectiveItemPrice(item, {
                  pricingMode,
                  eveningPriceActive,
                  batch: oldestBatch,
                });
                const activePriceNum = resolved.unitPrice;
                const mrpVal = resolved.mrp;
                const hasDiscount = mrpVal > activePriceNum;
                const discountPercent = hasDiscount ? Math.round(((mrpVal - activePriceNum) / mrpVal) * 100) : 0;
                const taxRate = item.tax_rate ? parseFloat(String(item.tax_rate)) : 0;
                const cartQtyForItem = draftCartItems.filter((ci) => ci.menu_item_id === item.id).reduce((sum, ci) => sum + ci.quantity, 0);
                const linkedStock = item.inventory_item_id ? inventoryStockMap.get(item.inventory_item_id) : undefined;
                const effectiveStock = linkedStock !== undefined ? linkedStock : (item.current_stock !== undefined && item.current_stock !== null ? Number(item.current_stock) : null);
                const isOos = Boolean(item.is_out_of_stock || (item.inventory_item_id && effectiveStock !== null && effectiveStock <= 0));
                const stockNum = effectiveStock;
                const isBlocked = Boolean(item.inventory_item_id && isOos && item.allow_oversell === false);
                const wholesalePriceNum = item.wholesale_price ? parseFloat(item.wholesale_price) : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isBlocked) {
                        setInlineNotice(`'${item.name}' is Out of Stock. Overselling is disabled for this product.`);
                        return;
                      }
                      if (itemVariants.length === 0) {
                        addItemToCart(item);
                      } else if (itemVariants.length === 1) {
                        addItemToCart(item, itemVariants[0]);
                      }
                    }}
                    className={`group relative rounded-md border p-4 min-h-[140px] h-auto flex flex-col justify-between transition-all duration-150 select-none ${
                      isBlocked
                        ? "cursor-not-allowed opacity-65 border-rose-500/40 bg-rose-500/5 hover:border-rose-500/60"
                        : pricingMode === "WHOLESALE" && wholesalePriceNum !== null
                        ? "cursor-pointer border-purple-500/40 bg-purple-500/5 hover:border-purple-500 shadow-xs"
                        : "cursor-pointer border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] hover:border-sky-500 hover:shadow-md"
                    }`}
                  >
                    {/* Top Badges Row (Text only for OFF & GST, White text on In Cart) */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <div className="flex items-center gap-2 font-semibold">
                        {isOos && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            item.allow_oversell === false
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          }`}>
                            {item.allow_oversell === false ? "OUT OF STOCK" : "OUT OF STOCK"}
                            {stockNum !== null && stockNum < 0 ? ` (${stockNum})` : ""}
                          </span>
                        )}
                        {hasDiscount && (
                          <span className="text-[var(--text-muted)] text-[10px]">
                            {discountPercent}% OFF
                          </span>
                        )}
                        {resolved.isOfferApplied ? (
                          <span title={`Special Offer Active: ₹${parseFloat(String(item.offer_price)).toFixed(2)}`}>
                            <Flame className="h-3.5 w-3.5 text-orange-400 fill-orange-400/20 shrink-0 cursor-pointer" />
                          </span>
                        ) : resolved.isEveningApplied ? (
                          <span title={`Evening Price Active: ₹${parseFloat(String(item.evening_price)).toFixed(2)}`}>
                            <Moon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/20 shrink-0 cursor-pointer" />
                          </span>
                        ) : null}
                        {taxRate > 0 && (
                          <span className="text-[var(--text-muted)] text-[10px]">
                            GST {taxRate}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isPrivileged && (
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setInlineEditingOfferId(item.id);
                              setInlineOfferActive(item.is_on_offer ?? false);
                              setInlineOfferPrice(item.offer_price ? String(item.offer_price) : "");
                              setTimeout(() => inlineInputRef.current?.focus(), 100);
                            }}
                            className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-amber-500 hover:border-amber-500/50 shadow-sm transition-all flex items-center justify-center"
                            title="Quick Edit Offer"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                        )}
                        {cartQtyForItem > 0 && (
                          <span className="rounded-md bg-sky-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs">
                            In Cart: {cartQtyForItem}
                          </span>
                        )}
                      </div>
                    </div>

                    {inlineEditingOfferId === item.id ? (
                      <div className="absolute inset-0 z-20 flex flex-col rounded-md bg-[var(--bg-surface-elevated)] p-3 shadow-2xl border-2 border-amber-500" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">Quick Edit Offer</span>
                          <button onClick={() => setInlineEditingOfferId(null)} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="h-4 w-4"/></button>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input type="checkbox" checked={inlineOfferActive} onChange={e => setInlineOfferActive(e.target.checked)} className="rounded border-[var(--border-strong)] text-amber-500 focus:ring-amber-500 h-4 w-4" />
                          <span className="text-xs font-semibold">Active Offer</span>
                        </label>
                        {inlineOfferActive && (
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-sm font-mono font-bold text-[var(--text-muted)]">₹</span>
                            <input
                              ref={inlineInputRef}
                              type="number"
                              value={inlineOfferPrice}
                              onChange={e => setInlineOfferPrice(e.target.value)}
                              placeholder="Price"
                              className="w-full bg-[var(--bg-surface)] rounded border border-[var(--border-strong)] focus:border-amber-500 outline-none text-sm font-mono font-bold text-amber-500 px-2 py-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && onQuickEditOffer && !inlineOfferSaving) {
                                  e.preventDefault();
                                  void (async () => {
                                    setInlineOfferSaving(true);
                                    let offerExpiresAt = null;
                                    const now = new Date();
                                    const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
                                    const istDateString = istFormatter.format(now);
                                    const midnightIstStr = `${istDateString}T23:59:59.999+05:30`;
                                    offerExpiresAt = new Date(midnightIstStr).toISOString();

                                    await onQuickEditOffer(item.id, {
                                      is_on_offer: true,
                                      offer_price: inlineOfferPrice ? String(inlineOfferPrice) : null,
                                      offer_expires_at: offerExpiresAt as any
                                    });
                                    setInlineOfferSaving(false);
                                    setInlineEditingOfferId(null);
                                  })();
                                }
                              }}
                            />
                          </div>
                        )}
                        <button
                          disabled={inlineOfferSaving}
                          onClick={async () => {
                            if (!onQuickEditOffer) return;
                            setInlineOfferSaving(true);
                            let offerExpiresAt = null;
                            if (inlineOfferActive) {
                              const now = new Date();
                              const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
                              const istDateString = istFormatter.format(now);
                              const midnightIstStr = `${istDateString}T23:59:59.999+05:30`;
                              offerExpiresAt = new Date(midnightIstStr).toISOString();
                            }
                            await onQuickEditOffer(item.id, {
                              is_on_offer: inlineOfferActive,
                              offer_price: inlineOfferActive && inlineOfferPrice ? String(inlineOfferPrice) : null,
                              offer_expires_at: offerExpiresAt as any
                            });
                            setInlineOfferSaving(false);
                            setInlineEditingOfferId(null);
                          }}
                          className="mt-auto flex items-center justify-center gap-1 rounded bg-amber-500 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {inlineOfferSaving ? "..." : "Save (Till Midnight)"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2 my-auto">
                        <h4 className="font-extrabold text-xl text-[var(--text-primary)] group-hover:text-sky-400 transition leading-snug line-clamp-2 break-words flex-1 min-w-0 pr-2">
                          {item.name}
                        </h4>

                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className={`font-mono text-base font-black ${pricingMode === "WHOLESALE" && wholesalePriceNum !== null ? "text-purple-400" : "text-sky-400"}`}>
                            ₹{activePriceNum.toFixed(2)}
                          </span>
                          {hasDiscount && (
                            <span className="font-mono text-[10px] text-[var(--text-muted)] line-through">
                              MRP ₹{mrpVal.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Variant Selection Area (Only rendered if variants exist) */}
                    {itemVariants.length > 0 && (
                      <div className="pt-1 border-t border-[var(--border-subtle)] flex flex-wrap gap-1">
                        {itemVariants.map((v) => {
                          const variantPriceNum = activePriceNum + (parseFloat(v.price_delta) || 0);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addItemToCart(item, v);
                              }}
                              className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500 hover:text-white transition"
                            >
                              + {v.name} (₹{variantPriceNum.toFixed(0)})
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Pagination Controls */}
            {menuTotalPages && menuTotalPages > 1 && setMenuPage && menuPage && (
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 pb-1 shrink-0 mt-auto">
                <p className="text-xs text-[var(--text-secondary)] font-medium">
                  Page {menuPage} of {menuTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMenuPage((p: number) => Math.max(1, p - 1))}
                    disabled={menuPage === 1}
                    className="rounded bg-[var(--bg-surface-elevated)] px-3 py-1 text-xs font-bold text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-surface)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setMenuPage((p: number) => Math.min(menuTotalPages, p + 1))}
                    disabled={menuPage === menuTotalPages}
                    className="rounded bg-[var(--bg-surface-elevated)] px-3 py-1 text-xs font-bold text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-surface)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Draft Bill Summary (Fixed Header, Scrollable List, Fixed Hardcoded Footer) */}
          <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-surface-elevated)]/20">
            {/* Header: Customer Info & Auto-Suggest (Fixed Top) */}
            <div className="p-4 space-y-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40 flex-shrink-0">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-3 relative">
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-base font-semibold text-[var(--text-muted)]">
                      Customer Phone {isWalkIn ? <span className="text-xs font-normal text-amber-400/90">(Walk-in mode)</span> : <span className="text-rose-400 font-bold">*</span>}
                    </label>
                    <label className={`inline-flex items-center gap-1.5 cursor-pointer select-none text-xs font-bold px-2 py-0.5 rounded-lg border transition-all ${
                      isWalkIn
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs"
                        : "bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    }`}>
                      <input
                        type="checkbox"
                        checked={!!isWalkIn}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsWalkIn?.(checked);
                          if (checked) {
                            setPhoneHasError(false);
                          }
                        }}
                        className="rounded border-[var(--border-strong)] text-amber-500 focus:ring-amber-500/30 h-3.5 w-3.5 cursor-pointer accent-amber-500"
                      />
                      <span>🚶 Walk in</span>
                    </label>
                  </div>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    placeholder={isWalkIn ? "Walk-in (optional phone)" : "e.g. 9876543210 (min 10 digits)"}
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onFocus={() => {
                      if (customerPhone.trim().length >= 2) setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (!showSuggestions || customerSuggestions.length === 0) return;
                      
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedSuggestionIndex(prev => Math.min(prev + 1, customerSuggestions.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedSuggestionIndex(prev => Math.max(prev - 1, -1));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < customerSuggestions.length) {
                          const s = customerSuggestions[highlightedSuggestionIndex];
                          setCustomerPhone(s.phone);
                          setCustomerName(s.name);
                          if (s.gstin && setCustomerGstin) setCustomerGstin(s.gstin);
                          if (s.legal_name && setCustomerLegalName) setCustomerLegalName(s.legal_name);
                          if (s.state_code && setPlaceOfSupply) setPlaceOfSupply(s.state_code);
                          setShowSuggestions(false);
                          setHighlightedSuggestionIndex(-1);
                          setPhoneHasError(false);
                          if (isWalkIn) setIsWalkIn?.(false);
                          void fetchCustomerAnalytics(s.phone);
                        }
                      }
                    }}
                    className={`w-full rounded-xl border bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-base font-mono text-[var(--text-primary)] focus:outline-none transition-all ${
                      phoneHasError && !isWalkIn
                        ? "border-rose-500 focus:border-rose-500 ring-2 ring-rose-500/20"
                        : customerPhone.trim() && customerPhone.replace(/\D/g, "").length < 10 && !isWalkIn
                        ? "border-rose-500/60 focus:border-rose-500"
                        : "border-[var(--border-strong)] focus:border-sky-500"
                    }`}
                  />
                  {phoneHasError && !isWalkIn && !customerPhone.trim() && (
                    <p className="text-[11px] text-rose-400 font-semibold mt-0.5 flex items-center gap-1 animate-in fade-in">
                      <span>⚠️ Customer phone is compulsory (min 10 digits) or check &quot;Walk in&quot;</span>
                    </p>
                  )}
                  {customerPhone.trim() && customerPhone.replace(/\D/g, "").length < 10 && !isWalkIn && (
                    <p className="text-[10px] text-rose-400 font-semibold mt-0.5">
                      Must be min 10 digits ({customerPhone.replace(/\D/g, "").length}/10)
                    </p>
                  )}

                  {/* Customer Auto-suggest dropdown */}
                  {showSuggestions && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] p-1 shadow-xl max-h-40 overflow-y-auto space-y-1">
                      {customerSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setCustomerPhone(s.phone);
                            setCustomerName(s.name);
                            if (s.gstin && setCustomerGstin) setCustomerGstin(s.gstin);
                            if (s.legal_name && setCustomerLegalName) setCustomerLegalName(s.legal_name);
                            if (s.state_code && setPlaceOfSupply) setPlaceOfSupply(s.state_code);
                            setShowSuggestions(false);
                            setHighlightedSuggestionIndex(-1);
                            void fetchCustomerAnalytics(s.phone);
                          }}
                          onMouseEnter={() => setHighlightedSuggestionIndex(i)}
                          className={`w-full text-left rounded-lg p-3 text-lg transition cursor-pointer flex items-center justify-between ${
                            highlightedSuggestionIndex === i ? "bg-[var(--accent-brand)]/20 border border-[var(--accent-brand)]" : "hover:bg-[var(--bg-surface)]"
                          }`}
                        >
                          <span className="font-bold text-[var(--text-primary)]">{s.name}</span>
                          <span className="font-mono text-base text-[var(--text-muted)]">{s.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-base font-semibold text-[var(--text-muted)] mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-base text-[var(--text-primary)] focus:border-sky-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-base font-semibold text-[var(--text-muted)] mb-1">
                    Extra Detail
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Address"
                    value={customerExtraDetail}
                    onChange={(e) => setCustomerExtraDetail(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-base text-[var(--text-primary)] focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* GST Compliance & Inter-State Bar */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    {/* Inter-State / IGST Switch */}
                    {restaurant?.interstate_mode === "ALWAYS_ON" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-xs">
                        <span>🏛️</span> IGST Active (Inter-State Outlet Mode)
                      </span>
                    ) : restaurant?.interstate_mode === "PER_BILL" ? (
                      <label className="flex items-center gap-2 cursor-pointer select-none font-medium text-[var(--text-primary)] hover:text-amber-400 transition-colors">
                        <input
                          type="checkbox"
                          checked={!!isInterstate}
                          onChange={(e) => setIsInterstate?.(e.target.checked)}
                          className="rounded border-[var(--border-strong)] text-amber-500 focus:ring-amber-500/30 h-4 w-4"
                        />
                        <span className="flex items-center gap-1">
                          <span>🌐</span> Inter-State Sale (IGST)
                        </span>
                        {isInterstate && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                            IGST 100%
                          </span>
                        )}
                      </label>
                    ) : null}
                  </div>

                  {/* B2B Toggle: only show when B2B mode is enabled in outlet settings */}
                  {Boolean(restaurant?.b2b_enabled) && (
                    <button
                      type="button"
                      onClick={() => setShowB2bFields(!showB2bFields)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                        showB2bFields || customerGstin
                          ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                          : "bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <span>🏢</span>
                      {showB2bFields || customerGstin ? "B2B GST Details Active" : "+ Add B2B GSTIN (Tax Invoice)"}
                    </button>
                  )}
                </div>

                {/* Collapsible B2B Fields */}
                {Boolean(restaurant?.b2b_enabled) && (showB2bFields || customerGstin) && (
                  <div className="pt-2 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-semibold text-indigo-300 mb-0.5">
                        Customer GSTIN (15 Digits)
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        placeholder="e.g. 01AAAAA0000A1Z5"
                        value={customerGstin || ""}
                        onChange={(e) => setCustomerGstin?.(e.target.value.toUpperCase().trim())}
                        className="w-full rounded-lg border border-indigo-500/30 bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-indigo-300 mb-0.5">
                        Legal Business Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Acme Retail Pvt Ltd"
                        value={customerLegalName || ""}
                        onChange={(e) => setCustomerLegalName?.(e.target.value)}
                        className="w-full rounded-lg border border-indigo-500/30 bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-indigo-300 mb-0.5">
                        Place of Supply
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 01-Jammu and Kashmir"
                        value={placeOfSupply || ""}
                        onChange={(e) => setPlaceOfSupply?.(e.target.value)}
                        className="w-full rounded-lg border border-indigo-500/30 bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Purchase Volume & Insights Banner */}
              {customerAnalytics && (
                <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-sky-300 block">
                        Customer Purchase Volume ({analyticsPeriod.replace(/_/g, " ")})
                      </span>
                      <span className="font-mono text-base font-black text-sky-400">
                        ₹{customerAnalytics.total_volume.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] ml-1 font-semibold">
                        ({customerAnalytics.total_orders} Orders)
                      </span>
                    </div>
                    {customerAnalytics.credit_balance !== undefined && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] uppercase font-bold text-sky-300/80 block">
                          Wallet Balance
                        </span>
                        {customerAnalytics.credit_balance > 0 ? (
                          <span className="font-mono text-base font-black text-emerald-400">
                            ₹{customerAnalytics.credit_balance.toFixed(2)} (Cr)
                          </span>
                        ) : customerAnalytics.credit_balance < 0 ? (
                          <span className="font-mono text-base font-black text-rose-400">
                            -₹{Math.abs(customerAnalytics.credit_balance).toFixed(2)} (Dr)
                          </span>
                        ) : (
                          <span className="font-mono text-base font-black text-sky-400/50">
                            ₹0.00
                          </span>
                        )}
                      </div>
                    )}
                    {(customerAnalytics.loyalty_points ?? 0) > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-amber-400/80 block">
                          Loyalty Balance
                        </span>
                        <span className="font-mono text-base font-black text-amber-400">
                          {customerAnalytics.loyalty_points}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setInsightsModalOpen(true)}
                      className="rounded-xl bg-sky-500 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-600 transition shadow-xs"
                    >
                      More Insights
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Middle: Billed Line Items List (Scrollable Middle) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {inlineNotice && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 text-xs font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
                    <span className="truncate">{inlineNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInlineNotice(null)}
                    className="text-sky-400/60 hover:text-sky-400 p-0.5 rounded transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {draftCartItems.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] py-12">
                  No items in bill yet. Scan a barcode or click products on the left.
                </div>
              ) : (
                draftCartItems.map((ci, idx) => {
                  const originalItem = menuItems.find(m => m.id === ci.menu_item_id);
                  const variant = ci.variant_id ? variantsByItem[originalItem?.id || ""]?.find(v => v.id === ci.variant_id) : undefined;
                  const currentBatch = originalItem?.active_batches?.find(b => b.id === ci.selected_batch_id) || originalItem?.active_batches?.[0];

                  const resolved = originalItem
                    ? resolveEffectiveItemPrice(originalItem, {
                        pricingMode: ci.pricing_type,
                        eveningPriceActive,
                        batch: currentBatch,
                        variant,
                        selectedUnit: ci.selected_unit,
                      })
                    : null;

                  const isOfferApplied = !ci.is_custom_price && Boolean(resolved?.isOfferApplied);
                  const isEveningApplied = !ci.is_custom_price && Boolean(resolved?.isEveningApplied);

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 text-xs"
                    >
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span 
                          onClick={() => {
                            setSearchQuery(ci.item_name);
                            setTimeout(() => searchInputRef.current?.focus(), 0);
                          }}
                          className="font-bold text-lg text-[var(--text-primary)] hover:text-sky-400 cursor-pointer transition-colors"
                          title="Click to search catalog"
                        >
                          {ci.item_name}
                        </span>

                        {/* Minimal lot selector pill if item has multiple positive lots */}
                        {originalItem?.active_batches && originalItem.active_batches.length > 1 && (
                          <div className="flex items-center gap-1.5">
                            {(() => {
                              if (ci.allow_oversell) return null;
                              const bIdx = originalItem.active_batches.findIndex((b) => b.id === ci.selected_batch_id);
                              const rank = bIdx >= 0 ? bIdx + 1 : 1;
                              const isOldest = bIdx === 0;
                              return (
                                <span
                                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                    isOldest
                                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                      : "bg-sky-500/15 text-sky-400 border-sky-500/30"
                                  }`}
                                  title={`FIFO Sequence Rank: #${rank} (${isOldest ? "Oldest active lot in inventory" : `Lot rank ${rank}`})`}
                                >
                                  FIFO #{rank}{isOldest ? " · Oldest" : ""}
                                </span>
                              );
                            })()}
                            {ci.allow_oversell ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-mono rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-400 font-semibold"
                                title={`Oversold Backorder priced at latest lot rate (${ci.selected_batch_number ? `Lot #${ci.selected_batch_number}` : "Latest Rate"})`}
                              >
                                Backorder · {ci.selected_batch_number ? `Lot #${ci.selected_batch_number}` : "Latest Lot"}
                              </span>
                            ) : (
                              <select
                                value={ci.selected_batch_id || (originalItem.active_batches[0]?.id ?? "")}
                                onChange={(e) => {
                                  const chosenBatch = originalItem.active_batches?.find((b) => b.id === e.target.value);
                                  if (!chosenBatch) return;

                                  let newPrice: number;
                                  let baseBatchPrice: number;
                                  let newMrp: number;
                                  let baseBatchMrp: number;

                                  if (ci.is_custom_price) {
                                    const factor = getUnitFactor(originalItem, ci.selected_unit);
                                    baseBatchPrice = ci.base_unit_price ?? ci.unit_price;
                                    baseBatchMrp = ci.base_mrp ?? ci.mrp ?? baseBatchPrice;
                                    newPrice = factor > 0 ? baseBatchPrice / factor : baseBatchPrice;
                                    newMrp = factor > 0 ? Math.max(baseBatchMrp / factor, newPrice) : Math.max(baseBatchMrp, newPrice);
                                  } else {
                                    const resolvedBatch = resolveEffectiveItemPrice(originalItem, {
                                      pricingMode: ci.pricing_type,
                                      eveningPriceActive,
                                      batch: chosenBatch,
                                      variant,
                                      selectedUnit: ci.selected_unit,
                                    });
                                    newPrice = resolvedBatch.unitPrice;
                                    baseBatchPrice = resolvedBatch.baseUnitPrice;
                                    newMrp = resolvedBatch.mrp;
                                    baseBatchMrp = resolvedBatch.baseMrp;
                                  }

                                  setDraftCartItems((prev) =>
                                    prev.map((item, i) => {
                                      if (i !== idx) return item;
                                      return {
                                        ...item,
                                        selected_batch_id: chosenBatch.id,
                                        selected_batch_number: chosenBatch.batch_number,
                                        unit_price: newPrice,
                                        base_unit_price: baseBatchPrice,
                                        mrp: newMrp,
                                        base_mrp: baseBatchMrp,
                                        is_custom_price: ci.is_custom_price ?? false,
                                        allow_oversell: false,
                                      };
                                    })
                                  );
                                  const effectiveStock = getEffectiveBatchRemaining(chosenBatch, originalItem);
                                  const avail = getUnallocatedBatchStock(chosenBatch.id, effectiveStock, draftCartItems, idx, originalItem, ci.selected_unit);
                                  if (ci.quantity > avail) {
                                    setTimeout(() => {
                                      handleCartItemQuantityChange(idx, ci.quantity);
                                    }, 0);
                                  }
                                }}
                                className="text-[11px] font-mono rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--text-secondary)] hover:border-sky-500 focus:outline-none cursor-pointer"
                                title="Select Inventory Lot"
                              >
                                {originalItem.active_batches.map((b, optIdx) => {
                                  const effectiveStock = getEffectiveBatchRemaining(b, originalItem);
                                  const unallocated = getUnallocatedBatchStock(b.id, effectiveStock, draftCartItems, idx, originalItem, ci.selected_unit);
                                  const resolvedOpt = resolveEffectiveItemPrice(originalItem, {
                                    pricingMode: ci.pricing_type,
                                    eveningPriceActive,
                                    batch: b,
                                    variant,
                                    selectedUnit: ci.selected_unit,
                                  });
                                  const bDisplayPrice = resolvedOpt.unitPrice;
                                  return (
                                    <option key={b.id} value={b.id}>
                                      #{optIdx + 1} · Lot: {b.batch_number} · ₹{bDisplayPrice.toFixed(2)} ({unallocated} left){b.is_oldest ? " (oldest)" : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            )}
                            {ci.allow_oversell && (
                              <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                                Oversell
                              </span>
                            )}
                          </div>
                        )}

                        {/* Single-batch item indicator */}
                        {originalItem?.active_batches && originalItem.active_batches.length === 1 && (() => {
                          const singleBatch = originalItem.active_batches[0];
                          const effectiveStock = getEffectiveBatchRemaining(singleBatch, originalItem);
                          const unallocated = getUnallocatedBatchStock(singleBatch.id, effectiveStock, draftCartItems, idx, originalItem, ci.selected_unit);
                          return (
                            <div className="flex items-center gap-1">
                              {ci.allow_oversell ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-mono rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-400 font-semibold"
                                  title={`Oversold Backorder priced at latest lot rate (${ci.selected_batch_number ? `Lot #${ci.selected_batch_number}` : "Latest Rate"})`}
                                >
                                  Backorder · {ci.selected_batch_number ? `Lot #${ci.selected_batch_number}` : "Latest Lot"}
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-mono rounded-md border px-2 py-0.5 font-medium ${
                                    unallocated <= 0
                                      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                      : unallocated <= 5
                                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]"
                                  }`}
                                  title={`Active Batch: ${singleBatch.batch_number} · ${unallocated} available in stock`}
                                >
                                  Lot: {singleBatch.batch_number}
                                  <span className={unallocated <= 5 ? "font-bold text-amber-400" : "text-[var(--text-muted)]"}>
                                    ({unallocated} left)
                                  </span>
                                </span>
                              )}
                              {ci.allow_oversell && (
                                <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                                  Oversell
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {(!originalItem?.active_batches || originalItem.active_batches.length === 0) && originalItem?.inventory_item_id && (() => {
                          const linkedStock = inventoryStockMap.get(originalItem.inventory_item_id);
                          if (linkedStock === undefined) return null;
                          const linkedStockInUnit = stockInUnit(linkedStock, originalItem, ci.selected_unit);
                          return (
                            <div className="flex items-center gap-1">
                              {ci.allow_oversell ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-400 font-semibold">
                                  Backorder
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-mono rounded-md border px-2 py-0.5 font-medium ${
                                    linkedStockInUnit <= 0
                                      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                      : linkedStockInUnit <= 5
                                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      : "border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]"
                                  }`}
                                  title={`Current stock: ${linkedStockInUnit}`}
                                >
                                  Stock:{" "}
                                  <span className={linkedStockInUnit <= 5 ? "font-bold text-amber-400" : "text-[var(--text-muted)]"}>
                                    {linkedStockInUnit} left
                                  </span>
                                </span>
                              )}
                              {ci.allow_oversell && (
                                <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                                  Oversell
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        {(!originalItem?.inventory_item_id && (!originalItem?.active_batches || originalItem.active_batches.length === 0)) && ci.allow_oversell && (
                          <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">
                            Oversell
                          </span>
                        )}
                        <div className="flex items-center gap-2 font-mono text-[16px] pt-0.5">
                          <CartItemPriceInput
                            initialPrice={ci.unit_price}
                            onPriceChange={(newPrice) => {
                              const factor = getUnitFactor(originalItem, ci.selected_unit);
                              setDraftCartItems((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        unit_price: newPrice,
                                        base_unit_price: factor > 0 ? newPrice * factor : newPrice,
                                        is_custom_price: true,
                                      }
                                    : item
                                )
                              );
                            }}
                          />
                          {ci.is_custom_price && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 rounded">
                              Custom Price
                            </span>
                          )}
                          {isOfferApplied ? (
                            <span title="Special Offer Applied">
                              <Flame className="h-4 w-4 text-orange-400 fill-orange-400/20" />
                            </span>
                          ) : isEveningApplied ? (
                            <span title="Evening Price Applied">
                              <Moon className="h-4 w-4 text-amber-400 fill-amber-400/20" />
                            </span>
                          ) : null}
                        {ci.mrp && ci.mrp > ci.unit_price && (
                          <span className="text-[14px] text-gray-400 line-through">MRP: ₹{ci.mrp.toFixed(2)}</span>
                        )}
                        {ci.tax_rate && ci.tax_rate > 0 ? (
                          <span className="text-[12px] text-emerald-400 font-bold border border-emerald-500/20 bg-emerald-500/10 px-1 rounded">GST {ci.tax_rate}%</span>
                        ) : null}
                      </div>
                    </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleCartItemQuantityChange(idx, ci.quantity - 1)}
                          className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        
                        <CartItemQuantityInput
                          initialQuantity={ci.quantity}
                          onQuantityChange={(q) => handleCartItemQuantityChange(idx, q)}
                        />
                        <button
                          type="button"
                          onClick={() => handleCartItemQuantityChange(idx, ci.quantity + 1)}
                          className="p-1 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-surface)]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      {originalItem && originalItem.alternate_units && (originalItem.alternate_units as any[]).length > 0 ? (
                        <select
                          value={ci.selected_unit || originalItem.unit_label || "piece"}
                          onChange={(e) => {
                            const newUnit = e.target.value;
                            const factor = getUnitFactor(originalItem, newUnit);
                            
                            const basePrice = ci.base_unit_price ?? ci.unit_price;
                            const baseMrp = ci.base_mrp ?? ci.mrp ?? basePrice;
                            
                            const newPrice = factor > 0 ? basePrice / factor : basePrice;
                            const newMrp = factor > 0 ? Math.max(baseMrp / factor, newPrice) : Math.max(baseMrp, newPrice);

                            setDraftCartItems((prev) =>
                              prev.map((item, i) =>
                                i === idx ? {
                                  ...item,
                                  selected_unit: newUnit,
                                  unit_price: newPrice,
                                  mrp: newMrp,
                                  base_unit_price: basePrice,
                                  base_mrp: baseMrp,
                                  is_custom_price: false,
                                } : item
                              )
                            );
                          }}
                          className="ml-1 text-[10px] bg-transparent border border-[var(--border-strong)] rounded px-1 py-0.5 max-w-[60px] truncate focus:outline-none"
                        >
                          <option value={originalItem.unit_label || "piece"}>{originalItem.unit_label || "piece"}</option>
                          {(originalItem.alternate_units as any[]).map((au: any) => (
                            <option key={au.unit_label} value={au.unit_label}>{au.unit_label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] ml-1 truncate max-w-[60px]">
                          {ci.selected_unit || originalItem?.unit_label || "piece"}
                        </span>
                      )}
                    </div>

                    <span className="font-mono font-bold w-24 text-right text-sky-400 text-lg">
                      ₹{(ci.unit_price * ci.quantity).toFixed(2)}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setDraftCartItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-[var(--text-muted)] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  );
                })
              )}
            </div>

            {/* Footer: Hardcoded Fixed Bottom Summary & Action Buttons */}
            <div className="flex-shrink-0 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3 font-mono shadow-lg">
              <div className="flex items-center justify-between text-xl font-bold font-sans">
                <span className="text-[var(--text-primary)] font-black">Grand Total Payable:</span>
                <span className="font-mono text-3xl font-black text-sky-400">
                  ₹{grandTotalPayable.toFixed(2)}
                </span>
              </div>

              <div className={`grid ${editingCompletedBill ? "grid-cols-2" : "grid-cols-3"} gap-2 pt-2 font-sans`}>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border-strong)] py-3 text-base font-bold text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] transition"
                >
                  {editingCompletedBill ? "Cancel Edit" : "Cancel"}
                </button>
                {!editingCompletedBill && (
                  <button
                    type="button"
                    disabled={draftCartItems.length === 0}
                    onClick={() => validateBeforeCreateBill(false)}
                    className="rounded-xl border border-[var(--border-strong)] py-3 text-base font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition disabled:opacity-50"
                  >
                    Save as Draft
                  </button>
                )}
                <button
                  type="button"
                  disabled={draftCartItems.length === 0}
                  onClick={() => validateBeforeCreateBill(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-brand)] py-3 text-base font-bold text-[var(--text-on-accent)] shadow-md hover:opacity-90 transition disabled:opacity-50"
                >
                  <CreditCard className="h-5 w-5" />
                  {editingCompletedBill ? "Proceed to Settlement" : "Settle & Collect"} <span className="ml-1 opacity-70 font-mono text-xs bg-black/20 px-1.5 rounded">↵</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Customer Insights & Interest Profile Modal */}
      <CustomerInsightsModal
        isOpen={insightsModalOpen}
        onClose={() => setInsightsModalOpen(false)}
        analytics={customerAnalytics}
        currentPeriod={analyticsPeriod}
        onPeriodChange={(period, start, end) => {
          setAnalyticsPeriod(period);
          if (start) setStartDate(start);
          if (end) setEndDate(end);
          // When changing period, we refetch data for the active customer phone
          const phone = customerPhone.replace(/\D/g, "");
          if (phone.length >= 10) {
            void fetchCustomerAnalytics(phone, period, start, end);
          }
        }}
      />
      {/* Oversell Deficit & Batch Splitting Modal */}
      {oversellState && (
        <OversellBatchModal
          isOpen={Boolean(oversellState)}
          onClose={() => setOversellState(null)}
          itemName={oversellState.itemName}
          selectedBatchId={oversellState.selectedBatchId}
          selectedBatchNumber={oversellState.selectedBatchNumber}
          availableQty={oversellState.availableQty}
          requestedQty={oversellState.requestedQty}
          activeBatches={oversellState.activeBatches}
          unallocatedBatchStockMap={unallocatedBatchStockMap}
          onApplyAllocations={(allocations) => {
            handleApplyBatchAllocations(oversellState.cartItemIndex, allocations);
          }}
        />
      )}

      {/* Compulsory Customer Phone Required Popup Modal */}
      {showPhoneRequiredModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-2xl animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4 bg-[var(--bg-surface-elevated)]/40">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                    Customer Phone Required
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Compulsory for billing &amp; customer records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPhoneRequiredModal(false)}
                className="rounded-full p-2 hover:bg-[var(--bg-surface-elevated)] transition text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {customerPhone.trim() ? (
                  <>
                    The entered customer phone number is only <strong className="text-rose-400">{customerPhone.replace(/\D/g, "").length} digits</strong>. 
                    A valid phone number requires at least <strong>10 digits</strong>.
                  </>
                ) : (
                  <>
                    Customer phone number is compulsory to proceed to settlement and generate customer invoices.
                  </>
                )}
              </p>
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 flex items-start gap-2">
                <span className="text-sm shrink-0">💡</span>
                <span>
                  If the customer does not wish to provide a phone number, you can proceed as an anonymous <strong>Walk-in</strong> customer.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 bg-[var(--bg-surface-elevated)] px-6 py-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={handleProceedAsWalkIn}
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>🚶 Continue as Walk-in</span>
              </button>
              <button
                type="button"
                onClick={handleFocusPhoneInput}
                className="rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>✏️ Enter Customer Phone</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
