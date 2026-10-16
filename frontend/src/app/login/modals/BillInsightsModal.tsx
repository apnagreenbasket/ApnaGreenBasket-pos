"use client";

import React from "react";
import {
  Info,
  X,
  UserCheck,
  Receipt,
  Tag,
  Truck,
  CreditCard,
  Calendar,
  Phone,
  User,
  ShoppingBag,
  Percent,
  CheckCircle2,
  Clock,
  Banknote,
  Smartphone,
} from "lucide-react";
import type { ManualBill, StaffMember } from "@/types";
import { formatRupees, formatDateTime } from "../adminUtils";

type BillInsightsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  bill: ManualBill | null;
  staffList?: StaffMember[];
};

function formatRoleLabel(role?: string | null): string {
  if (!role) return "Staff";
  const r = role.toUpperCase();
  if (r === "SUPERADMIN") return "Super Admin";
  if (r === "OUTLET_ADMIN") return "Admin";
  if (r === "MANAGER") return "Manager";
  if (r === "CASHIER") return "Cashier";
  if (r === "FLOOR_STAFF") return "Floor Staff";
  if (r === "WAITER") return "Waiter";
  if (r === "DELIVERY_BOY") return "Delivery Boy";
  return r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRoleBadgeStyle(role?: string | null): string {
  const r = (role || "").toUpperCase();
  if (r === "OUTLET_ADMIN" || r === "SUPERADMIN") {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-500/30";
  }
  if (r === "MANAGER") {
    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-500/30";
  }
  if (r === "CASHIER") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-500/30";
  }
  if (r === "FLOOR_STAFF") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-500/30";
  }
  return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-500/30";
}

