"use client";

import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  maxKeyIntervalMs?: number;
  minBarcodeLength?: number;
  enabled?: boolean;
}

function isEditableElement(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "").toLowerCase();
    return !["button", "checkbox", "radio", "submit", "reset", "file", "image"].includes(type);
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * useBarcodeScanner — Listens for hardware USB / Bluetooth keyboard wedge barcode scanners.
 * Hardware scanners rapidly emit individual characters (< 35ms per key) followed by Enter.
 *
 * Typing safety:
 * - When user is typing inside an editable text input (Customer Name, Phone, Search, Notes, etc.),
 *   printable keystrokes are NEVER suppressed with preventDefault() and NEVER reverted mid-word.
 *   This guarantees that fast human typing is 100% responsive with zero dropped characters.
 * - If a real hardware scanner fires into an active text field, the burst completes with Enter
 *   at ultra-high speed (< 40ms avg), whereupon the field is cleanly restored and the barcode is processed.
 */
export function useBarcodeScanner({
  onScan,
  maxKeyIntervalMs = 45, // Hardware scanners emit keystrokes at 10-25ms; human typing is > 45ms avg
  minBarcodeLength = 3,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const scanStartTimeRef = useRef<number>(0);
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

      // Ignore lone modifier keys from interfering with scanner buffer timing
      if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "CapsLock") {
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      const activeEl = document.activeElement;
      const inEditableInput = isEditableElement(activeEl);

      // Handle Enter (end of barcode scan)
      if (key === "Enter") {
        const buf = bufferRef.current;
        const totalDuration = now - scanStartTimeRef.current;
        const avgInterval = buf.length > 1 ? totalDuration / (buf.length - 1) : timeDiff;

        // A true hardware barcode scan:
        // 1. Buffer has >= minBarcodeLength characters
        // 2. Was flagged as a fast scanning burst
        // 3. The Enter key itself arrived rapidly after the last character (<= 60ms)
        // 4. The overall average key interval was within barcode scanner speed (<= maxKeyIntervalMs)
        const isVerifiedBarcodeScan =
          isScanningRef.current &&
          buf.length >= minBarcodeLength &&
          timeDiff <= Math.max(60, maxKeyIntervalMs) &&
          avgInterval <= Math.max(50, maxKeyIntervalMs);

        if (isVerifiedBarcodeScan) {
          e.preventDefault();
          e.stopPropagation();

          // Restore active input if it was an ordinary text input that caught the scan
          revertTargetInput();
          targetInputRef.current = null;
          bufferRef.current = "";
          isScanningRef.current = false;

          onScanRef.current(buf);
        } else {
          // Normal human Enter or invalid sequence — simply reset scanner state
          bufferRef.current = "";
          isScanningRef.current = false;
          targetInputRef.current = null;
        }
        return;
      }

      // Printable single character handling
      if (key.length === 1) {
        if (timeDiff > 150) {
          // Starting a brand new sequence after idle time (> 150ms)
          bufferRef.current = key;
          scanStartTimeRef.current = now;
          isScanningRef.current = false;

          if (inEditableInput) {
            targetInputRef.current = activeEl;
            initialInputValueRef.current = activeEl.value;
          } else {
            targetInputRef.current = null;
            initialInputValueRef.current = "";
          }
        } else if (timeDiff <= maxKeyIntervalMs) {
          // Rapid keystroke (<= 45ms) — hardware barcode scanner speed
          isScanningRef.current = true;
          bufferRef.current += key;

          if (!inEditableInput) {
            // When NOT in an editable input, suppress keys to avoid triggering page shortcuts
            e.preventDefault();
            e.stopPropagation();
          }
          // Note: When inside an editable input, we NEVER call e.preventDefault() or revertTargetInput() mid-stream!
          // This allows human typing to proceed with 100% native fluidity and 0 dropped keys.
          // If this turns out to be a barcode scan, revertTargetInput() cleanly restores the input on Enter.
        } else if (isScanningRef.current && timeDiff <= 80) {
          // Mid-scan burst with minor USB polling frame jitter
          bufferRef.current += key;

          if (!inEditableInput) {
            e.preventDefault();
            e.stopPropagation();
          }
        } else {
          // Human typing interval (> 45ms and not in an active scanner burst)
          bufferRef.current = key;
          scanStartTimeRef.current = now;
          isScanningRef.current = false;

          if (inEditableInput) {
            targetInputRef.current = activeEl;
            initialInputValueRef.current = activeEl.value;
          } else {
            targetInputRef.current = null;
            initialInputValueRef.current = "";
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [enabled, maxKeyIntervalMs, minBarcodeLength]);
}
