/**
 * Admin dashboard utility functions — extracted from page.tsx
 */

import { parseUTCDate, formatLocalDate } from "@/lib/api";
export { parseUTCDate, formatLocalDate };

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

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("agb_access_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(url, { ...options, headers });
  return parseApiResponse<T>(response);
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
