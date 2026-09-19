import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Settings2,
  Store,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import type { StaffMember } from "@/types";
import type { RestaurantWithUsers } from "../superadminTypes";

type OutletCardProps = {
  outlet: RestaurantWithUsers;
  isExpanded: boolean;
  copiedId: string | null;
  staffList: StaffMember[];
  onToggleExpand: () => void;
  onCopyId: (id: string) => void;
  onOpenSettings: (outlet: RestaurantWithUsers) => void;
  onImpersonateOutlet: (id: string) => void;
  onAddUser: (restaurantId: string) => void;
  onDeleteRestaurant: (restaurantId: string, name: string) => void;
  onDeleteUser: (userId: string, email: string) => void;
  onActivateUser: (userId: string, email: string) => void;
  onDeactivateUser: (userId: string, email: string) => void;
  formatDateTime: (val: string) => string;
};

export function OutletCard({
  outlet: r,
  isExpanded,
  copiedId,
  staffList,
  onToggleExpand,
  onCopyId,
  onOpenSettings,
  onImpersonateOutlet,
  onAddUser,
  onDeleteRestaurant,
  onDeleteUser,
  onActivateUser,
  onDeactivateUser,
  formatDateTime,
}: OutletCardProps) {
  const admins = r.users.filter((u) => u.role === "OUTLET_ADMIN" || u.role === "SUPERADMIN");
  const staffUsers = r.users.filter((u) => u.role !== "OUTLET_ADMIN" && u.role !== "SUPERADMIN");

  return (
    <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 shadow-xs transition-all hover:border-[var(--accent-brand)]">
      {/* Outlet Header */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)] sm:text-xl">
              {r.name}
            </h3>
            <button
              onClick={() => onCopyId(r.id)}
              className="group flex items-center gap-1.5 rounded-full bg-[var(--bg-surface-elevated)] px-2.5 py-1 text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              title="Click to copy Outlet ID"
            >
              <span>/{r.slug}</span>
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Onboarded on {formatDateTime(r.created_at)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 mr-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-bold">
            <Store className="h-3 w-3" />
            {r.payment_mode === "PAY_AT_COUNTER" ? "Counter" : "Online"}
          </div>

          <button
            type="button"
            onClick={() => onCopyId(r.id)}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition font-mono"
            title="Copy ID"
          >
            {copiedId === r.id ? (
              <span className="text-emerald-500 font-bold">Copied!</span>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {r.id.substring(0, 8)}...
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onImpersonateOutlet(r.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition sm:text-xs sm:px-3"
            title="Open Outlet Dashboard"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard ↗</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSettings(r)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition sm:text-xs sm:px-3"
            title="Configure Outlet Settings"
          >
            <Settings2 className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            type="button"
            onClick={() => onAddUser(r.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition sm:text-xs sm:px-3"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add User</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteRestaurant(r.id, r.name)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition sm:text-xs sm:px-2.5"
            title="Delete Outlet"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            <span className="hidden sm:inline">Delete</span>
          </button>

          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Toggle team view"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Users className="h-4 w-4 text-[var(--accent-brand)]" />
            {r.users.length} {r.users.length === 1 ? "Team Member" : "Team Members"}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          className="font-bold text-[var(--accent-brand)] hover:underline"
        >
          {isExpanded ? "Hide Team Directory" : "View Team Directory"}
        </button>
      </div>

      {/* Expandable Team Directory */}
      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4 animate-in fade-in duration-200">
          {/* Admins Group */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-amber-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Outlet Admins ({admins.length})
              </h4>
            </div>

            {admins.length === 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-500">
                ⚠️ No admin user assigned to this outlet yet. Click &quot;Add User&quot; above to create one.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {admins.map((u) => {
                  const isDeactivated = u.is_active === false || u.status === "inactive";
                  return (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between rounded-xl border p-3 transition ${
                        isDeactivated
                          ? "border-zinc-700/40 bg-zinc-800/30 opacity-80"
                          : "border-amber-500/30 bg-amber-500/5"
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                          <UserCheck className={`h-3.5 w-3.5 ${isDeactivated ? "text-zinc-500" : "text-amber-600"} shrink-0`} />
                          <span className={isDeactivated ? "line-through text-[var(--text-muted)]" : ""}>
                            {u.name || u.email.split("@")[0]}
                          </span>
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                          {u.email} {u.phone ? `• ${u.phone}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.has_pin && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            PIN Set
                          </span>
                        )}
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          Admin
                        </span>
                        {isDeactivated && (
                          <span className="rounded-full bg-zinc-700/50 text-zinc-400 border border-zinc-600/40 px-2 py-0.5 text-[10px] font-bold uppercase">
                            Inactive
                          </span>
                        )}

                        {/* Activate / Deactivate button */}
                        {isDeactivated ? (
                          <button
                            type="button"
                            onClick={() => onActivateUser(u.id, u.email)}
                            className="p-1 rounded-lg text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600 transition"
                            title="Activate Admin Account"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeactivateUser(u.id, u.email)}
                            className="p-1 rounded-lg text-amber-500 hover:bg-amber-500/10 hover:text-amber-600 transition"
                            title="Deactivate Admin Account"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Permanent Delete Button (only enabled for deactivated accounts) */}
                        {isDeactivated ? (
                          <button
                            type="button"
                            onClick={() => onDeleteUser(u.id, u.email)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition"
                            title="Permanently Delete Admin Account"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="p-1 rounded-lg text-zinc-600 opacity-40 cursor-not-allowed"
                            title="Deactivate account first to enable permanent deletion"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Staff Group */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 mt-6">
              <Users className="h-4 w-4 text-sky-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Outlet Staff & Team Roster ({staffUsers.length})
              </h4>
            </div>

            {staffUsers.length === 0 ? (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-700 dark:text-sky-400">
                ℹ️ No floor staff, cashiers, or managers have been created for this outlet yet.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {staffUsers.map((u) => {
                  const s = staffList.find((st) => st.id === u.id);
                  const isManager = u.role === "MANAGER";
                  const isDeactivated = u.is_active === false || u.status === "inactive";
                  const borderColor = isDeactivated
                    ? "border-zinc-700/40"
                    : isManager
                      ? "border-purple-500/30"
                      : "border-sky-500/30";
                  const bgColor = isDeactivated
                    ? "bg-zinc-800/30 opacity-80"
                    : isManager
                      ? "bg-purple-500/5"
                      : "bg-sky-500/5";
                  const textColor = isDeactivated
                    ? "text-zinc-500"
                    : isManager
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-sky-600 dark:text-sky-400";
                  const badgeBg = isDeactivated
                    ? "bg-zinc-700/30"
                    : isManager
                      ? "bg-purple-500/10"
                      : "bg-sky-500/10";

                  return (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between rounded-xl border ${borderColor} ${bgColor} p-3 transition`}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                          <UserCheck className={`h-3.5 w-3.5 ${textColor} shrink-0`} />
                          <span className={isDeactivated ? "line-through text-[var(--text-muted)]" : ""}>
                            {s?.name || u.name || "Unnamed"}
                          </span>
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                          {u.email} {s?.phone || u.phone ? `• ${s?.phone || u.phone}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.has_pin && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            PIN Set
                          </span>
                        )}
                        <span className={`rounded-full ${badgeBg} px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${textColor}`}>
                          {u.role.replace("_", " ")}
                        </span>
                        {isDeactivated && (
                          <span className="rounded-full bg-zinc-700/50 text-zinc-400 border border-zinc-600/40 px-2 py-0.5 text-[10px] font-bold uppercase">
                            Inactive
                          </span>
                        )}

                        {/* Activate / Deactivate button */}
                        {isDeactivated ? (
                          <button
                            type="button"
                            onClick={() => onActivateUser(u.id, u.email)}
                            className="p-1 rounded-lg text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600 transition"
                            title="Activate Staff Account"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeactivateUser(u.id, u.email)}
                            className="p-1 rounded-lg text-amber-500 hover:bg-amber-500/10 hover:text-amber-600 transition"
                            title="Deactivate Staff Account"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Permanent Delete Button (only enabled for deactivated accounts) */}
                        {isDeactivated ? (
                          <button
                            type="button"
                            onClick={() => onDeleteUser(u.id, u.email)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition"
                            title="Permanently Delete Staff Account"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="p-1 rounded-lg text-zinc-600 opacity-40 cursor-not-allowed"
                            title="Deactivate account first to enable permanent deletion"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
