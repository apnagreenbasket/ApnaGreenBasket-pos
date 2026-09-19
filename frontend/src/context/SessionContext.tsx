"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { getApiBaseUrl } from "@/lib/api";

/**
 * Parse a datetime string from the backend as UTC.
 * The backend returns naive datetime strings (e.g. "2026-08-08T16:55:02.686219")
 * without a trailing 'Z'. Without it, some browsers interpret the string as
 * local time, causing sessions to appear expired immediately in IST (UTC+5:30).
 */
function parseUTCDate(dateStr: string): Date {
  if (!dateStr.endsWith("Z") && !dateStr.includes("+") && !dateStr.includes("-", 10)) {
    return new Date(dateStr + "Z");
  }
  return new Date(dateStr);
}
import type {
  OrderResponse,
  StartSessionResponse,
  SessionStatusResponse,
  ExtendSessionResponse,
  AbandonCartItem,
  CartItem,
} from "@/types";

interface SessionContextType {
  // Session state
  sessionId: string | null;
  customerName: string;
  customerPhone: string;
  tableNumber: string;
  outletSlug: string;
  restaurantSlug: string; // alias to outletSlug
  isSessionActive: boolean;
  isSessionLoading: boolean;
  sessionOrders: OrderResponse[];
  expiresAt: Date | null;
  sessionDurationMinutes: number;

  // Expiry tracking
  timeRemaining: number; // seconds remaining
  isExpiryWarning: boolean; // true when <2 min left
  isExpired: boolean;

  // Actions
  startSession: (
    name: string,
    phone?: string
  ) => Promise<StartSessionResponse>;
  refreshSession: () => Promise<void>;
  extendSession: () => Promise<void>;
  abandonCart: (cartItems: CartItem[], totalAmount: number) => Promise<void>;
  clearSession: () => void;
  setTableNumber: (table: string) => void;
  setOutletSlug: (slug: string) => void;
  setRestaurantSlug: (slug: string) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const EXPIRY_WARNING_SECONDS = 120; // 2 minutes before expiry

/**
 * Build localStorage keys scoped to restaurant+table.
 */
function storageKey(slug: string, table: string, suffix: string): string {
  return `session_${slug}_${table}_${suffix}`;
}

/**
 * Convert CartItem[] to AbandonCartItem[] for the backend push.
 */
function cartToAbandonItems(cartItems: CartItem[]): AbandonCartItem[] {
  return cartItems.map((ci) => ({
    menu_item_id: ci.menuItem.id,
    variant_id: ci.selectedVariant?.id ?? null,
    name: ci.selectedVariant
      ? `${ci.menuItem.name} (${ci.selectedVariant.name})`
      : ci.menuItem.name,
    quantity: ci.quantity,
    unit_price: ci.unitPrice,
    pricing_mode: ci.menuItem.pricing_mode ?? null,
    unit_label: ci.menuItem.unit_label ?? null,
  }));
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [outletSlug, setOutletSlug] = useState("apnagreenbasket-jammu");
  const restaurantSlug = outletSlug;
  const setRestaurantSlug = setOutletSlug;
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionOrders, setSessionOrders] = useState<OrderResponse[]>([]);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isExpiryWarning, setIsExpiryWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Save session data to localStorage.
   */
  const persistSession = useCallback(
    (id: string, name: string, phone: string, expires: string) => {
      if (typeof window === "undefined") return;
      localStorage.setItem(storageKey(restaurantSlug, tableNumber, "id"), id);
      localStorage.setItem(
        storageKey(restaurantSlug, tableNumber, "name"),
        name
      );
      localStorage.setItem(
        storageKey(restaurantSlug, tableNumber, "expires"),
        expires
      );
      if (phone) {
        localStorage.setItem(
          storageKey(restaurantSlug, tableNumber, "phone"),
          phone
        );
      }
    },
    [restaurantSlug, tableNumber]
  );

