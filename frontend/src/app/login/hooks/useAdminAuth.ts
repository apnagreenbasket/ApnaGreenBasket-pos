/**
 * useAdminAuth — Custom hook for admin dashboard authentication state.
 *
 * Manages access/refresh tokens, login, logout, token refresh,
 * and provides an authenticated `apiRequest` wrapper.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  type LoginResponse,
} from "../adminTypes";
import { parseApiResponse } from "../adminUtils";

export function getRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    return payload.role || null;
  } catch {
    return null;
  }
}

export function getUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    return payload.sub || null;
  } catch {
    return null;
  }
}

export function useAdminAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Read stored token safely on mount to prevent SSR hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      const storedToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      if (storedToken) {
        setAccessToken(storedToken);
      }
    }
  }, []);

  const userRole = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const currentUserId = useMemo(() => getUserIdFromToken(accessToken), [accessToken]);
  const isAdminRole = useMemo(() => {
    if (!userRole) return false;
    return ["SUPERADMIN", "OUTLET_ADMIN", "MANAGER"].includes(userRole.toUpperCase());
  }, [userRole]);

  const authHeaders = useMemo(() => {
    if (!accessToken) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const refreshTokenPromiseRef = useRef<Promise<string | null> | null>(null);

  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    if (refreshTokenPromiseRef.current) {
      return refreshTokenPromiseRef.current;
    }

    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    refreshTokenPromiseRef.current = (async () => {
      try {
        const apiBase = getApiBaseUrl();
        const response = await fetch(`${apiBase}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          window.localStorage.removeItem(ACCESS_TOKEN_KEY);
          window.localStorage.removeItem(REFRESH_TOKEN_KEY);
          setAccessToken(null);
          return null;
        }

        const data = (await response.json()) as LoginResponse;
        setAccessToken(data.access_token);
        window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        return data.access_token;
      } catch {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        return null;
      } finally {
        refreshTokenPromiseRef.current = null;
      }
    })();

    return refreshTokenPromiseRef.current;
  }, []);

  const apiRequest = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!authHeaders) throw new Error("Please sign in first.");

      const apiBase = getApiBaseUrl();
      let response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          ...authHeaders,
          ...(options?.headers || {}),
        },
      });

      if (response.status === 401) {
        if (path.includes("/pin-switch") || path.includes("/pin-login") || path.includes("/login")) {
          return parseApiResponse<T>(response);
        }

        const newAccessToken = await tryRefreshToken();
        if (newAccessToken) {
          response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAccessToken}`,
              ...(options?.headers || {}),
            },
          });
        } else {
          setAccessToken(null);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(ACCESS_TOKEN_KEY);
            window.localStorage.removeItem(REFRESH_TOKEN_KEY);
          }
          throw new Error("Please sign in first.");
        }
      }

      // Transient retry for GET requests (e.g. during dev server reload)
      if ((!options?.method || options.method.toUpperCase() === "GET") && response.status >= 500 && response.status <= 504) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        response = await fetch(`${apiBase}${path}`, {
          ...options,
          headers: {
            ...authHeaders,
            ...(options?.headers || {}),
          },
        });
      }

      return parseApiResponse<T>(response);
    },
    [authHeaders, tryRefreshToken]
  );

  const login = useCallback(
    async (email: string, password: string, outlet_id?: string): Promise<LoginResponse> => {
      const apiBase = getApiBaseUrl();
      const payload: { email: string; password: string; outlet_id?: string } = { email, password };
      if (outlet_id) {
        payload.outlet_id = outlet_id;
      }
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await parseApiResponse<LoginResponse>(response);

      if (data.role === "SUPERADMIN") {
        throw new Error(
          "Superadmin accounts cannot access the Outlet dashboard. Please use the Superadmin Console at /superadmin."
        );
      }

      setAccessToken(data.access_token);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      return data;
    },
    []
  );

  const pinLogin = useCallback(
    async (outlet_id: string, staff_id: string, pin: string): Promise<LoginResponse> => {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/staff/pin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id, staff_id, pin }),
      });

      const data = await parseApiResponse<LoginResponse>(response);

      setAccessToken(data.access_token);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

      return data;
    },
    []
  );

  const setSessionToken = useCallback((newToken: string) => {
    setAccessToken(newToken);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, newToken);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // Ignore
    }

    setAccessToken(null);
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [accessToken]);

  return {
    accessToken,
    isMounted,
    authHeaders,
    apiRequest,
    login,
    pinLogin,
    logout,
    userRole,
    currentUserId,
    isAdminRole,
    setSessionToken,
  };
}
