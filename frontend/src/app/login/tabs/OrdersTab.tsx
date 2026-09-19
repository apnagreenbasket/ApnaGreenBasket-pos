/**
 * OrdersTab — Live service board tab for the admin dashboard.
 *
 * Displays KPI summary cards and a Kanban-style order board
 * with lanes for Pending Verification, Paid, Completed, and Cancelled.
 * Extracted from admin page.tsx (lines 2683-2894).
 */

"use client";

import { useState, useMemo } from "react";
import { Activity, FileText, Eye, Download, Trash2 } from "lucide-react";
import { generateReceiptPDF } from "@/lib/pdfGenerator";
import { generateA4InvoicePDF } from "@/lib/invoiceGenerator";
import { DeleteBillModal } from "../modals/DeleteBillModal";
import type { OrderStatus } from "@/types";
import type { AdminMenuItem, AdminOrder, RestaurantProfile } from "../adminTypes";
import { lanes, LANE_NAMES } from "../adminTypes";
import { formatRupees, formatDateTime } from "../adminUtils";

type OrdersTabProps = {
  orders: AdminOrder[];
  menuItems: AdminMenuItem[];
  restaurant: RestaurantProfile | null;
  onUpdateOrderStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
};

export function OrdersTab({
  orders,
  menuItems,
  restaurant,
  onUpdateOrderStatus,
  onCancelOrder,
  onDeleteOrder,
}: OrdersTabProps) {
  const [orderToDelete, setOrderToDelete] = useState<AdminOrder | null>(null);

  const kpis = useMemo(() => {
    const openOrders = orders.filter(
      (order) =>
        order.status !== "COMPLETED" &&
        order.status !== "PARTIALLY_REFUNDED" &&
        order.status !== "CANCELLED" &&
        order.status !== "REFUNDED"
    ).length;
    const pendingVerification = orders.filter(
      (order) => order.status === "PENDING_VERIFICATION"
    ).length;
    const paidOrPreparing = orders.filter(
      (order) => order.status === "PAID" || order.status === "PAYMENT_PENDING"
    ).length;
    const completionRate = orders.length
      ? Math.round(
        (orders.filter((order) => order.status === "COMPLETED" || order.status === "PARTIALLY_REFUNDED").length /
          orders.length) *
        100
      )
      : 0;

    return { openOrders, pendingVerification, paidOrPreparing, completionRate };
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Header & KPI Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Checkout & Exit Dashboard</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Supermart queue and verification management
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Open tickets</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.openOrders}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Verification needed</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.pendingVerification}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Paid / Being verified</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.paidOrPreparing}</p>
        </article>
        <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400" />
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Fulfillment rate</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{kpis.completionRate}%</p>
        </article>
      </section>

      {/* Kanban Live Order Board */}
      <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold">Checkout Queues</h2>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Total Orders: {orders.length}
          </p>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {lanes.map((status) => {
            const laneOrders = orders.filter((order) => {
              if (status === "COMPLETED") {
                return order.status === "COMPLETED" || order.status === "PARTIALLY_REFUNDED";
              }
              if (status === "CANCELLED") {
                return order.status === "CANCELLED" || order.status === "REFUNDED";
              }
              return order.status === status;
            });
            return (
              <section
                key={status}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {LANE_NAMES[status]}
                  </p>
                  <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                    {laneOrders.length}
                  </span>
                </div>

                {laneOrders.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                    No {LANE_NAMES[status].toLowerCase()} orders
                  </p>
                ) : (
                  <div className="space-y-3">
                    {laneOrders.map((order) => (
                      <article
                        key={order.id}
                        className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 shadow-2xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              {!order.is_auto_verified && (
                                <span
                                  className="flex h-4 items-center rounded-full bg-amber-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-500"
                                  title="Verification Required"
                                >
                                  Verify
                                </span>
                              )}
                              {order.status === "PARTIALLY_REFUNDED" && (
                                <span className="flex h-4 items-center rounded-full bg-amber-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30">
                                  Partially Refunded
                                </span>
                              )}
                              {order.status === "REFUNDED" && (
                                <span className="flex h-4 items-center rounded-full bg-rose-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-rose-400 border border-rose-500/30">
                                  Refunded
                                </span>
                              )}
                              <p className="font-bold text-sm text-[var(--text-primary)] break-all">
                                {order.basket_number && order.basket_number.toUpperCase().includes("WALK")
                                  ? "Walk-In"
                                  : `Basket #${order.basket_number}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const itemsMap: Record<string, { name: string; tax_rate?: number | string | null; tax_category?: string | null }> = {};
                                  menuItems.forEach((m) => {
                                    itemsMap[m.id] = { name: m.name, tax_rate: m.tax_rate, tax_category: m.tax_category };
                                  });
                                  generateReceiptPDF(order as any, restaurant?.name || "ApnaGreen Basket", itemsMap, restaurant || {}, "view");
                                }}
                                className="flex items-center gap-0.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 text-[10px] font-bold text-cyan-500 hover:border-cyan-400 transition cursor-pointer"
                                title="View Official Bill PDF"
                              >
                                <Eye className="h-3 w-3 text-cyan-400" />
                                <span>View</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const itemsMap: Record<string, { name: string; tax_rate?: number | string | null; tax_category?: string | null }> = {};
                                  menuItems.forEach((m) => {
                                    itemsMap[m.id] = { name: m.name, tax_rate: m.tax_rate, tax_category: m.tax_category };
                                  });
                                  generateReceiptPDF(order as any, restaurant?.name || "ApnaGreen Basket", itemsMap, restaurant || {}, "download");
                                }}
                                className="flex items-center gap-0.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-brand)] hover:border-[var(--accent-brand)] transition cursor-pointer"
                                title="Download Official Bill PDF"
                              >
                                <Download className="h-3 w-3 text-[var(--accent-brand)]" />
                                <span>Bill</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const itemsMap: Record<string, { name: string; tax_rate?: number | string | null; tax_category?: string | null }> = {};
                                  menuItems.forEach((m) => {
                                    itemsMap[m.id] = { name: m.name, tax_rate: m.tax_rate, tax_category: m.tax_category };
                                  });
                                  generateA4InvoicePDF(order as any, restaurant?.name || "ApnaGreen Basket", itemsMap, restaurant || {}, "download");
                                }}
                                className="flex items-center gap-0.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-400 hover:border-purple-400 transition cursor-pointer"
                                title="Download A4 Tax Invoice"
                              >
                                <Download className="h-3 w-3 text-purple-400" />
                                <span>Invoice</span>
                              </button>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono text-xs font-bold text-[var(--accent-brand)]">
                              {formatRupees(order.total_amount)}
                            </p>
                            {(order.status === "PARTIALLY_REFUNDED" || Number((order as any).total_refunded_amount) > 0) && (
                              <>
                                <p className="font-mono text-[10px] font-bold text-rose-400">
                                  -{formatRupees((order as any).total_refunded_amount || 0)}
                                </p>
                                <p className="font-mono text-[10px] font-bold text-emerald-400">
                                  Net: {formatRupees((order as any).net_amount !== undefined ? (order as any).net_amount : (Number(order.total_amount) - Number((order as any).total_refunded_amount || 0)))}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        <p className="font-mono text-[11px] text-[var(--text-muted)]">
                          ID: {order.id.slice(0, 8)} · {formatDateTime(order.created_at)}
                        </p>

                        {order.customer_name && (
                          <p className="text-xs text-[var(--text-secondary)] font-medium">
                            Customer: {order.customer_name}
                          </p>
                        )}

                        {order.items.length > 0 && (
                          <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1">
                            {order.items.map((item) => {
                              const itemName = menuItems.find((m) => m.id === item.menu_item_id)?.name || "Product";
                              return (
                                <div key={item.id} className="flex justify-between text-xs text-[var(--text-secondary)]">
                                  <span>{item.quantity}× {itemName}</span>
                                  <span className="font-semibold">{formatRupees(item.unit_price)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="border-t border-[var(--border-subtle)] pt-2 flex flex-wrap gap-1.5">
                          {order.status === "PENDING_VERIFICATION" && (
                            <button
                              type="button"
                              onClick={() => void onUpdateOrderStatus(order.id, "COMPLETED")}
                              className="w-full rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                            >
                              Verify Items &amp; Approve Exit (Paid Online)
                            </button>
                          )}
                          {order.status === "PAYMENT_PENDING" && (
                            <button
                              type="button"
                              onClick={() => void onUpdateOrderStatus(order.id, "COMPLETED")}
                              className="w-full rounded-lg bg-[var(--accent-brand)] px-2.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
                            >
                              {!order.is_auto_verified ? "Verify Items & Collect Payment" : "Collect Payment"}
                            </button>
                          )}
                          {order.status !== "COMPLETED" && order.status !== "PARTIALLY_REFUNDED" && order.status !== "CANCELLED" && order.status !== "REFUNDED" && (
                            <button
                              type="button"
                              onClick={() => void onCancelOrder(order.id)}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-500/40 transition"
                            >
                              Cancel Order
                            </button>
                          )}
                          {order.status !== "COMPLETED" && order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED" && order.status !== "REFUNDED" && (
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(order)}
                              className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white transition flex items-center justify-center gap-1.5"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete Bill
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      {orderToDelete && (
        <DeleteBillModal
          isOpen={true}
          onClose={() => setOrderToDelete(null)}
          order={orderToDelete}
          onConfirm={async (id) => {
            await onDeleteOrder(id);
            setOrderToDelete(null);
          }}
        />
      )}
    </div>
  );
}
