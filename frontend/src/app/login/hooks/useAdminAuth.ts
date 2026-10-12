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
          if (response.status === 401 || response.status === 400 || response.status === 403) {
            window.localStorage.removeItem(ACCESS_TOKEN_KEY);
            window.localStorage.removeItem(REFRESH_TOKEN_KEY);
            setAccessToken(null);
          }
          return null;
        }

        const data = (await response.json()) as LoginResponse;
        setAccessToken(data.access_token);
        window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        return data.access_token;
      } catch {
        // Network blip during refresh - do not erase tokens immediately
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
      const primaryUrl = path.startsWith("http://") || path.startsWith("https://")
        ? path
        : `${apiBase}${path}`;
      const fallbackUrl = (!path.startsWith("http://") && !path.startsWith("https://") && apiBase)
        ? path
        : null;

      let currentHeaders: Record<string, string> = {
        ...authHeaders,
        ...((options?.headers as Record<string, string>) || {}),
      };

      const MAX_ATTEMPTS = 3;
      let lastError: any = null;
      let lastResponse: Response | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1000 : 2000));
        }

        const requestUrl = (attempt > 0 && fallbackUrl) ? fallbackUrl : primaryUrl;

        let response: Response;
        try {
          response = await fetch(requestUrl, {
            ...options,
            headers: currentHeaders,
          });
        } catch (fetchErr: any) {
          lastError = fetchErr;
          console.warn(`[useAdminAuth.apiRequest] Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed for ${requestUrl}:`, fetchErr?.message || fetchErr);
          if (attempt === 0 && fallbackUrl && fallbackUrl !== requestUrl) {
            try {
              response = await fetch(fallbackUrl, {
                ...options,
                headers: currentHeaders,
              });
            } catch (fallbackErr: any) {
              lastError = fallbackErr;
              continue;
            }
          } else {
            continue;
          }
        }

        // Handle 401 Unauthorized (token refresh)
        if (response.status === 401) {
          if (path.includes("/pin-switch") || path.includes("/pin-login") || path.includes("/login")) {
            return parseApiResponse<T>(response);
          }

          const newAccessToken = await tryRefreshToken();
          if (newAccessToken) {
            currentHeaders = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAccessToken}`,
              ...((options?.headers as Record<string, string>) || {}),
            };
            try {
              response = await fetch(primaryUrl, {
                ...options,
                headers: currentHeaders,
              });
            } catch (retryFetchErr: any) {
              lastError = retryFetchErr;
              continue;
            }
          } else {
            setAccessToken(null);
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(ACCESS_TOKEN_KEY);
              window.localStorage.removeItem(REFRESH_TOKEN_KEY);
            }
            throw new Error("Please sign in first.");
          }
        }

        // If 502, 503, or 504 (server waking up on Render or gateway timeout), retry
        if (response.status >= 502 && response.status <= 504 && attempt < MAX_ATTEMPTS - 1) {
          lastResponse = response;
          console.warn(`[useAdminAuth.apiRequest] Gateway ${response.status} on attempt ${attempt + 1}/${MAX_ATTEMPTS} for ${requestUrl}, retrying...`);
          continue;
        }

        return parseApiResponse<T>(response);
      }

      if (lastResponse) {
        return parseApiResponse<T>(lastResponse);
      }

      throw new Error(
        lastError?.message?.includes("Failed to fetch") || lastError?.message?.includes("Network")
          ? "Unable to connect to server. The server may be waking up or your internet was interrupted. Please try again."
          : (lastError?.message || "Server connection failed after multiple attempts.")
      );
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
