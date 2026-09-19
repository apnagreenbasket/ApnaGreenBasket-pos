/**
 * StaffModal — Add / Edit staff member modal.
 *
 * Extracted from admin page.tsx (lines 6098-6220).
 */

"use client";

import { FormEvent } from "react";
import { UserPlus, X } from "lucide-react";
import type { StaffRole } from "@/types";

export type StaffModalFormState = {
  outlet_id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  password: string;
  pin: string;
};

type StaffModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingStaffId: string | null;
  staffFormState: StaffModalFormState;
  setStaffFormState: React.Dispatch<React.SetStateAction<StaffModalFormState>>;
  isSavingStaff: boolean;
  onSubmitStaffMember: (e: FormEvent<HTMLFormElement>) => void;
  currentUserRole?: string | null;
};

export function StaffModal({
  isOpen,
  onClose,
  editingStaffId,
  staffFormState,
  setStaffFormState,
  isSavingStaff,
  onSubmitStaffMember,
  currentUserRole,
}: StaffModalProps) {
  if (!isOpen) return null;

  const isManager = currentUserRole === "MANAGER";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[var(--accent-brand)]" />
            <h3 className="font-display text-lg font-bold">
              {editingStaffId ? "Edit Staff Details" : "Add New Staff Member"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmitStaffMember} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Full Name</span>
            <input
              type="text"
              value={staffFormState.name}
              onChange={(e) => setStaffFormState((prev) => ({ ...prev, name: e.target.value }))}
              required
              placeholder="e.g. Vikram Singh"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Email Address</span>
            <input
              type="email"
              value={staffFormState.email}
              onChange={(e) => setStaffFormState((prev) => ({ ...prev, email: e.target.value }))}
              required
              placeholder="staff@outlet.com"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">
                {editingStaffId ? "Phone (Optional)" : "Phone Number (min 10 digits)"}
              </span>
              <input
                type="tel"
                required={!editingStaffId}
                minLength={10}
                maxLength={15}
                value={staffFormState.phone}
                onChange={(e) => setStaffFormState((prev) => ({ ...prev, phone: e.target.value.replace(/[^0-9+]/g, "") }))}
                placeholder="+919876543210 (10-15 digits)"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Role</span>
              <select
                value={staffFormState.role}
                onChange={(e) => setStaffFormState((prev) => ({ ...prev, role: e.target.value as StaffRole }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold"
              >
                {!isManager && (
                  <>
                    <option value="OUTLET_ADMIN">Outlet Admin / Owner</option>
                    <option value="MANAGER">Store Manager</option>
                  </>
                )}
                <option value="CASHIER">Cashier</option>
                <option value="FLOOR_STAFF">Store Assistant / Basket Verifier</option>
                <option value="DELIVERY_BOY">Delivery Executive / Delivery Boy</option>
                <option value="STAFF">General Staff</option>
              </select>
            </label>
          </div>

          {!editingStaffId && (
            <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-[var(--border-subtle)]">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Password</span>
                <input
                  type="password"
                  value={staffFormState.password}
                  onChange={(e) => setStaffFormState((prev) => ({ ...prev, password: e.target.value }))}
                  required={!editingStaffId}
                  minLength={8}
                  placeholder="Min 8 characters"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Initial 4-Digit PIN (Optional)</span>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  value={staffFormState.pin}
                  onChange={(e) => setStaffFormState((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  placeholder="e.g. 1234"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-mono tracking-widest text-center"
                />
              </label>
            </div>
          )}

          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingStaff}
              className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-xs font-bold text-[var(--text-on-accent)] shadow-xs hover:bg-[var(--accent-brand-hover)] transition"
            >
              {isSavingStaff ? "Saving Staff..." : editingStaffId ? "Update Staff" : "Provision Staff Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
