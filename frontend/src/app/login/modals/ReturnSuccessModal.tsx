"use client";

import React from "react";
import { CheckCircle2, Download, Eye, Printer, RotateCcw, X } from "lucide-react";
import { generateReturnReceiptPDF, type ReturnPdfData } from "@/lib/pdfGenerator";

type ReturnSuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  returnData: ReturnPdfData | null;
  restaurantName?: string;
  restaurant?: any;
  menuItemsMap?: Record<string, any>;
};

export function ReturnSuccessModal({
  isOpen,
  onClose,
  returnData,
  restaurantName = "ApnaGreen Basket",
  restaurant,
  menuItemsMap,
}: ReturnSuccessModalProps) {
  if (!isOpen || !returnData) return null;

  const handleView = () => {
    generateReturnReceiptPDF(returnData, restaurantName, restaurant, "view", menuItemsMap);
  };

  const handleDownload = () => {
    generateReturnReceiptPDF(returnData, restaurantName, restaurant, "download", menuItemsMap);
  };

  const origBillText =
    returnData.original_bill_number ||
    (returnData.order_id ? `#${returnData.order_id.slice(0, 8).toUpperCase()}` : "Direct Return (No Bill)");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header Badge */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
            Return Processed Successfully!
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Inventory has been restocked and return bill generated.
          </p>
        </div>

        {/* Info Grid */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-3">
          <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] font-semibold">Return Bill No:</span>
            <span className="font-mono font-bold text-sky-400">{returnData.return_number}</span>
          </div>

          <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] font-semibold">Original Bill Ref:</span>
            <span className="font-mono font-bold text-[var(--text-primary)]">{origBillText}</span>
          </div>

          {returnData.customer_name && (
            <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] font-semibold">Customer:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {returnData.customer_name} {returnData.customer_phone ? `(${returnData.customer_phone})` : ""}
              </span>
            </div>
          )}

          {/* Returned Items List */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
              Returned Line Items:
            </span>
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {(returnData.returned_items || []).map((item, idx) => {
                const itemUnit = item.selected_unit || (item as any).unit || (item as any).unit_label || (item.menu_item_id && menuItemsMap?.[item.menu_item_id]?.unit_label) || "";
                return (
                  <div key={idx} className="flex justify-between items-center text-xs font-mono text-[var(--text-primary)]">
                    <span>
                      {item.item_name} × {item.quantity} {itemUnit}
                    </span>
                    <span className="font-bold text-sky-400">
                      ₹{(item.line_refund !== undefined ? Number(item.line_refund) : item.quantity * Number(item.unit_price)).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exchange Items List if present */}
          {returnData.exchange_items && returnData.exchange_items.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                Exchanged Line Items:
              </span>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {returnData.exchange_items.map((item: any, idx: number) => {
                  const itemUnit = item.selected_unit || item.unit || item.unit_label || (item.menu_item_id && menuItemsMap?.[item.menu_item_id]?.unit_label) || "";
                  return (
                    <div key={idx} className="flex justify-between items-center text-xs font-mono text-[var(--text-primary)]">
                      <span>
                        {item.item_name} × {item.quantity} {itemUnit}
                      </span>
                      <span className="font-bold text-emerald-400">
                        ₹{Number(item.line_total || item.quantity * Number(item.unit_price)).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Round Off Adjustment */}
          {returnData.round_off !== undefined && Math.abs(returnData.round_off) > 0.001 && (
            <div className="flex justify-between text-xs font-mono text-amber-400 pt-1 border-t border-[var(--border-subtle)]">
              <span>Round Off:</span>
              <span className="font-bold">{returnData.round_off > 0 ? "+" : ""}₹{Number(returnData.round_off).toFixed(2)}</span>
            </div>
          )}

          {/* Total Net Refund */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between items-center">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              Net Refund ({returnData.refund_payment_method || "CASH"}):
            </span>
            <span className="font-mono text-lg font-black text-sky-400">
              ₹{returnData.total_refund_amount.toFixed(2)}
            </span>
          </div>

          {/* Wallet / Credit / Debit Adjustments */}
          {((returnData as any).credit_applied > 0 ||
            (returnData as any).debit_applied > 0 ||
            (returnData as any).debt_settled > 0 ||
            (returnData as any).credit_awarded > 0 ||
            (returnData as any).credit_cashed_out > 0 ||
            (returnData as any).wallet_balance_after !== undefined) && (
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1 text-xs font-mono">
              {(returnData as any).credit_applied > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Store Credit Applied:</span>
                  <span className="font-bold">₹{Number((returnData as any).credit_applied).toFixed(2)}</span>
                </div>
              )}
              {(returnData as any).debit_applied > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Recorded as Udhaar (Shortfall):</span>
                  <span className="font-bold">₹{Number((returnData as any).debit_applied).toFixed(2)}</span>
                </div>
              )}
              {(returnData as any).debt_settled > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Old Debt Cleared:</span>
                  <span className="font-bold">₹{Number((returnData as any).debt_settled).toFixed(2)}</span>
                </div>
              )}
              {(returnData as any).credit_awarded > 0 && (
                <div className="flex justify-between text-sky-400">
                  <span>Store Credit Awarded:</span>
                  <span className="font-bold">₹{Number((returnData as any).credit_awarded).toFixed(2)}</span>
                </div>
              )}
              {(returnData as any).credit_cashed_out > 0 && (
                <div className="flex justify-between text-purple-400">
                  <span>Store Credit Cashed Out:</span>
                  <span className="font-bold">₹{Number((returnData as any).credit_cashed_out).toFixed(2)}</span>
                </div>
              )}
              {(returnData as any).wallet_balance_after !== undefined && (returnData as any).wallet_balance_after !== null && (
                <div className="flex justify-between pt-1 border-t border-[var(--border-subtle)] font-bold">
                  <span className="text-[var(--text-muted)]">Wallet Balance After:</span>
                  <span className={(returnData as any).wallet_balance_after >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {(returnData as any).wallet_balance_after >= 0
                      ? `₹${Number((returnData as any).wallet_balance_after).toFixed(2)} (Cr)`
                      : `-₹${Math.abs(Number((returnData as any).wallet_balance_after)).toFixed(2)} (Dr)`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleView}
            className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 py-2.5 px-3 text-xs font-bold text-sky-400 hover:bg-sky-500/20 transition"
          >
            <Eye className="h-4 w-4" />
            <span>View Return Bill</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 px-3 text-xs font-bold text-white hover:bg-sky-600 shadow-md transition"
          >
            <Printer className="h-4 w-4" />
            <span>Print / Download</span>
          </button>
        </div>

        {/* Done / Close */}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
