"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { X, Trash2, Plus, Minus, CreditCard, QrCode, CheckCircle2, AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useSession } from "@/context/SessionContext";
import { OrderResponse, PaymentMode } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

interface CheckoutDrawerProps {
  restaurantSlug: string;
  restaurantName: string;
  allowedPaymentMode?: PaymentMode;
}

export function CheckoutDrawer({ restaurantSlug, restaurantName, allowedPaymentMode }: CheckoutDrawerProps) {
  const {
    cart,
    totalAmount,
    updateQuantity,
    removeFromCart,
    tableNumber,
    paymentMode,
    setPaymentMode,
    clearCart,
    isCartOpen,
    setIsCartOpen,
    setActiveOrder,
    setIsTicketOpen,
  } = useCart();

  const {
    sessionId,
    customerName,
    customerPhone,
    isSessionActive,
    refreshSession,
  } = useSession();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Automatically sync context paymentMode based on restaurant's allowed modes
  useEffect(() => {
    if (allowedPaymentMode === "RAZORPAY_GATEWAY" || allowedPaymentMode === "PAY_AT_COUNTER") {
      setPaymentMode(allowedPaymentMode);
    }
  }, [allowedPaymentMode, setPaymentMode]);

  // Step state: "cart" | "payment"
  const [step, setStep] = useState<"cart" | "payment">("cart");

  if (!isCartOpen) return null;

  const handleCheckout = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      outlet_slug: restaurantSlug,
      basket_number: tableNumber,
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      payment_mode: paymentMode,
      session_id: isSessionActive ? sessionId : undefined,
      items: cart.map((item) => ({
        menu_item_id: item.menuItem.id,
        variant_id: item.selectedVariant ? item.selectedVariant.id : undefined,
        quantity: item.quantity,
      })),
    };

    try {
      const apiBase = getApiBaseUrl();
      // Call FastAPI backend checkout endpoint
      const res = await fetch(`${apiBase}/api/orders/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "bypass-tunnel-reminder": "true",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Show the actual backend error instead of a generic fallback
        let errorDetail = "Razorpay payment is temporarily unavailable. Please select 'Pay At Counter' to place your order and pay at the counter.";
        try {
          const errData = await res.json();
          if (errData.detail) {
            errorDetail = `Razorpay order creation failed: ${errData.detail}. Please try again or select 'Pay At Counter' to pay at the counter.`;
          }
        } catch {
          // Response wasn't JSON
        }
        setErrorMessage(errorDetail);
        setStep("payment");
        setIsSubmitting(false);
        return;
      }

      const data = await res.json();

      if (paymentMode === "RAZORPAY_GATEWAY") {
        // Mode A: Open Razorpay Checkout modal
        const razorpayData = data as {
          order_id: string;
          razorpay_order_id: string;
          amount: number;
          currency: string;
          key_id: string;
        };

        const options = {
          key: razorpayData.key_id,
          amount: razorpayData.amount,
          currency: razorpayData.currency,
          name: restaurantName,
          description: `Order at ${restaurantName} — Basket #${tableNumber}`,
          order_id: razorpayData.razorpay_order_id,
          handler: function (_response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
            // Payment succeeded — Razorpay webhook will update DB status
            setActiveOrder({
              id: razorpayData.order_id,
              outlet_id: "outlet-1",
              basket_number: tableNumber,
              total_amount: totalAmount.toFixed(2),
              status: "PAID",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              items: [],
            } as unknown as OrderResponse);
            clearCart();
            setIsCartOpen(false);
            setIsTicketOpen(true);
            // Refresh session orders
            refreshSession();
          },
          modal: {
            ondismiss: function () {
              // User closed the payment modal without paying
              setErrorMessage("Razorpay payment was cancelled. If you are having issues, please select 'Pay At Counter' to place your order and pay at the counter.");
              setStep("payment");
            },
          },
          prefill: {
            name: customerName || undefined,
            contact: customerPhone || undefined,
          },
          theme: {
            color: "#1a7a5e",
          },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: { error: { description: string } }) {
          setErrorMessage(`Razorpay payment failed: ${response.error.description}. Please try again or select 'Pay At Counter' to pay at the counter.`);
          setStep("payment");
        });
        rzp.open();
      } else {
        // Mode B: Pay At Counter (No links/QR/screenshots)
        setActiveOrder({
          id: data.order_id,
          outlet_id: "outlet-1",
          basket_number: tableNumber,
          total_amount: totalAmount.toFixed(2),
          status: "PENDING_VERIFICATION",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: [],
        } as unknown as OrderResponse);
        clearCart();
        setIsCartOpen(false);
        setIsTicketOpen(true);
        // Refresh session orders
        refreshSession();
      }
    } catch (err) {
      // Network error — backend is unreachable
      const message = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(`Could not connect to payment server: ${message}. Please try again or select 'Pay At Counter' to pay at the counter.`);
      setStep("payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-5 shadow-2xl transition-all max-h-[90vh] flex flex-col justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            {step !== "cart" && (
              <button
                onClick={() => setStep("cart")}
                className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="font-sans text-base font-bold text-[var(--text-primary)]">
              {step === "cart" ? "Your Order Summary" : "Payment Method"}
            </h2>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Message Banner */}
        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* STEP 1: Cart Items Review */}
        {step === "cart" && (
          <div className="my-4 flex-1 overflow-y-auto pr-1 space-y-3">
            {cart.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-[var(--text-secondary)]">
                  Your order is empty
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Add items from the menu to get started
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.cartItemId}
                  className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-2xs"
                >
                  <div className="flex-1 pr-2">
                    <h4 className="font-sans text-xs font-bold text-[var(--text-primary)]">
                      {item.menuItem.name}
                    </h4>
                    {item.selectedVariant && (
                      <span className="text-[11px] font-medium text-[var(--accent-brand-text)] block">
                        Option: {item.selectedVariant.name}
                      </span>
                    )}
                    <span className="font-mono text-xs font-black text-[var(--text-primary)] mt-0.5 block">
                      ₹{(item.unitPrice * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-1">
                    <button
                      onClick={() => updateQuantity(item.cartItemId, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-xs font-bold text-[var(--text-primary)]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.cartItemId, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* Session identity indicator */}
            {cart.length > 0 && isSessionActive && customerName && (
              <div className="mt-4 rounded-2xl border border-[var(--accent-brand)]/20 bg-[var(--accent-brand)]/5 p-3.5">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Ordering as {customerName}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Basket #{tableNumber} · This order will be added to your session
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Payment Mode Selection */}
        {step === "payment" && (
          <div className="my-4 space-y-3">
            <p className="text-xs text-[var(--text-secondary)]">
              Choose how you would like to pay at Basket #{tableNumber}:
            </p>

            {(allowedPaymentMode === "PAY_AT_COUNTER" || allowedPaymentMode === "BOTH" || !allowedPaymentMode) && (
              <label
                onClick={() => setPaymentMode("PAY_AT_COUNTER")}
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                  paymentMode === "PAY_AT_COUNTER"
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand-subtle)] text-[var(--accent-brand-text)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-[var(--accent-brand)]" />
                  <div>
                    <span className="block text-xs font-bold">
                      Pay At Counter
                    </span>
                    <span className="block text-[11px] text-[var(--text-secondary)]">
                      Items verified at counter — pay before you leave
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "PAY_AT_COUNTER"}
                  onChange={() => {}}
                  className="accent-[var(--accent-brand)]"
                />
              </label>
            )}

            {(allowedPaymentMode === "RAZORPAY_GATEWAY" || allowedPaymentMode === "BOTH" || !allowedPaymentMode) && (
              <label
                onClick={() => setPaymentMode("RAZORPAY_GATEWAY")}
                className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                  paymentMode === "RAZORPAY_GATEWAY"
                    ? "border-[var(--accent-brand)] bg-[var(--accent-brand-subtle)] text-[var(--accent-brand-text)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-[var(--accent-brand)]" />
                  <div>
                    <span className="block text-xs font-bold">
                      Razorpay Automated Gateway
                    </span>
                    <span className="block text-[11px] text-[var(--text-secondary)]">
                      Instant automated webhook verification
                    </span>
                  </div>
                </div>
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "RAZORPAY_GATEWAY"}
                  onChange={() => {}}
                  className="accent-[var(--accent-brand)]"
                />
              </label>
            )}
          </div>
        )}

        {/* Footer & Action Buttons */}
        <div className="border-t border-[var(--border-subtle)] pt-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--text-muted)] block font-medium">Total</span>
            <span className="font-sans text-lg font-black text-[var(--text-primary)]">
              ₹{totalAmount.toFixed(2)}
            </span>
          </div>

          {step === "cart" ? (
            allowedPaymentMode === "RAZORPAY_GATEWAY" || allowedPaymentMode === "PAY_AT_COUNTER" ? (
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || isSubmitting}
                className="flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-6 text-sm font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
              >
                {isSubmitting
                  ? "Processing Order..."
                  : allowedPaymentMode === "RAZORPAY_GATEWAY"
                  ? `Pay with Razorpay (₹${totalAmount.toFixed(2)})`
                  : `Place Order (₹${totalAmount.toFixed(2)})`}
              </button>
            ) : (
              <button
                onClick={() => setStep("payment")}
                disabled={cart.length === 0}
                className="flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-6 text-sm font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
              >
                Proceed to Payment
              </button>
            )
          ) : (
            <button
              onClick={handleCheckout}
              disabled={isSubmitting}
              className="flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-6 text-sm font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? "Processing Order..." : `Place Order (₹${totalAmount.toFixed(2)})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
