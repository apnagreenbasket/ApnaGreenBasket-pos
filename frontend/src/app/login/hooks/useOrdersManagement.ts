import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderStatus } from "@/types";
import type { AdminOrder, RestaurantProfile } from "../adminTypes";

type UseOrdersManagementProps = {
  accessToken: string | null;
  restaurant: RestaurantProfile | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  loadDashboard: () => Promise<void>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
  onCatalogUpdated?: () => void;
  enabled?: boolean;
};

export function useOrdersManagement({
  accessToken,
  restaurant,
  apiRequest,
  loadDashboard,
  setNotice,
  setError,
  onCatalogUpdated,
  enabled = true,
}: UseOrdersManagementProps) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const wsPingRef = useRef<NodeJS.Timeout | null>(null);
  const wsReconnectRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch Orders from Backend API
  const fetchOrders = useCallback(async () => {
    if (!accessToken || !enabled) return;
    try {
      const data = await apiRequest<AdminOrder[]>("/api/admin/orders");
      setOrders(data);
    } catch {
      // Ignore initial/poll fetch errors
    }
  }, [accessToken, enabled, apiRequest]);

  // Initial fetch and 10s fallback polling loop
  useEffect(() => {
    if (accessToken && enabled) {
      void fetchOrders();
      const interval = setInterval(() => {
        void fetchOrders();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [accessToken, enabled, fetchOrders]);

  const loadDashboardRef = useRef(loadDashboard);
  useEffect(() => {
    loadDashboardRef.current = loadDashboard;
  }, [loadDashboard]);

  const onCatalogUpdatedRef = useRef(onCatalogUpdated);
  useEffect(() => {
    onCatalogUpdatedRef.current = onCatalogUpdated;
  }, [onCatalogUpdated]);

  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  const restaurantId = restaurant?.id;
  const reconnectAttemptsRef = useRef(0);
  const lastPongRef = useRef(Date.now());

  const scheduleReconnect = useCallback((forcedDelay?: number) => {
    if (wsReconnectRef.current) {
      clearTimeout(wsReconnectRef.current);
    }
    const baseDelay = 2000;
    const maxDelay = 30000;
    const attempts = reconnectAttemptsRef.current;
    const delay = forcedDelay ?? Math.min(baseDelay * Math.pow(1.5, attempts), maxDelay);
    reconnectAttemptsRef.current += 1;

    wsReconnectRef.current = setTimeout(() => {
      void connectWebSocket();
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket Live Feed
  const connectWebSocket = useCallback(async () => {
    if (!accessToken || !restaurantId) return;

    // Do not reconnect if already open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setWsStatus("connected");
      return;
    }

    // Clean up any existing socket cleanly before reconnecting
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setWsStatus("connecting");

    try {
      // Use apiRequest to leverage automatic token refresh if accessToken expired
      const { ticket } = await apiRequest<{ ticket: string }>("/api/ws-ticket", {
        method: "POST",
      });

      if (!ticket) {
        setWsStatus("disconnected");
        scheduleReconnect();
        return;
      }

      let wsBaseUrl = "";
      if (process.env.NEXT_PUBLIC_API_URL) {
        wsBaseUrl = process.env.NEXT_PUBLIC_API_URL.replace(/^http/, "ws").replace(/\/$/, "");
      } else if (typeof window !== "undefined") {
        const hostname = window.location.hostname || "localhost";
        const isSecure = window.location.protocol === "https:";
        const wsProto = isSecure ? "wss:" : "ws:";

        if (hostname.endsWith(".loca.lt") || hostname.includes("vercel.app")) {
          wsBaseUrl = `${wsProto}//${hostname}`;
        } else {
          wsBaseUrl = `${wsProto}//${hostname}:8000`;
        }
      }

      const ws = new WebSocket(
        `${wsBaseUrl}/ws/mart/${restaurantId}?ticket=${ticket}`
      );
      wsRef.current = ws;

      const connectTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setWsStatus("disconnected");
          ws.close();
        }
      }, 8000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        setWsStatus("connected");
        reconnectAttemptsRef.current = 0; // Reset backoff counter on success
        lastPongRef.current = Date.now();

        if (wsPingRef.current) clearInterval(wsPingRef.current);
        wsPingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            // Heartbeat watchdog: if no pong received for over 40 seconds, drop and reconnect
            if (Date.now() - lastPongRef.current > 40000) {
              ws.close();
              return;
            }
            ws.send("ping");
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") {
          lastPongRef.current = Date.now();
          return;
        }
        lastPongRef.current = Date.now();
        try {
          const message = JSON.parse(event.data);
          void fetchOrdersRef.current();
          if (message.event === "OUTLET_UPDATED") {
            void loadDashboardRef.current();
          }
          if (message.event === "ORDER_STATUS_CHANGED" && message.data) {
            setOrders((current) =>
              current.map((order) =>
                order.id === message.data.order_id
                  ? { ...order, status: message.data.new_status }
                  : order
              )
            );
          }
          if (message.event === "CATALOG_UPDATED") {
            onCatalogUpdatedRef.current?.();
          }
        } catch {
          // Ignore
        }
      };

      ws.onclose = () => {
        clearTimeout(connectTimeout);
        setWsStatus("disconnected");
        if (wsPingRef.current) {
          clearInterval(wsPingRef.current);
          wsPingRef.current = null;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
        setWsStatus("disconnected");
        ws.close();
      };
    } catch {
      setWsStatus("disconnected");
      scheduleReconnect();
    }
  }, [accessToken, restaurantId, apiRequest, scheduleReconnect]);

  useEffect(() => {
    if (restaurantId && accessToken) {
      void connectWebSocket();
    }
    return () => {
      if (wsReconnectRef.current) {
        clearTimeout(wsReconnectRef.current);
        wsReconnectRef.current = null;
      }
      if (wsPingRef.current) {
        clearInterval(wsPingRef.current);
        wsPingRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [restaurantId, accessToken, connectWebSocket]);

  // Instant auto-recovery on tab visibility return or network reconnect
  useEffect(() => {
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === "visible" && (typeof navigator === "undefined" || navigator.onLine)) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (wsReconnectRef.current) {
            clearTimeout(wsReconnectRef.current);
            wsReconnectRef.current = null;
          }
          reconnectAttemptsRef.current = 0; // Immediate fresh attempt
          void connectWebSocket();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrOnline);
    window.addEventListener("online", handleVisibilityOrOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrOnline);
      window.removeEventListener("online", handleVisibilityOrOnline);
    };
  }, [connectWebSocket]);

  // Orders Actions
  const onUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setError(null);
    try {
      const updated = await apiRequest<AdminOrder>(
        `/api/admin/orders/${orderId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? updated : o))
      );
      setNotice(`Order #${orderId.slice(0, 8)} moved to ${nextStatus}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update order status."
      );
    }
  };

  const onCancelOrder = async (orderId: string) => {
    setError(null);
    try {
      const updated = await apiRequest<AdminOrder>(
        `/api/admin/orders/${orderId}/cancel`,
        { method: "POST" }
      );
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? updated : o))
      );
      setNotice(`Order #${orderId.slice(0, 8)} cancelled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    }
  };

  const kpis = useMemo(() => {
    const openOrders = orders.filter(
      (order) =>
        order.status !== "COMPLETED" &&
        order.status !== "CANCELLED" &&
        order.status !== "REFUNDED"
    ).length;
    const pendingVerification = orders.filter(
      (order) => order.status === "PENDING_VERIFICATION"
    ).length;
    const paidOrPreparing = orders.filter(
      (order) => order.status === "PAID" || order.status === "PAYMENT_PENDING"
    ).length;
    const completionRate = orders.length
      ? Math.round(
        (orders.filter((order) => order.status === "COMPLETED").length /
          orders.length) *
        100
      )
      : 0;

    return {
      openOrders,
      pendingVerification,
      paidOrPreparing,
      completionRate,
    };
  }, [orders]);

  const onDeleteOrder = async (orderId: string) => {
    setError(null);
    try {
      await apiRequest(`/api/billing/bills/${orderId}`, { method: "DELETE" });
      setOrders((current) => current.filter((o) => o.id !== orderId));
      setNotice(`Order #${orderId.slice(0, 8)} deleted permanently.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      throw err; // So caller can handle failure if needed
    }
  };

  return {
    orders,
    setOrders,
    wsStatus,
    kpis,
    fetchOrders,
    onUpdateOrderStatus,
    onCancelOrder,
    onDeleteOrder,
  };
}
