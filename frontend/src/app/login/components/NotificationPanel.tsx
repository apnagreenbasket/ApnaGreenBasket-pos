"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  ExternalLink,
  Mail,
  MessageSquare,
  Package,
  RefreshCw,
  Send,
  X,
  Building2,
  Barcode,
} from "lucide-react";
import { formatDateTime, parseUTCDate, apiRequest } from "../adminUtils";

export type NotificationItem = {
  id: string;
  outlet_id: string;
  type: string;
  title: string;
  message: string;
  details?: Record<string, any> | null;
  is_read: boolean;
  channels_sent?: string[];
  created_at: string;
};

type NotificationPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  thresholdDays: number;
  onRefresh: () => void;
  onMarkRead: (id: string) => Promise<void>;
};

export function NotificationPanel({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  thresholdDays,
  onRefresh,
  onMarkRead,
}: NotificationPanelProps) {
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDispatch = async (id: string) => {
    setDispatchingId(id);
    try {
      const res = await apiRequest<{
        notification_id: string;
        dispatched_channels: string[];
        recipient_emails?: string[];
        recipient_phones?: string[];
        recipient_email?: string;
        recipient_phone?: string;
      }>(`/api/admin/notifications/${id}/dispatch`, {
        method: "POST",
      });
      const activeChannels = res.dispatched_channels.filter((c) => c !== "IN_APP");
      const recipients = [
        ...(res.recipient_emails || []),
        ...(res.recipient_phones || []),
      ];
      setDispatchStatus((prev) => ({
        ...prev,
        [id]: `Dispatched via ${activeChannels.join(", ") || "external channels"} to ${
          recipients.length > 0 ? recipients.join(", ") : "configured contacts"
        }`,
      }));
      onRefresh();
    } catch (err: any) {
      setDispatchStatus((prev) => ({
        ...prev,
        [id]: `Dispatch error: ${err?.message || "Failed"}`,
      }));
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-md bg-[var(--bg-surface)] border-l border-[var(--border-strong)] shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Bell className="h-5 w-5 text-amber-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Notifications &amp; Alerts
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Alert threshold: <span className="font-bold text-amber-400">{thresholdDays} Days</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="p-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title="Refresh Notifications"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-xs text-[var(--text-muted)] space-y-2">
              <CheckCircle className="h-10 w-10 text-emerald-400/60" />
              <p className="font-bold text-sm text-[var(--text-primary)]">All Clear!</p>
              <p>No active near-expiry or inventory notifications found for this outlet.</p>
            </div>
          ) : (
            notifications.map((item) => {
              const details = item.details || {};
              const isExpanded = expandedId === item.id;
              const isExpired = details.status === "EXPIRED" || (details.days_until_expiry != null && details.days_until_expiry < 0);

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition space-y-2.5 ${
                    item.is_read
                      ? "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 opacity-80"
                      : isExpired
                      ? "border-red-500/40 bg-red-500/10 shadow-xs"
                      : "border-amber-500/40 bg-amber-500/10 shadow-xs"
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-7 w-7 rounded-xl flex items-center justify-center ${
                          isExpired ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                          {item.title}
                        </h4>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {parseUTCDate(item.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={() => void onMarkRead(item.id)}
                        className="text-[10px] font-bold text-sky-400 hover:underline shrink-0"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>

                  {/* Message */}
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {item.message}
                  </p>

                  {/* Expanded Full Batch Specifications */}
                  {details.batch_number && (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-[var(--text-muted)] block text-[10px]">Batch Lot #</span>
                          <span className="font-mono font-bold text-amber-400">{details.batch_number}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)] block text-[10px]">Barcode</span>
                          <span className="font-mono text-[var(--text-primary)]">{details.barcode || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)] block text-[10px]">Remaining Stock</span>
                          <span className="font-mono font-bold text-emerald-400">
                            {details.remaining_quantity} {details.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)] block text-[10px]">Unit Cost / MRP</span>
                          <span className="font-mono text-[var(--text-primary)]">
                            ₹{Number(details.cost_per_unit).toFixed(2)} / {details.mrp ? `₹${Number(details.mrp).toFixed(2)}` : "N/A"}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[var(--text-muted)] block text-[10px]">Supplier Name</span>
                          <span className="font-semibold text-[var(--text-primary)]">{details.supplier_name || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Multi-channel Status & Dispatch Trigger */}
                  <div className="flex flex-col space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-semibold">
                        <span>Channels Sent:</span>
                        {(item.channels_sent || ["IN_APP"]).map((ch) => (
                          <span
                            key={ch}
                            className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono text-sky-400"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDispatch(item.id)}
                        disabled={dispatchingId === item.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-400 hover:bg-sky-500/20 transition disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" />
                        <span>{dispatchingId === item.id ? "Sending..." : "Dispatch Email, WhatsApp & SMS"}</span>
                      </button>
                    </div>

                    {dispatchStatus[item.id] && (
                      <p className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                        {dispatchStatus[item.id]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
