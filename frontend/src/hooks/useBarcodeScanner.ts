"use client";

import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  maxKeyIntervalMs?: number;
  minBarcodeLength?: number;
  enabled?: boolean;
}

/**
 * useBarcodeScanner — Listens for hardware USB / Bluetooth keyboard wedge barcode scanners.
 * Hardware scanners rapidly emit individual characters (< 50ms per key) followed by Enter.
 */
export function useBarcodeScanner({
  onScan,
  maxKeyIntervalMs = 70, // Hardware scanners emit keystrokes at 10-40ms; human typing is > 100ms
  minBarcodeLength = 3,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const isScanningRef = useRef<boolean>(false);
  const targetInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const initialInputValueRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;

    const revertTargetInput = () => {
      const el = targetInputRef.current;
      if (!el) return;
      const isDedicatedBarcodeInput =
        el.getAttribute("data-barcode-input") === "true" ||
        el.name === "barcode" ||
        Boolean(el.placeholder && el.placeholder.toLowerCase().includes("barcode"));

      if (!isDedicatedBarcodeInput && el.value !== initialInputValueRef.current) {
        const newValue = initialInputValueRef.current;
        const prototype = Object.getPrototypeOf(el);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, newValue);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          el.value = newValue;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard against missing event or key (e.g. synthetic events, autofill, IME composition)
      if (!e || typeof e.key !== "string" || e.isComposing) {
        return;
      }

      const key = e.key;

      // Ignore lone modifier keys from interfering with scanner buffer timing or input suppression
      if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "CapsLock") {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Handle Enter (end of barcode scan)
      if (key === "Enter") {
        if (isScanningRef.current && (bufferRef.current?.length || 0) >= minBarcodeLength) {
          const scannedCode = bufferRef.current;
          bufferRef.current = "";
          isScanningRef.current = false;
          e.preventDefault();
          e.stopPropagation();

          // Ensure active input was restored
          revertTargetInput();
          targetInputRef.current = null;

          onScanRef.current(scannedCode);
        } else {
          bufferRef.current = "";
          isScanningRef.current = false;
          targetInputRef.current = null;
        }
        return;
      }

      // Printable single character handling
      if (key.length === 1) {
        if (timeDiff > 250) {
          // Starting a brand new key sequence after idle time
          bufferRef.current = key;
          isScanningRef.current = false;

          if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
            targetInputRef.current = document.activeElement;
            initialInputValueRef.current = document.activeElement.value;
          } else {
            targetInputRef.current = null;
            initialInputValueRef.current = "";
          }
        } else if (timeDiff <= maxKeyIntervalMs) {
          // Rapid keystroke (< 70ms) — definitive hardware barcode scanner burst!
          isScanningRef.current = true;
          bufferRef.current += key;

          // Suppress printing into the active element
          e.preventDefault();
          e.stopPropagation();

          // Clean up the 1st character that might have leaked into the input before rapid detection
          revertTargetInput();
        } else if (isScanningRef.current && timeDiff <= 160) {
          // Mid-scan burst with minor main-thread frame jitter
          bufferRef.current += key;
          e.preventDefault();
          e.stopPropagation();
          revertTargetInput();
        } else {
          // Human typing speed (> 70ms and not in an active scan burst)
          bufferRef.current = key;
          isScanningRef.current = false;
          if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
            targetInputRef.current = document.activeElement;
            initialInputValueRef.current = document.activeElement.value;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [enabled, maxKeyIntervalMs, minBarcodeLength]);
}
