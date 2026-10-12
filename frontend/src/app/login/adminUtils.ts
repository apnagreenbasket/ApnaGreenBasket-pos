/**
 * Admin dashboard utility functions — extracted from page.tsx
 */

import { parseUTCDate, formatLocalDate, getApiBaseUrl } from "@/lib/api";
export { parseUTCDate, formatLocalDate, getApiBaseUrl };

// ── Currency formatting ─────────────────────────────────────────────────

export const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRupees(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isNaN(numeric) ? `₹${value}` : money.format(numeric);
}

// ── Date formatting ─────────────────────────────────────────────────────

export function formatDateTime(value: string): string {
  const parsed = parseUTCDate(value);
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── API response parser & Auth Error Helper ─────────────────────────────────────────

export function isAuthError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === "string" ? err : err.message;
  return (
    msg === "Please sign in first." ||
    msg?.includes("Invalid or expired token") ||
    msg?.includes("Unauthorized") ||
    msg?.includes("Invalid token")
  );
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  let rawText = "";
  let payload: any = {};
  try {
    rawText = await response.text();
    payload = JSON.parse(rawText);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("agb_access_token");
        window.localStorage.removeItem("agb_refresh_token");
        window.localStorage.removeItem("agb_restaurant_data");
      }
      const detail = typeof payload?.detail === "string" ? payload.detail : "Please sign in first.";
      throw new Error(detail);
    }

    let detail = "";
    if (typeof payload?.detail === "string" && payload.detail.trim()) {
      detail = payload.detail.trim();
    } else if (Array.isArray(payload?.detail) && payload.detail.length > 0) {
      detail = payload.detail
        .map((err: { msg?: string }) => err.msg || JSON.stringify(err))
        .join(", ");
    } else if (typeof payload?.message === "string" && payload.message.trim()) {
      detail = payload.message.trim();
    } else if (rawText && rawText.length < 300 && !rawText.trim().startsWith("<")) {
      detail = rawText.trim();
    }

    let endpointPath = "";
    try {
      endpointPath = response.url ? new URL(response.url, "http://localhost").pathname : "";
    } catch {
      endpointPath = "";
    }
    const prefix = endpointPath ? `[${endpointPath}] ` : "";
    const statusInfo = `${response.status}${response.statusText ? " " + response.statusText : ""}`;

    const finalMessage = detail 
      ? `${prefix}${detail}`
      : `${prefix}Request failed (${statusInfo}). Please try again.`;

    console.error(`API Error ${response.status} on ${response.url || "endpoint"}:`, detail || rawText || statusInfo);
    throw new Error(finalMessage);
  }

  return payload as T;
}

/**
 * Wake/warm-up the backend. Call proactively when opening billing pages
 * so the Render instance is ready before the user clicks Settle.
 */
export function warmUpBackend() {
  if (typeof window === "undefined") return;
  fetch("/api/health", { method: "GET" }).catch(() => {});
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("agb_access_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const apiBase = getApiBaseUrl();
  const primaryUrl = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
  const fallbackUrl = (!url.startsWith("http://") && !url.startsWith("https://") && apiBase)
    ? (url.startsWith("/") ? url : `/${url}`)
    : null;

  const MAX_RETRIES = 3;
  let lastError: any = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 2000));
    }

    const requestUrl = (attempt > 0 && fallbackUrl) ? fallbackUrl : primaryUrl;

    let response: Response;
    try {
      response = await fetch(requestUrl, { ...options, headers });
    } catch (err: any) {
      lastError = err;
      console.warn(`[adminUtils.apiRequest] Attempt ${attempt + 1}/${MAX_RETRIES} failed for ${requestUrl}:`, err?.message || err);
      if (attempt === 0 && fallbackUrl && fallbackUrl !== requestUrl) {
        try {
          response = await fetch(fallbackUrl, { ...options, headers });
        } catch (fallbackErr: any) {
          lastError = fallbackErr;
          continue;
        }
      } else {
        continue;
      }
    }

    // If 502, 503, or 504 (server waking up on Render or gateway timeout), retry
    if (response.status >= 502 && response.status <= 504 && attempt < MAX_RETRIES - 1) {
      lastResponse = response;
      console.warn(`[adminUtils.apiRequest] Gateway ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES} for ${requestUrl}, retrying...`);
      continue;
    }

    return await parseApiResponse<T>(response);
  }

  if (lastResponse) {
    return await parseApiResponse<T>(lastResponse);
  }

  console.error("All retry attempts failed for", url, lastError);
  throw new Error("Unable to connect to server. The server may be waking up or your internet connection was interrupted. Please try again.");
}

export async function uploadImageFile(file: File): Promise<string> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("agb_access_token") : null;
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch("/api/upload/image", {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await parseApiResponse<{ url: string }>(response);
  return data.url;
}
