"use client";

import React from "react";
import { useSession } from "@/context/SessionContext";
import { useCart } from "@/context/CartContext";

/**
 * Floating session expiry warning — shown ~2 min before session expires.
 * "Extend Session" button extends by outlet-configured duration.
 * On actual expiry: pushes local cart to backend as abandoned cart, then clears.
 */
export default function SessionExpiryWarning() {
  const {
    isSessionActive,
    isExpiryWarning,
    isExpired,
    timeRemaining,
    sessionDurationMinutes,
    extendSession,
    abandonCart,
    clearSession,
  } = useSession();

  const { cart, totalAmount, clearCart } = useCart();

  const [isExtending, setIsExtending] = React.useState(false);
  const [hasHandledExpiry, setHasHandledExpiry] = React.useState(false);

  // Handle actual expiry — push cart and clear session
  React.useEffect(() => {
    if (isExpired && !hasHandledExpiry && isSessionActive) {
      setHasHandledExpiry(true);
      (async () => {
        // Push local cart to backend as abandoned cart
        if (cart.length > 0) {
          await abandonCart(cart, totalAmount);
        }
        clearCart();
        clearSession();
      })();
    }
  }, [
    isExpired,
    hasHandledExpiry,
    isSessionActive,
    cart,
    totalAmount,
    abandonCart,
    clearCart,
    clearSession,
  ]);

  // Reset handled flag when session becomes active again
  React.useEffect(() => {
    if (isSessionActive && !isExpired) {
      setHasHandledExpiry(false);
    }
  }, [isSessionActive, isExpired]);

  const handleExtend = async () => {
    setIsExtending(true);
    try {
      await extendSession();
    } finally {
      setIsExtending(false);
    }
  };

  const handleDecline = async () => {
    // Customer declines to extend — push cart and clear
    if (cart.length > 0) {
      await abandonCart(cart, totalAmount);
    }
    clearCart();
    clearSession();
  };

  if (!isSessionActive || !isExpiryWarning || isExpired) return null;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div
      id="session-expiry-warning"
      className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="mx-4 mb-4 sm:mb-0 w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          background: "var(--bg-surface-elevated, #1e293b)",
          border: "1px solid var(--border-strong, #334155)",
        }}
      >
        {/* Timer icon */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full"
            style={{ background: "rgba(245, 158, 11, 0.15)" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <h3
              className="text-lg font-bold"
              style={{ color: "var(--text-primary, #f1f5f9)" }}
            >
              Session Expiring Soon
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--text-muted, #94a3b8)" }}
            >
              Your basket session is about to expire
            </p>
          </div>
        </div>

        {/* Countdown */}
        <div
          className="text-center py-4 mb-4 rounded-xl"
          style={{ background: "rgba(245, 158, 11, 0.1)" }}
        >
          <p
            className="text-3xl font-mono font-bold"
            style={{ color: "#f59e0b" }}
          >
            {timeStr}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--text-muted, #94a3b8)" }}
          >
            Time remaining
          </p>
        </div>

        {/* Info */}
        {cart.length > 0 && (
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-secondary, #cbd5e1)" }}
          >
            You have{" "}
            <strong>
              {cart.length} item{cart.length !== 1 ? "s" : ""}
            </strong>{" "}
            in your basket. Extend to keep shopping, or your cart will be saved
            for staff to process.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: "var(--bg-surface, #0f172a)",
              color: "var(--text-muted, #94a3b8)",
              border: "1px solid var(--border-strong, #334155)",
            }}
          >
            End Session
          </button>
          <button
            onClick={handleExtend}
            disabled={isExtending}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
            style={{
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              color: "#fff",
              opacity: isExtending ? 0.7 : 1,
            }}
          >
            {isExtending
              ? "Extending..."
              : `Extend ${sessionDurationMinutes} min`}
          </button>
        </div>
      </div>
    </div>
  );
}
