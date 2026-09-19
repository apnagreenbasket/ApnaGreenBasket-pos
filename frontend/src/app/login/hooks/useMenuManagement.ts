"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminCategory,
  AdminMenuItem,
  AdminVariant,
  MenuItemFormState,
  OfferFormState,
  VariantFormState,
} from "../adminTypes";

import { isAuthError } from "../adminUtils";

type UseMenuManagementProps = {
  accessToken: string | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice?: (msg: string | null) => void;
  setError?: (msg: string | null) => void;
  enabled?: boolean;
};

export function useMenuManagement({
  accessToken,
  apiRequest,
  setNotice,
  setError,
  enabled = true,
}: UseMenuManagementProps) {
  const setErrorRef = useRef(setError);
  setErrorRef.current = setError;
  const setNoticeRef = useRef(setNotice);
  setNoticeRef.current = setNotice;
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
  const [menuPage, setMenuPage] = useState(1);
  const [menuTotalPages, setMenuTotalPages] = useState(1);
  const [menuTotal, setMenuTotal] = useState(0);

  const [variantsByItem, setVariantsByItem] = useState<Record<string, AdminVariant[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);

  // Variant Modal State
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<AdminMenuItem | null>(null);
  const [currentVariants, setCurrentVariants] = useState<AdminVariant[]>([]);

  // Offer Modal State
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [selectedItemForOffer, setSelectedItemForOffer] = useState<AdminMenuItem | null>(null);
  const [offerForm, setOfferForm] = useState<OfferFormState>({
    is_on_offer: true,
    offer_price: "",
    offer_label: "",
    expires_at_midnight: false,
  });
  const [isSavingOffer, setIsSavingOffer] = useState(false);

  // Load categories, items, and variants
  const loadCategoriesAndMenuItems = useCallback(async () => {
    if (!accessToken || !enabled) return;
    try {
      setIsLoadingMenu(true);
      const [cats, itemsData] = await Promise.all([
        apiRequest<AdminCategory[]>("/api/admin/categories"),
        apiRequest<any>(`/api/admin/menu-items`),
      ]);
      setCategories(cats);
      
      let items = [];
      if (itemsData.items !== undefined) {
        items = itemsData.items;
        setMenuTotalPages(itemsData.total_pages);
        setMenuTotal(itemsData.total);
      } else {
        items = itemsData;
        setMenuTotalPages(1);
        setMenuTotal(items.length);
      }
      setMenuItems(items);

      // Group variants
      const vMap: Record<string, AdminVariant[]> = {};
      items.forEach((item: AdminMenuItem) => {
        if (item.variants) {
          vMap[item.id] = item.variants;
        }
      });
      setVariantsByItem(vMap);
    } catch (err: any) {
      if (isAuthError(err)) return;
      if (setErrorRef.current) setErrorRef.current(err?.message || "Failed to load menu data");
    } finally {
      setIsLoadingMenu(false);
    }
  }, [accessToken, apiRequest, enabled]);

  useEffect(() => {
    if (enabled) {
      loadCategoriesAndMenuItems();
    }
  }, [enabled, loadCategoriesAndMenuItems]);

  // Create / Update MenuItem
  const handleSaveMenuItem = useCallback(
    async (itemId: string | null, formData: MenuItemFormState) => {
      try {
        const cleanPayload = {
          ...formData,
          inventory_item_id: formData.inventory_item_id || null,
          price: parseFloat(formData.price) || 0,
          barcode: formData.barcode?.trim() || null,
          description: formData.description?.trim() || null,
          offer_label: formData.offer_label?.trim() || null,
          offer_price:
            formData.offer_price && String(formData.offer_price).trim() !== ""
              ? parseFloat(String(formData.offer_price))
              : null,
          mrp:
            formData.mrp && String(formData.mrp).trim() !== ""
              ? parseFloat(String(formData.mrp))
              : null,
          wholesale_price:
            formData.wholesale_price && String(formData.wholesale_price).trim() !== ""
              ? parseFloat(String(formData.wholesale_price))
              : null,
          evening_price:
            formData.evening_price && String(formData.evening_price).trim() !== ""
              ? parseFloat(String(formData.evening_price))
              : null,
          tax_category: formData.tax_category?.trim() || "GST 0%",
          tax_rate:
            formData.tax_rate && String(formData.tax_rate).trim() !== ""
              ? parseFloat(String(formData.tax_rate))
              : 0,
          hsn_code:
            formData.hsn_code && String(formData.hsn_code).trim() !== ""
              ? String(formData.hsn_code).trim()
              : null,
          offer_expires_at: formData.offer_expires_at || null,
        };

        if (itemId) {
          const updated = await apiRequest<AdminMenuItem>(
            `/api/admin/menu-items/${itemId}`,
            {
              method: "PATCH",
              body: JSON.stringify(cleanPayload),
            }
          );
          setMenuItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
        } else {
          const created = await apiRequest<AdminMenuItem>("/api/admin/menu-items", {
            method: "POST",
            body: JSON.stringify(cleanPayload),
          });
          setMenuItems((prev) => [created, ...prev]);
        }
        if (setNotice) setNotice(itemId ? "Item updated" : "Item created");
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to save item");
        throw err;
      }
    },
    [apiRequest, setNotice, setError]
  );

  // Batch update prices
  const handleSaveBatchMenuItems = useCallback(
    async (updates: { id: string; name: string; mrp: string; price: string; evening_price: string }[]) => {
      try {
        const promises = updates.map((u) => {
          const payload = {
            mrp: u.mrp && u.mrp.trim() !== "" ? parseFloat(u.mrp) : null,
            price: parseFloat(u.price) || 0,
            evening_price: u.evening_price && u.evening_price.trim() !== "" ? parseFloat(u.evening_price) : null,
          };
          return apiRequest<AdminMenuItem>(`/api/admin/menu-items/${u.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        });

        const updatedItems = await Promise.all(promises);

        setMenuItems((prev) => {
          const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
          return prev.map((item) => updatedMap.get(item.id) || item);
        });

        if (setNotice) setNotice(`Updated ${updatedItems.length} item(s)`);
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to save batch items");
        throw err;
      }
    },
    [apiRequest, setNotice, setError]
  );

  // Delete MenuItem
  const handleDeleteMenuItem = useCallback(
    async (itemId: string) => {
      try {
        await apiRequest(`/api/admin/menu-items/${itemId}`, { method: "DELETE" });
        setMenuItems((prev) => prev.filter((it) => it.id !== itemId));
        if (setNotice) setNotice("Item deleted");
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to delete item");
      }
    },
    [apiRequest, setNotice, setError]
  );

  // Toggle Availability
  const handleToggleAvailability = useCallback(
    async (itemId: string, isAvailable: boolean) => {
      try {
        const updated = await apiRequest<AdminMenuItem>(
          `/api/admin/menu-items/${itemId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ is_available: isAvailable }),
          }
        );
        setMenuItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to toggle availability");
      }
    },
    [apiRequest, setError]
  );

  // Variant Modal handlers
  const openVariantModal = (item: AdminMenuItem) => {
    setSelectedItemForVariants(item);
    setCurrentVariants(variantsByItem[item.id] || []);
    setIsVariantModalOpen(true);
  };

  const closeVariantModal = () => {
    setIsVariantModalOpen(false);
    setSelectedItemForVariants(null);
    setCurrentVariants([]);
  };

  const handleSaveVariant = async (
    itemId: string,
    variantId: string | null,
    formState: VariantFormState
  ) => {
    if (variantId) {
      const updated = await apiRequest<AdminVariant>(
        `/api/admin/menu-items/${itemId}/variants/${variantId}`,
        {
          method: "PATCH",
          body: JSON.stringify(formState),
        }
      );
      setVariantsByItem((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).map((v) => (v.id === variantId ? updated : v)),
      }));
    } else {
      const created = await apiRequest<AdminVariant>(
        `/api/admin/menu-items/${itemId}/variants`,
        {
          method: "POST",
          body: JSON.stringify(formState),
        }
      );
      setVariantsByItem((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), created],
      }));
    }
  };

  const handleDeleteVariant = async (itemId: string, variantId: string) => {
    await apiRequest(`/api/admin/menu-items/${itemId}/variants/${variantId}`, {
      method: "DELETE",
    });
    setVariantsByItem((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter((v) => v.id !== variantId),
    }));
  };

  // Offer Modal handlers
  const openOfferModal = (item: AdminMenuItem) => {
    setSelectedItemForOffer(item);
    setOfferForm({
      is_on_offer: item.is_on_offer ?? false,
      offer_price: item.offer_price ? String(item.offer_price) : "",
      offer_label: item.offer_label || "",
      expires_at_midnight: false,
    });
    setIsOfferModalOpen(true);
  };

  const closeOfferModal = () => {
    setIsOfferModalOpen(false);
    setSelectedItemForOffer(null);
  };

  const handleSaveOffer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedItemForOffer) return;
    try {
      setIsSavingOffer(true);
      
      let offerExpiresAt = null;
      if (offerForm.is_on_offer && offerForm.expires_at_midnight) {
        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        const istDateString = istFormatter.format(now);
        const midnightIstStr = `${istDateString}T23:59:59.999+05:30`;
        offerExpiresAt = new Date(midnightIstStr).toISOString();
      }

      const payload = {
        is_on_offer: offerForm.is_on_offer,
        offer_price:
          offerForm.is_on_offer && offerForm.offer_price && String(offerForm.offer_price).trim() !== ""
            ? parseFloat(String(offerForm.offer_price))
            : null,
        offer_label:
          offerForm.is_on_offer && offerForm.offer_label && String(offerForm.offer_label).trim() !== ""
            ? String(offerForm.offer_label).trim()
            : null,
        offer_expires_at: offerExpiresAt,
      };

      const updated = await apiRequest<AdminMenuItem>(
        `/api/admin/menu-items/${selectedItemForOffer.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );
      setMenuItems((prev) => prev.map((it) => (it.id === selectedItemForOffer.id ? updated : it)));
      if (setNotice) setNotice("Special offer updated successfully");
      closeOfferModal();
    } catch (err: any) {
      if (setError) setError(err?.message || "Failed to update special offer");
      throw err;
    } finally {
      setIsSavingOffer(false);
    }
  };

  const handleCreateCategory = useCallback(
    async (name: string, display_order: number = 0) => {
      try {
        const created = await apiRequest<AdminCategory>("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({ name, display_order }),
        });
        setCategories((prev) => [...prev, created]);
        if (setNotice) setNotice("Category created successfully");
        return created;
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to create category");
        throw err;
      }
    },
    [apiRequest, setNotice, setError]
  );

  const handleDeleteCategory = useCallback(
    async (catId: string) => {
      try {
        await apiRequest(`/api/admin/categories/${catId}`, {
          method: "DELETE",
        });
        setCategories((prev) => prev.filter((c) => c.id !== catId));
        setMenuItems((prev) => prev.filter((it) => it.category_id !== catId));
        if (selectedCategory === catId) setSelectedCategory("ALL");
        if (setNotice) setNotice("Category deleted successfully");
      } catch (err: any) {
        if (setError) setError(err?.message || "Failed to delete category");
        throw err;
      }
    },
    [apiRequest, selectedCategory, setNotice, setError]
  );

  return {
    categories,
    setCategories,
    menuItems,
    setMenuItems,
    menuPage,
    setMenuPage,
    menuTotalPages,
    menuTotal,
    variantsByItem,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    isLoadingMenu,
    loadCategoriesAndMenuItems,
    handleSaveMenuItem,
    handleSaveBatchMenuItems,
    handleDeleteMenuItem,
    handleToggleAvailability,
    handleCreateCategory,
    handleDeleteCategory,
    // Variants
    isVariantModalOpen,
    selectedItemForVariants,
    currentVariants,
    openVariantModal,
    closeVariantModal,
    handleSaveVariant,
    handleDeleteVariant,
    // Offers
    isOfferModalOpen,
    selectedItemForOffer,
    offerForm,
    setOfferForm,
    isSavingOffer,
    openOfferModal,
    closeOfferModal,
    handleSaveOffer,
  };
}
