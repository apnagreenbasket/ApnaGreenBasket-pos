import { useCallback, useEffect, useState } from "react";
import type { AbandonedCart, ActiveSession } from "@/types";
import type { RestaurantProfile } from "../adminTypes";

type UseSessionsManagementProps = {
  accessToken: string | null;
  restaurant: RestaurantProfile | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useSessionsManagement({
  accessToken,
  restaurant,
  apiRequest,
  setNotice,
  setError,
}: UseSessionsManagementProps) {
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [abandonedCartCount, setAbandonedCartCount] = useState(0);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isLoadingCarts, setIsLoadingCarts] = useState(false);
  const [showAbandonedCartsPanel, setShowAbandonedCartsPanel] = useState(false);

  // Basket Sessions & Abandoned Carts
  const fetchAbandonedCartCount = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<{ count: number }>("/api/admin/sessions/abandoned-carts/count");
      setAbandonedCartCount(data.count);
    } catch { /* ignore */ }
  }, [accessToken, apiRequest]);

  const fetchAbandonedCarts = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingCarts(true);
    try {
      const data = await apiRequest<AbandonedCart[]>("/api/admin/sessions/abandoned-carts");
      setAbandonedCarts(data);
    } catch { /* ignore */ }
    setIsLoadingCarts(false);
  }, [accessToken, apiRequest]);

  const fetchActiveSessions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<ActiveSession[]>("/api/admin/sessions");
      setActiveSessions(data);
    } catch { /* ignore */ }
  }, [accessToken, apiRequest]);

  const terminateSession = useCallback(async (sessionId: string, reason?: string) => {
    if (!accessToken) return;
    try {
      await apiRequest(`/api/admin/sessions/${sessionId}/terminate`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      });
      setNotice("Session terminated.");
      void fetchActiveSessions();
      void fetchAbandonedCartCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to terminate session");
    }
  }, [accessToken, apiRequest, fetchActiveSessions, fetchAbandonedCartCount, setNotice, setError]);

  const convertAbandonedCart = useCallback(async (cartId: string) => {
    if (!accessToken) return;
    try {
      await apiRequest(`/api/admin/sessions/abandoned-carts/${cartId}/convert`, {
        method: "POST",
      });
      setNotice("Abandoned cart converted to a manual bill.");
      void fetchAbandonedCarts();
      void fetchAbandonedCartCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert cart");
    }
  }, [accessToken, apiRequest, fetchAbandonedCarts, fetchAbandonedCartCount, setNotice, setError]);

  const dismissAbandonedCart = useCallback(async (cartId: string) => {
    if (!accessToken) return;
    try {
      await apiRequest(`/api/admin/sessions/abandoned-carts/${cartId}/dismiss`, {
        method: "POST",
      });
      setNotice("Abandoned cart dismissed.");
      void fetchAbandonedCarts();
      void fetchAbandonedCartCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss cart");
    }
  }, [accessToken, apiRequest, fetchAbandonedCarts, fetchAbandonedCartCount, setNotice, setError]);

  useEffect(() => {
    if (!accessToken || !restaurant) return;
    void fetchAbandonedCartCount();
    const interval = setInterval(() => {
      void fetchAbandonedCartCount();
    }, 60_000);
    return () => clearInterval(interval);
  }, [accessToken, restaurant, fetchAbandonedCartCount]);

  useEffect(() => {
    if (showAbandonedCartsPanel) {
      void fetchAbandonedCarts();
      void fetchActiveSessions();
    }
  }, [showAbandonedCartsPanel, fetchAbandonedCarts, fetchActiveSessions]);

  return {
    abandonedCarts,
    setAbandonedCarts,
    abandonedCartCount,
    setAbandonedCartCount,
    activeSessions,
    setActiveSessions,
    isLoadingCarts,
    showAbandonedCartsPanel,
    setShowAbandonedCartsPanel,
    fetchAbandonedCartCount,
    fetchAbandonedCarts,
    fetchActiveSessions,
    terminateSession,
    convertAbandonedCart,
    dismissAbandonedCart,
  };
}