  /**
   * Clear session from localStorage.
   */
  const clearSession = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey(restaurantSlug, tableNumber, "id"));
      localStorage.removeItem(storageKey(restaurantSlug, tableNumber, "name"));
      localStorage.removeItem(storageKey(restaurantSlug, tableNumber, "phone"));
      localStorage.removeItem(
        storageKey(restaurantSlug, tableNumber, "expires")
      );
    }
    setSessionId(null);
    setCustomerName("");
    setCustomerPhone("");
    setIsSessionActive(false);
    setSessionOrders([]);
    setExpiresAt(null);
    setTimeRemaining(0);
    setIsExpiryWarning(false);
    setIsExpired(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [restaurantSlug, tableNumber]);

  /**
   * Verify a stored session is still active on the backend.
   */
  const verifySession = useCallback(
    async (storedId: string): Promise<boolean> => {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/sessions/${storedId}`, {
          headers: { "bypass-tunnel-reminder": "true" },
        });
        if (!res.ok) return false;

        const data: SessionStatusResponse = await res.json();
        if (!data.is_active) return false;

        setSessionId(data.session_id);
        setCustomerName(data.customer_name);
        setIsSessionActive(true);
        setSessionOrders(data.orders || []);
        setExpiresAt(parseUTCDate(data.expires_at));
        setSessionDurationMinutes(data.session_duration_minutes);
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  /**
   * On mount: resolve URL token if present, then check localStorage for an existing session.
   */
  useEffect(() => {
    async function checkExistingSession() {
      if (typeof window === "undefined") {
        setIsSessionLoading(false);
        return;
      }

      let activeSlug = outletSlug;
      let activeTable = tableNumber;

      // Check for token query param in URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("token");
      if (urlToken) {
        try {
          const apiBase = getApiBaseUrl();
          const res = await fetch(`${apiBase}/api/sessions/resolve-token?token=${encodeURIComponent(urlToken)}`, {
            headers: { "bypass-tunnel-reminder": "true" },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.basket_number) {
              setTableNumber(data.basket_number);
              activeTable = data.basket_number;
            }
            if (data.outlet_slug) {
              setOutletSlug(data.outlet_slug);
              activeSlug = data.outlet_slug;
            }
          }
        } catch {
          /* ignore token resolution errors */
        }
      } else {
        const slugParam = urlParams.get("slug");
        const basketParam = urlParams.get("basket");
        if (slugParam) activeSlug = slugParam;
        if (basketParam) activeTable = basketParam;
      }

      const storedId = localStorage.getItem(
        storageKey(activeSlug, activeTable, "id")
      );
      const storedName = localStorage.getItem(
        storageKey(activeSlug, activeTable, "name")
      );
      const storedPhone = localStorage.getItem(
        storageKey(activeSlug, activeTable, "phone")
      );

      if (storedName) setCustomerName(storedName);
      if (storedPhone) setCustomerPhone(storedPhone);

      if (storedId) {
        const valid = await verifySession(storedId);
        if (!valid) {
          // Session expired — clear storage but keep name for auto-fill
          localStorage.removeItem(
            storageKey(activeSlug, activeTable, "id")
          );
          localStorage.removeItem(
            storageKey(activeSlug, activeTable, "expires")
          );
          setIsSessionActive(false);
          setSessionId(null);
        }
      }

      setIsSessionLoading(false);
    }

    checkExistingSession();
  }, [verifySession]);

  /**
   * Countdown timer — updates every second when session is active.
   */
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isSessionActive || !expiresAt) {
      setTimeRemaining(0);
      setIsExpiryWarning(false);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(
        0,
        Math.floor((expiresAt.getTime() - now) / 1000)
      );
      setTimeRemaining(remaining);
      setIsExpiryWarning(remaining > 0 && remaining <= EXPIRY_WARNING_SECONDS);

      if (remaining <= 0) {
        setIsExpired(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    tick(); // Immediate first tick
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isSessionActive, expiresAt]);

  /**
   * Start or resume a session via the backend.
   */
  const startSession = useCallback(
    async (name: string, phone?: string): Promise<StartSessionResponse> => {
      const apiBase = getApiBaseUrl();
      const activeTable = tableNumber.trim() || "1";
      const activeSlug = outletSlug.trim() || "apnagreenbasket-jammu";
      const res = await fetch(`${apiBase}/api/sessions/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "bypass-tunnel-reminder": "true",
        },
        body: JSON.stringify({
          outlet_slug: activeSlug,
          basket_number: activeTable,
          customer_name: name.trim(),
          customer_phone: phone?.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let errorMsg = `Session start failed (${res.status})`;
        if (typeof err?.detail === "string") {
          errorMsg = err.detail;
        } else if (Array.isArray(err?.detail)) {
          errorMsg = err.detail
            .map((item: any) =>
              typeof item === "string"
                ? item
                : item.msg || item.detail || JSON.stringify(item)
            )
            .join("; ");
        } else if (err?.detail && typeof err.detail === "object") {
          errorMsg = JSON.stringify(err.detail);
        } else if (err?.message && typeof err.message === "string") {
          errorMsg = err.message;
        }
        throw new Error(errorMsg);
      }

      const data: StartSessionResponse = await res.json();

      setSessionId(data.session_id);
      setCustomerName(data.customer_name);
      setCustomerPhone(phone?.trim() || "");
      setIsSessionActive(true);
      setSessionOrders(data.active_orders || []);
      setExpiresAt(parseUTCDate(data.expires_at));
      setSessionDurationMinutes(data.session_duration_minutes);
      setIsExpired(false);
      setIsExpiryWarning(false);

      persistSession(
        data.session_id,
        data.customer_name,
        phone?.trim() || "",
        data.expires_at
      );

      return data;
    },
    [restaurantSlug, tableNumber, persistSession]
  );

  /**
   * Extend session by calling backend.
   */
  const extendSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/extend`, {
        method: "POST",
        headers: { "bypass-tunnel-reminder": "true" },
      });
      if (!res.ok) return;

      const data: ExtendSessionResponse = await res.json();
      setExpiresAt(parseUTCDate(data.expires_at));
      setSessionDurationMinutes(data.session_duration_minutes);
      setIsExpired(false);
      setIsExpiryWarning(false);

      // Update stored expiry
      if (typeof window !== "undefined") {
        localStorage.setItem(
          storageKey(restaurantSlug, tableNumber, "expires"),
          data.expires_at
        );
      }
    } catch {
      // Silently fail
    }
  }, [sessionId, restaurantSlug, tableNumber]);

  /**
   * Push local cart to backend as abandoned cart, then expire session.
   */
  const abandonCart = useCallback(
    async (cartItems: CartItem[], totalAmount: number) => {
      if (!sessionId) return;
      try {
        const apiBase = getApiBaseUrl();
        const items = cartToAbandonItems(cartItems);
        await fetch(`${apiBase}/api/sessions/${sessionId}/abandon-cart`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "bypass-tunnel-reminder": "true",
          },
          body: JSON.stringify({
            items,
            total_estimate: totalAmount,
          }),
        });
      } catch {
        // Fire and forget — don't block session cleanup
      }
    },
    [sessionId]
  );

  /**
   * Refresh session orders from backend.
   */
  const refreshSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
        headers: { "bypass-tunnel-reminder": "true" },
      });
      if (!res.ok) return;

      const data: SessionStatusResponse = await res.json();
      setIsSessionActive(data.is_active);
      setSessionOrders(data.orders || []);
      setExpiresAt(parseUTCDate(data.expires_at));
      setSessionDurationMinutes(data.session_duration_minutes);

      if (!data.is_active) {
        // Session ended — clear stored ID but keep name
        if (typeof window !== "undefined") {
          localStorage.removeItem(
            storageKey(restaurantSlug, tableNumber, "id")
          );
          localStorage.removeItem(
            storageKey(restaurantSlug, tableNumber, "expires")
          );
        }
      }
    } catch {
      // Silently fail on refresh errors
    }
  }, [sessionId, restaurantSlug, tableNumber]);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        customerName,
        customerPhone,
        tableNumber,
        outletSlug,
        restaurantSlug: outletSlug,
        isSessionActive,
        isSessionLoading,
        sessionOrders,
        expiresAt,
        sessionDurationMinutes,
        timeRemaining,
        isExpiryWarning,
        isExpired,
        startSession,
        refreshSession,
        extendSession,
        abandonCart,
        clearSession,
        setTableNumber,
        setOutletSlug,
        setRestaurantSlug: setOutletSlug,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
