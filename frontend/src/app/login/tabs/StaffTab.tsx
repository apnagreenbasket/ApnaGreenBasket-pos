/**
 * StaffTab — Staff & team management tab for the admin dashboard.
 *
 * Displays staff roster table, stat cards, action audit trail,
 * and triggers for create/edit/PIN modals.
 * Extracted from admin page.tsx (lines 3414-3674).
 */

"use client";

import { FormEvent, useState } from "react";
import { ConfirmModal } from "../modals/ConfirmModal";
import {
  Activity,
  CheckCircle2,
  KeyRound,
  Pencil,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { formatRupees, parseUTCDate } from "../adminUtils";
import type { StaffAuditEntry, StaffMember, StaffRole } from "@/types";
import type { RestaurantProfile } from "../adminTypes";

type StaffFormState = {
  outlet_id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  password: string;
  pin: string;
};

type StaffTabProps = {
  restaurant: RestaurantProfile | null;
  staffList: StaffMember[];
  staffAuditLogs: StaffAuditEntry[];
  isLoadingStaff: boolean;

  // Audit Filters
  auditRoleFilter: string;
  setAuditRoleFilter: (val: string) => void;
  auditActionFilter: string;
  setAuditActionFilter: (val: string) => void;
  auditDateFilter: string;
  setAuditDateFilter: (val: string) => void;
  auditPage: number;
  setAuditPage: (val: number | ((prev: number) => number)) => void;
  auditTotalPages: number;

  // User & Privilege Context
  currentUserRole?: string | null;
  currentUserId?: string | null;

  // Actions
  loadStaffMembers: () => Promise<void>;
  loadStaffAuditLogs: () => Promise<void>;
  onDeactivateStaffMember: (id: string, name: string) => Promise<void>;
  onActivateStaffMember: (id: string, name: string) => Promise<void>;
  onDeleteStaffMemberPermanently: (id: string, name: string) => Promise<void>;

  // Modal triggers
  onOpenCreateStaff: () => void;
  onOpenEditStaff: (member: StaffMember) => void;
  onOpenPinSetup: (member: StaffMember) => void;
  onOpenPinSwitch: () => void;
};

export function StaffTab({
  restaurant,
  staffList,
  staffAuditLogs,
  isLoadingStaff,
  auditRoleFilter,
  setAuditRoleFilter,
  auditActionFilter,
  setAuditActionFilter,
  auditDateFilter,
  setAuditDateFilter,
  auditPage,
  setAuditPage,
  auditTotalPages,
  currentUserRole,
  currentUserId,
  loadStaffMembers,
  loadStaffAuditLogs,
  onDeactivateStaffMember,
  onActivateStaffMember,
  onDeleteStaffMemberPermanently,
  onOpenCreateStaff,
  onOpenEditStaff,
  onOpenPinSetup,
  onOpenPinSwitch,
}: StaffTabProps) {
  const [staffToDeactivate, setStaffToDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [staffToActivate, setStaffToActivate] = useState<{ id: string; name: string } | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const isManager = currentUserRole === "MANAGER";

  const activeStaffCount = staffList.filter((s) => s.status === "active").length;
  const inactiveStaffCount = staffList.filter((s) => s.status !== "active").length;

  const filteredStaffList = staffList.filter((member) => {
    if (statusFilter === "active") return member.status === "active";
    if (statusFilter === "inactive") return member.status !== "active";
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Staff &amp; Team Management</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Outlet roles, permissions, staff accounts, PIN setup, and action audit trail
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenPinSwitch}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-3.5 py-2 text-xs font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition"
          >
            <KeyRound className="h-4 w-4" />
            <span>PIN Quick-Switch</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateStaff}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Staff Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Staff</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{staffList.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Staff</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {activeStaffCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">PIN Provisioned</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {staffList.filter((s) => s.has_pin).length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Audit Log Entries</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{staffAuditLogs.length}</p>
        </div>
      </div>

      {/* Staff Master Table */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[var(--accent-brand)]" />
              <h2 className="font-display text-lg font-bold">Outlet Team Roster</h2>
            </div>
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-[var(--bg-surface-elevated)] p-1 border border-[var(--border-subtle)] text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  statusFilter === "active"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Active ({activeStaffCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("inactive")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  statusFilter === "inactive"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Deactivated ({inactiveStaffCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  statusFilter === "all"
                    ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                All ({staffList.length})
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadStaffMembers()}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] self-end sm:self-auto"
            title="Refresh Roster"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingStaff ? "animate-spin text-[var(--accent-brand)]" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5">Staff Member</th>
                <th className="p-3.5">Contact</th>
                <th className="p-3.5">Assigned Role</th>
                <th className="p-3.5 text-center">PIN Status</th>
                <th className="p-3.5 text-center">Account Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {filteredStaffList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                    {statusFilter === "inactive"
                      ? "No deactivated staff members."
                      : statusFilter === "active"
                        ? "No active staff members found."
                        : "No staff members found for this outlet. Click + Add Staff Member to provision accounts."}
                  </td>
                </tr>
              ) : (
                filteredStaffList.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold text-sm">
                          {member.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{member.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">ID: {member.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 space-y-0.5">
                      <p className="font-mono text-[11px] text-[var(--text-primary)]">{member.email}</p>
                      {member.phone && <p className="font-mono text-[10px] text-[var(--text-muted)]">{member.phone}</p>}
                    </td>

                    <td className="p-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.role === "OUTLET_ADMIN" || member.role === "SUPERADMIN"
                        ? "bg-purple-100 text-purple-800"
                        : member.role === "MANAGER"
                          ? "bg-indigo-100 text-indigo-800"
                          : member.role === "FLOOR_STAFF"
                            ? "bg-amber-100 text-amber-800"
                            : member.role === "CASHIER"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-sky-800"
                        }`}>
                        {member.role.replace("_", " ")}
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      {member.has_pin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          PIN Set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
                          No PIN
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}>
                        {member.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right space-x-1">
                      {(() => {
                        const isTargetPeerOrHigher =
                          isManager &&
                          (member.role === "MANAGER" ||
                            member.role === "OUTLET_ADMIN" ||
                            member.role === "SUPERADMIN");
                        const isSelf = Boolean(currentUserId && member.id === currentUserId);
                        const canManageTarget = !isTargetPeerOrHigher && !isSelf;
                        const canDeleteTarget =
                          (currentUserRole === "OUTLET_ADMIN" || currentUserRole === "SUPERADMIN") &&
                          member.status === "inactive" &&
                          !isSelf;

                        return (
                          <>
                            {/* Set PIN */}
                            <button
                              type="button"
                              onClick={() => onOpenPinSetup(member)}
                              disabled={!canManageTarget && !isSelf}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)] disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                !canManageTarget && !isSelf
                                  ? "Managers cannot set PIN for peer or admin accounts"
                                  : "Set 4-Digit PIN"
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>

                            {/* Edit Details */}
                            <button
                              type="button"
                              onClick={() => onOpenEditStaff(member)}
                              disabled={!canManageTarget}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)] disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                !canManageTarget
                                  ? isSelf
                                    ? "Use profile settings to edit own account"
                                    : "Managers cannot edit peer or admin accounts"
                                  : "Edit Details"
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            {/* Status Toggle: Deactivate vs Activate */}
                            {member.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => setStaffToDeactivate({ id: member.id, name: member.name })}
                                disabled={!canManageTarget}
                                className="p-1.5 rounded-lg hover:bg-rose-500/15 text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={
                                  !canManageTarget
                                    ? isSelf
                                      ? "Cannot deactivate your own account"
                                      : "Managers cannot deactivate peer or admin accounts"
                                    : "Deactivate Account"
                                }
                              >
                                <UserX className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStaffToActivate({ id: member.id, name: member.name })}
                                disabled={!canManageTarget}
                                className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={
                                  !canManageTarget
                                    ? isSelf
                                      ? "Cannot change own status"
                                      : "Managers cannot activate peer or admin accounts"
                                    : "Activate Account"
                                }
                              >
                                <UserCheck className="h-4 w-4" />
                              </button>
                            )}

                            {/* Permanent Delete (Allowed only for deactivated members by Outlet Admin or Superadmin) */}
                            {canDeleteTarget && (
                              <button
                                type="button"
                                onClick={() => setStaffToDelete({ id: member.id, name: member.name })}
                                className="p-1.5 rounded-lg hover:bg-rose-600/20 text-rose-600"
                                title="Permanently Delete Account"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Staff Audit Trail */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold">Staff Action Audit Trail</h2>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={auditRoleFilter}
              onChange={(e) => setAuditRoleFilter(e.target.value)}
              className="text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Roles</option>
              <option value="SUPERADMIN">Superadmin</option>
              <option value="OUTLET_ADMIN">Outlet Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="CASHIER">Cashier</option>
              <option value="DELIVERY_BOY">Delivery Boy</option>
              <option value="STAFF">General Staff</option>
            </select>
            <select
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
              className="text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Actions</option>
              <option value="punch_in">Shift Punch-In</option>
              <option value="punch_out">Shift Punch-Out</option>
              <option value="staff_pin_logged_in">PIN Login</option>
              <option value="pin_quick_switch">PIN Quick-Switch</option>
              <option value="bill_deleted">Bill Deleted</option>
              <option value="staff_created">Staff Created</option>
              <option value="staff_updated">Staff Updated</option>
              <option value="staff_deactivated">Staff Deactivated</option>
              <option value="staff_pin_updated">PIN Updated</option>
            </select>
            <select
              value={auditDateFilter}
              onChange={(e) => setAuditDateFilter(e.target.value)}
              className="text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 font-medium text-[var(--text-primary)]"
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
            <button
              type="button"
              onClick={() => void loadStaffAuditLogs()}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
              title="Refresh Audit Logs"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Staff Member</th>
                <th className="p-3.5">Action Type</th>
                <th className="p-3.5">Reference</th>
                <th className="p-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {staffAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                    No staff action audit records logged yet.
                  </td>
                </tr>
              ) : (
                staffAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                    <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px]">
                      {parseUTCDate(log.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-3.5 font-bold text-[var(--text-primary)]">{log.staff_name || "System / Admin"}</td>
                    <td className="p-3.5">
                      {log.action_type === "punch_in" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          PUNCH IN
                        </span>
                      ) : log.action_type === "punch_out" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          PUNCH OUT
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-[var(--accent-brand)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-brand)] uppercase">
                          {log.action_type.replace(/_/g, " ")}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-[var(--text-muted)]">
                      {log.reference_type ? `${log.reference_type} #${log.reference_id?.slice(0, 8)}` : "—"}
                    </td>
                    <td className="p-3.5 text-[var(--text-secondary)] font-medium">
                      {log.action_type === "punch_out" ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {log.details || "—"}
                        </span>
                      ) : log.action_type === "punch_in" ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {log.details || "—"}
                        </span>
                      ) : (
                        log.details || "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            Page {auditPage} of {auditTotalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={auditPage >= auditTotalPages}
              onClick={() => setAuditPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </article>

      {/* Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={!!staffToDeactivate}
        title="Deactivate Staff Member"
        message={`Are you sure you want to deactivate staff member "${staffToDeactivate?.name}"? They will no longer be able to log in or switch via PIN, and any active punch session will be closed.`}
        confirmText="Deactivate"
        onConfirm={() => {
          if (staffToDeactivate) {
            void onDeactivateStaffMember(staffToDeactivate.id, staffToDeactivate.name);
          }
        }}
        onClose={() => setStaffToDeactivate(null)}
      />

      {/* Activate Confirmation Modal */}
      <ConfirmModal
        isOpen={!!staffToActivate}
        title="Activate Staff Member"
        message={`Are you sure you want to reactivate staff member "${staffToActivate?.name}"? Their account access will be restored.`}
        confirmText="Activate"
        onConfirm={() => {
          if (staffToActivate) {
            void onActivateStaffMember(staffToActivate.id, staffToActivate.name);
          }
        }}
        onClose={() => setStaffToActivate(null)}
      />

      {/* Permanent Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!staffToDelete}
        title="Permanently Delete Staff Member"
        message={`Are you sure you want to permanently delete "${staffToDelete?.name}"? This action cannot be undone and will permanently remove their credentials and account.`}
        confirmText="Permanently Delete"
        onConfirm={() => {
          if (staffToDelete) {
            void onDeleteStaffMemberPermanently(staffToDelete.id, staffToDelete.name);
          }
        }}
        onClose={() => setStaffToDelete(null)}
      />
    </div>
  );
}