export function BillInsightsModal({
  isOpen,
  onClose,
  bill,
  staffList = [],
}: BillInsightsModalProps) {
  if (!isOpen || !bill) return null;

  // Resolve biller info (who cut this bill)
  const matchedStaff = bill.created_by_staff_id
    ? staffList.find((s) => s.id === bill.created_by_staff_id)
    : null;

  const billerName =
    bill.created_by_staff_name ||
    matchedStaff?.name ||
    (bill.created_by_staff_id ? "Staff Member" : "Admin / System");

  const billerRole =
    bill.created_by_staff_role ||
    matchedStaff?.role ||
    (billerName === "Admin / System" ? "ADMIN" : "STAFF");

  // Resolve assistant info (Basket Verifier / Store Floor Assistant)
  const matchedAssistant = bill.assisted_by_staff_id
    ? staffList.find((s) => s.id === bill.assisted_by_staff_id)
    : null;

  const assistantName =
    bill.assisted_by_staff_name ||
    matchedAssistant?.name ||
    null;

  const assistantRole =
    bill.assisted_by_staff_role ||
    matchedAssistant?.role ||
    "FLOOR_STAFF";

  // Calculate discount amount in INR
  let discountAmountINR = 0;
  if (bill.discount_type) {
    if (bill.discount_type === "PERCENT") {
      discountAmountINR = ((bill.subtotal_amount || 0) * (bill.discount_value || 0)) / 100;
    } else if (bill.discount_type === "FLAT" || bill.discount_type === "COMPLIMENTARY_ITEMS") {
      discountAmountINR = bill.discount_value || 0;
    } else if (bill.discount_type === "COMPLIMENTARY") {
      discountAmountINR = bill.subtotal_amount || 0;
    }
  }
  const loyaltyDiscount = Number(bill.loyalty_discount_inr || 0);
  const totalDiscountINR = discountAmountINR + loyaltyDiscount;

  const deliveryCharge = Number(bill.delivery_charge || 0);
  const handlingCharge = Number(bill.handling_charge || 0);
  const additionalCharges = deliveryCharge + handlingCharge;
  const taxAmount = Number(bill.tax_amount || 0);

  const isWalkIn =
    !bill.customer_name ||
    bill.customer_name.trim().toLowerCase() === "walk-in" ||
    bill.customer_name.trim().toLowerCase() === "walkin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg scale-100 overflow-hidden rounded-2xl bg-[var(--bg-surface)] text-left shadow-2xl transition-all border border-[var(--border-subtle)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-sky-500/10 px-6 py-4 flex items-center gap-3 border-b border-sky-500/20 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Bill Insights</h3>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              {bill.basket_number && bill.basket_number.toUpperCase().includes("WALK")
                ? "Walk-In"
                : `Basket #${bill.basket_number}`}{" "}
              • ID: {bill.id.slice(0, 8)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Biller Highlight Section (Who cut the bill) */}
          <div className="rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                <UserCheck className="h-4 w-4" />
                <span>Billed By (Cashier)</span>
              </div>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${getRoleBadgeStyle(
                  billerRole
                )}`}
              >
                {formatRoleLabel(billerRole)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  {billerName}
                </p>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3 w-3" />
                  <span>
                    {bill.finalized_at
                      ? `Finalized on ${formatDateTime(bill.finalized_at)}`
                      : bill.created_at
                        ? `Created on ${formatDateTime(bill.created_at)}`
                        : "Date not recorded"}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    bill.status === "PAID" || bill.status === "COMPLETED"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : bill.status === "DRAFT"
                        ? "bg-amber-500/15 text-amber-600"
                        : bill.status === "VOIDED"
                          ? "bg-rose-500/15 text-rose-600"
                          : "bg-sky-500/15 text-sky-600"
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {bill.status}
                </span>
              </div>
            </div>
          </div>

          {/* Basket Verifier / Store Floor Assistant Section */}
          {assistantName ? (
            <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <ShoppingBag className="h-4 w-4" />
                  <span>Basket Verifier / Store Assistant</span>
                </div>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${getRoleBadgeStyle(
                    assistantRole
                  )}`}
                >
                  {formatRoleLabel(assistantRole)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-base font-extrabold text-[var(--text-primary)]">
                    {assistantName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                    <span>Floor assistant who guided customer with shopping basket</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                    Assisted
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/50 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                <ShoppingBag className="h-4 w-4 opacity-50" />
                <span className="font-semibold">Basket Verifier:</span>
              </div>
              <span className="font-medium text-[var(--text-secondary)] italic">
                Self-Service (Solo Customer)
              </span>
            </div>
          )}

          {/* Customer Details Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <User className="h-3.5 w-3.5" />
                <span>Customer Information</span>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {isWalkIn ? "Walk-In Customer" : "Registered Customer"}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)]">Name:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {isWalkIn ? "Walk-In Customer" : bill.customer_name}
              </span>
            </div>

            {bill.customer_phone && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--text-secondary)] flex items-center gap-1">
                  <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                  <span>Phone:</span>
                </span>
                <span className="font-mono font-medium text-[var(--text-primary)]">
                  +91 {bill.customer_phone}
                </span>
              </div>
            )}

            {bill.customer_gstin && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--text-secondary)]">GSTIN:</span>
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {bill.customer_gstin}
                </span>
              </div>
            )}

            {bill.customer_legal_name && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-[var(--text-secondary)]">Legal Name:</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {bill.customer_legal_name}
                </span>
              </div>
            )}
          </div>

          {/* Financial Breakdown Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <Receipt className="h-3.5 w-3.5" />
                <span>Financial Breakdown</span>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {bill.items?.length || 0} item{bill.items?.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Subtotal:</span>
              <span className="font-semibold text-[var(--text-primary)] font-mono">
                {formatRupees(bill.subtotal_amount)}
              </span>
            </div>

            {/* Discount (if any) */}
            <div className="flex justify-between items-start text-sm">
              <div>
                <span className="text-[var(--text-secondary)] flex items-center gap-1">
                  <Percent className="h-3 w-3 text-emerald-500" />
                  <span>Discount:</span>
                </span>
                {bill.discount_type && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {bill.discount_type === "PERCENT"
                      ? `${bill.discount_value}% OFF`
                      : bill.discount_type === "FLAT"
                        ? `Flat ₹${bill.discount_value} OFF`
                        : bill.discount_type === "COMPLIMENTARY_ITEMS"
                          ? `Complimentary Items (₹${bill.discount_value})`
                          : "100% Complimentary"}
                    {bill.discount_reason ? ` • ${bill.discount_reason}` : ""}
                  </p>
                )}
                {loyaltyDiscount > 0 && (
                  <p className="text-[11px] text-amber-500 mt-0.5">
                    Loyalty Points Redeemed: -{formatRupees(loyaltyDiscount)}
                  </p>
                )}
              </div>
              <span
                className={`font-mono font-semibold ${
                  totalDiscountINR > 0 ? "text-emerald-500" : "text-[var(--text-muted)]"
                }`}
              >
                {totalDiscountINR > 0 ? `-${formatRupees(totalDiscountINR)}` : "₹0.00"}
              </span>
            </div>

            {/* Additional Charges (if any) */}
            <div className="flex justify-between items-start text-sm">
              <div>
                <span className="text-[var(--text-secondary)] flex items-center gap-1">
                  <Truck className="h-3 w-3 text-sky-500" />
                  <span>Additional Charges:</span>
                </span>
                {(deliveryCharge > 0 || handlingCharge > 0) && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {deliveryCharge > 0 && `Delivery: ${formatRupees(deliveryCharge)}`}
                    {deliveryCharge > 0 && handlingCharge > 0 && " • "}
                    {handlingCharge > 0 && `Handling: ${formatRupees(handlingCharge)}`}
                  </p>
                )}
              </div>
              <span
                className={`font-mono font-semibold ${
                  additionalCharges > 0 ? "text-sky-500" : "text-[var(--text-muted)]"
                }`}
              >
                {additionalCharges > 0 ? `+${formatRupees(additionalCharges)}` : "₹0.00"}
              </span>
            </div>

            {/* Tax / GST (if any) */}
            {taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Tax / GST:</span>
                <span className="font-semibold text-[var(--text-primary)] font-mono">
                  {formatRupees(taxAmount)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[var(--border-subtle)] pt-2.5 flex justify-between items-baseline">
              <div>
                <span className="text-sm font-bold text-[var(--text-primary)]">Grand Total:</span>
                {bill.payment_method && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                    <CreditCard className="h-3 w-3" />
                    <span>Payment: {bill.payment_method}</span>
                    {bill.payment_method === "SPLIT" && (
                      <span>
                        (Cash: {formatRupees(bill.cash_amount)}, UPI: {formatRupees(bill.upi_amount)})
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-xl font-black text-[var(--accent-brand)] font-mono">
                {formatRupees(bill.total_amount)}
              </span>
            </div>

            {/* Credit / Debit settlements if any */}
            {(Number(bill.credit_applied || 0) > 0 ||
              Number(bill.debit_applied || 0) > 0 ||
              Number(bill.debt_settled || 0) > 0) && (
              <div className="mt-2 pt-2 border-t border-dashed border-[var(--border-subtle)] text-xs space-y-1">
                {Number(bill.credit_applied || 0) > 0 && (
                  <div className="flex justify-between text-emerald-500 font-medium">
                    <span>Credit Balance Used:</span>
                    <span className="font-mono">-{formatRupees(bill.credit_applied || 0)}</span>
                  </div>
                )}
                {Number(bill.debt_settled || 0) > 0 && (
                  <div className="flex justify-between text-indigo-500 font-medium">
                    <span>Past Debit Settled:</span>
                    <span className="font-mono">+{formatRupees(bill.debt_settled || 0)}</span>
                  </div>
                )}
                {Number(bill.debit_applied || 0) > 0 && (
                  <div className="flex justify-between text-amber-500 font-medium">
                    <span>Added to Customer Debit:</span>
                    <span className="font-mono">+{formatRupees(bill.debit_applied || 0)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Purchased Items List (Compact) */}
          {bill.items && bill.items.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 mb-2">
                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Items Summary</span>
                </span>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {bill.items.length} item{bill.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--border-subtle)]/50">
                {bill.items.map((item, idx) => (
                  <div key={item.id || idx} className="pt-1.5 first:pt-0 flex justify-between items-center text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {item.item_name}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] font-mono">
                        {item.quantity} {item.selected_unit || "units"} × {formatRupees(item.unit_price)}
                        {item.is_complimentary && (
                          <span className="ml-1 text-emerald-500 font-bold">(Free)</span>
                        )}
                      </p>
                    </div>
                    <div className="font-mono font-semibold text-[var(--text-primary)] shrink-0">
                      {formatRupees(item.line_total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[var(--bg-surface-elevated)] px-6 py-4 flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
