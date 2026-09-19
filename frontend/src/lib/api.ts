/**
 * Get the backend API base URL dynamically.
 * On laptop browser: http://localhost:8000
 * On smartphone connected via Wi-Fi: http://192.168.x.x:8000
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    // Return relative URL on client when no explicit NEXT_PUBLIC_API_URL is configured
    return "";
  }
  return "http://localhost:8000";
}

export function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const apiBase = getApiBaseUrl();
  return `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Parse a datetime string from the backend as UTC.
 * Naive ISO strings (e.g. "2026-08-08T19:15:00.000000") without 'Z' or offset
 * are parsed as local time by browsers unless 'Z' is appended.
 */
export function parseUTCDate(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  if (!str.endsWith("Z") && !str.includes("+") && !str.includes("-", 10)) {
    return new Date(str + "Z");
  }
  return new Date(str);
}

/**
 * Format a Date object as 'YYYY-MM-DD' in local timezone (never UTC).
 * Prevents the midnight-to-5:30 AM IST rollback caused by .toISOString().split('T')[0].
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

