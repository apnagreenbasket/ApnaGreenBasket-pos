/**
 * AbandonedCartsPanel — Baskets & Abandoned Carts Slide-out Overlay.
 *
 * Extracted from admin page.tsx (lines 2490-2622).
 */

"use client";

import { ArchiveX, CheckCheck, Loader2, Radio, ShoppingBag, ShoppingCart, X } from "lucide-react";
import type { AbandonedCart, ActiveSession } from "@/types";
import { parseUTCDate } from "../adminUtils";
import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";

type AbandonedCartsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  activeSessions: ActiveSession[];
  abandonedCarts: AbandonedCart[];
  isLoadingCarts: boolean;
  terminateSession: (sessionId: string, reason?: string) => Promise<void>;
  convertAbandonedCart: (cartId: string) => Promise<void>;
  dismissAbandonedCart: (cartId: string) => Promise<void>;
  onAssistSession?: (session: ActiveSession) => void;
};

export function AbandonedCartsPanel({
  isOpen,
  onClose,
  activeSessions,
  abandonedCarts,
  isLoadingCarts,
  terminateSession,
  convertAbandonedCart,
  dismissAbandonedCart,
  onAssistSession,
}: AbandonedCartsPanelProps) {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: () => {},
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-[var(--bg-surface)] shadow-2xl border-l border-[var(--border-subtle)] flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold">Baskets &amp; Carts</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Active Sessions */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-emerald-500" />
              Active Basket Sessions ({activeSessions.length})
            </h3>
            {activeSessions.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic">No active sessions right now.</p>
            ) : (
              <div className="space-y-2">
                {activeSessions.map((s) => {
                  const expiresIn = Math.max(0, Math.floor((parseUTCDate(s.expires_at).getTime() - Date.now()) / 60000));
                  return (
                    <div key={s.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="font-semibold text-sm">{s.customer_name}</span>
                          <span className="text-xs text-[var(--text-muted)]">• Basket {s.basket_number}</span>
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">{s.order_count} order{s.order_count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-[var(--text-muted)]">
                          Expires in {expiresIn} min
                        </span>
                        <div className="flex items-center gap-2">
                          {onAssistSession && (
                            <button
                              onClick={() => onAssistSession(s)}
                              className="text-xs font-bold text-[var(--accent-brand)] hover:underline transition"
                            >
                              + Assist / Add Items
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setConfirmState({
                                isOpen: true,
                                title: "Terminate Session",
                                message: `Are you sure you want to terminate the session for ${s.customer_name}?`,
                                action: () => void terminateSession(s.id),
                              });
                            }}
                            className="text-xs font-semibold text-rose-500 hover:text-rose-400 transition"
                          >
                            Terminate
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Abandoned Carts */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5 text-amber-500" />
              Abandoned Carts ({abandonedCarts.filter((c) => c.status === "ABANDONED").length})
            </h3>
            {isLoadingCarts ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : abandonedCarts.filter((c) => c.status === "ABANDONED").length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] italic">No abandoned carts.</p>
            ) : (
              <div className="space-y-2">
                {abandonedCarts.filter((c) => c.status === "ABANDONED").map((cart) => (
                  <div key={cart.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm">{cart.customer_name}</span>
                        <span className="text-xs text-[var(--text-muted)] ml-2">Basket {cart.basket_number}</span>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {parseUTCDate(cart.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {((cart.items as any[]) || []).length} item{((cart.items as any[]) || []).length !== 1 ? "s" : ""} • ₹{cart.total_estimate.toFixed(2)}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                      {((cart.items as any[]) || []).slice(0, 3).map((item: any, i) => (
                        <div key={i}>{item.name} × {item.quantity}</div>
                      ))}
                      {((cart.items as any[]) || []).length > 3 && (
                        <div className="italic">+{(cart.items as any[] || []).length - 3} more...</div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void convertAbandonedCart(cart.id)}
                        className="flex items-center justify-center gap-1 rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-on-accent)] hover:opacity-90 transition shadow-xs"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Convert to Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmState({
                            isOpen: true,
                            title: "Dismiss Cart",
                            message: `Are you sure you want to dismiss the abandoned cart for ${cart.customer_name}?`,
                            action: () => void dismissAbandonedCart(cart.id),
                          });
                        }}
                        className="flex items-center justify-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-rose-400 hover:border-rose-400/40 transition"
                      >
                        <ArchiveX className="h-3.5 w-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Previously Converted */}
          {abandonedCarts.filter((c) => c.status === "CONVERTED").length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Recently Converted ({abandonedCarts.filter((c) => c.status === "CONVERTED").length})
              </h3>
              <div className="space-y-2">
                {abandonedCarts.filter((c) => c.status === "CONVERTED").map((cart) => (
                  <div key={cart.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 opacity-60">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{cart.customer_name}</span>
                      <span className="text-xs text-emerald-500 font-semibold">✓ Converted</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Basket {cart.basket_number} • ₹{cart.total_estimate.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onClose={() => setConfirmState((s) => ({ ...s, isOpen: false }))}
        onConfirm={confirmState.action}
      />
    </div>
  );
}
