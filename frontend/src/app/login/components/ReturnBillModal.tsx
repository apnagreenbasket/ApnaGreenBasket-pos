"use client";

import React, { useRef } from "react";
import { parseUTCDate } from "../adminUtils";
import { X, Printer, Download, Building2, CheckCircle2, RotateCcw, ArrowLeft } from "lucide-react";
import type { PurchaseReturn } from "@/types";
import type { RestaurantProfile } from "../adminTypes";

interface ReturnBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseReturn: PurchaseReturn | null;
  restaurant?: RestaurantProfile | null;
}

export function ReturnBillModal({
  isOpen,
  onClose,
  purchaseReturn,
  restaurant,
}: ReturnBillModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !purchaseReturn) return null;

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Return Bill #${purchaseReturn.return_number}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 20px; color: #111; font-size: 13px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #222; padding-bottom: 10px; }
            .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 1px; }
            .sub-title { font-size: 11px; color: #555; text-transform: uppercase; margin-top: 4px; }
            .meta-grid { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px; }
            .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .table th, .table td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
            .table th { background: #f4f4f4; text-transform: uppercase; font-size: 11px; }
            .total-row { font-weight: bold; font-size: 14px; background: #eef9f2; }
            .footer { margin-top: 30px; border-top: 1px dashed #aaa; padding-top: 12px; font-size: 11px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const qty = parseFloat(String(purchaseReturn.quantity || 0));
  const cost = parseFloat(String(purchaseReturn.unit_cost || 0));
  const totalRefund = parseFloat(String(purchaseReturn.total_refund_amount || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Nav Bar */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Debit Note / Return Bill
            </span>
            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
              #{purchaseReturn.return_number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Bill Area */}
        <div className="p-6 overflow-y-auto flex-1 text-xs text-[var(--text-primary)]" ref={printRef}>
          {/* Header */}
          <div className="text-center pb-4 border-b border-[var(--border-subtle)] mb-4">
            <h2 className="font-display text-lg font-black uppercase tracking-wide text-[var(--text-primary)]">
              {restaurant?.name || "ApnaGreen Basket"}
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 uppercase tracking-wider font-semibold">
              PURCHASE RETURN BILL / DEBIT NOTE
            </p>
            {restaurant?.address && (
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{restaurant.address}</p>
            )}
          </div>

          {/* Supplier & Bill Info Meta Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 text-xs">
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">
                Vendor / Supplier Details:
              </span>
              <p className="font-bold text-[var(--text-primary)] text-sm mt-0.5">
                {purchaseReturn.supplier_name}
              </p>
              {purchaseReturn.batch_number && (
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 font-mono">
                  Batch Ref: <span className="font-bold text-cyan-400">#{purchaseReturn.batch_number}</span>
                </p>
              )}
            </div>

            <div className="text-right">
              <span className="text-[10px] text-[var(--text-muted)] uppercase block font-semibold">
                Debit Note No:
              </span>
              <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                {purchaseReturn.return_number}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                Date: {parseUTCDate(purchaseReturn.created_at).toLocaleDateString()} {parseUTCDate(purchaseReturn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              {purchaseReturn.created_by_name && (
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  Issued By: {purchaseReturn.created_by_name}
                </p>
              )}
            </div>
          </div>

          {/* Item Breakdown Table */}
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] mb-4">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3 text-center">Returned Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Cost</th>
                  <th className="py-2.5 px-3 text-right">Refund Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                <tr>
                  <td className="py-3 px-3">
                    <span className="font-sans font-bold text-[var(--text-primary)] block">
                      {purchaseReturn.item_name || "Inventory Product"}
                    </span>
                    {purchaseReturn.batch_number && (
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        Batch Lot: #{purchaseReturn.batch_number}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-400">
                    {qty.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                    ₹{cost.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400">
                    ₹{totalRefund.toFixed(2)}
                  </td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] font-bold">
                <tr>
                  <td colSpan={3} className="py-3 px-3 text-right font-sans text-xs uppercase tracking-wider text-[var(--text-primary)]">
                    Total Debit / Refund Value:
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-sm text-emerald-400">
                    ₹{totalRefund.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Reason & Notes */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Return Reason:</span>
              <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[11px]">
                {purchaseReturn.reason.replace(/_/g, " ")}
              </span>
            </div>
            {purchaseReturn.notes && (
              <div className="pt-1.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">Remarks: </span>
                {purchaseReturn.notes}
              </div>
            )}
          </div>

          {/* Sign Off */}
          <div className="mt-8 pt-4 border-t border-dashed border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>Authorized Signature: _______________________</span>
            <span>Generated via ApnaGreen Basket POS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
