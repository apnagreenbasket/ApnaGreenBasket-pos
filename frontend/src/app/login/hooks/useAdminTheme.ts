/**
 * useAdminTheme — Custom hook for admin dashboard theme management.
 *
 * Reads/writes theme preference to localStorage and toggles
 * data-theme attribute + dark class on document.documentElement.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

export type AdminTheme = "light" | "dark";

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminTheme>("light");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = (localStorage.getItem("app_theme") as AdminTheme) || "light";
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
      if (stored === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem("app_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
