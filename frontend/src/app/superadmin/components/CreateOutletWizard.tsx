import { FormEvent } from "react";
import { ArrowRight, Building2, CheckCircle2, Plus, UserPlus } from "lucide-react";
import type { PaymentMode, StaffRole } from "@/types";
import type {
  AdminUserForm,
  RestaurantCreateForm,
  RestaurantWithUsers,
} from "../superadminTypes";

type CreateOutletWizardProps = {
  step: "create_restaurant" | "create_admin" | "done";
  setStep: (step: "create_restaurant" | "create_admin" | "done") => void;
  restaurantForm: RestaurantCreateForm;
  setRestaurantForm: React.Dispatch<React.SetStateAction<RestaurantCreateForm>>;
  isCreatingRestaurant: boolean;
  onCreateRestaurant: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  restaurants: RestaurantWithUsers[];
  selectedRestaurantId: string;
  setSelectedRestaurantId: (id: string) => void;
  adminUserForm: AdminUserForm;
  setAdminUserForm: React.Dispatch<React.SetStateAction<AdminUserForm>>;
  isCreatingUser: boolean;
  onCreateAdminUser: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  autoSlug: (name: string) => string;
};

export function CreateOutletWizard({
  step,
  setStep,
  restaurantForm,
  setRestaurantForm,
  isCreatingRestaurant,
  onCreateRestaurant,
  restaurants,
  selectedRestaurantId,
  setSelectedRestaurantId,
  adminUserForm,
  setAdminUserForm,
  isCreatingUser,
  onCreateAdminUser,
  autoSlug,
}: CreateOutletWizardProps) {
  return (
    <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-bold sm:text-xl">Onboard New Outlet</h2>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:text-xs ${
              step === "create_restaurant"
                ? "bg-[var(--accent-brand)] text-white"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {step !== "create_restaurant" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
            1. Outlet
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:text-xs ${
              step === "create_admin"
                ? "bg-[var(--accent-brand)] text-white"
                : step === "done"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
            }`}
          >
            {step === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            2. User Account
          </span>
        </div>
      </div>

      {/* Step 1: Create Restaurant */}
      {step === "create_restaurant" && (
        <form onSubmit={onCreateRestaurant} className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Name</span>
            <input
              type="text"
              value={restaurantForm.name}
              onChange={(e) => {
                const name = e.target.value;
                setRestaurantForm((prev) => ({
                  ...prev,
                  name,
                  slug: autoSlug(name),
                }));
              }}
              required
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              placeholder="ApnaGreen Basket"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">URL Slug</span>
            <input
              type="text"
              value={restaurantForm.slug}
              onChange={(e) =>
                setRestaurantForm((prev) => ({ ...prev, slug: e.target.value }))
              }
              required
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
              placeholder="apnagreenbasket-jammu"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Payment Mode</span>
            <select
              value={restaurantForm.payment_mode}
              onChange={(e) =>
                setRestaurantForm((prev) => ({
                  ...prev,
                  payment_mode: e.target.value as PaymentMode,
                }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
            >
              <option value="PAY_AT_COUNTER">Pay At Counter (Verify/Collect at counter)</option>
              <option value="RAZORPAY_GATEWAY">Razorpay Gateway (Instant automated)</option>
              <option value="BOTH">Both (Pay At Counter &amp; Razorpay Gateway)</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Direct UPI ID</span>
            <input
              type="text"
              value={restaurantForm.direct_upi_id}
              onChange={(e) =>
                setRestaurantForm((prev) => ({ ...prev, direct_upi_id: e.target.value }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
              placeholder="merchant@upi"
            />
          </label>

          {(restaurantForm.payment_mode === "RAZORPAY_GATEWAY" || restaurantForm.payment_mode === "BOTH") && (
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Razorpay Account ID</span>
              <input
                type="text"
                value={restaurantForm.razorpay_account_id}
                onChange={(e) =>
                  setRestaurantForm((prev) => ({ ...prev, razorpay_account_id: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                placeholder="acc_XXXXXXXXX"
              />
            </label>
          )}

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isCreatingRestaurant}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70"
            >
              <Plus className="h-4 w-4" />
              {isCreatingRestaurant ? "Creating..." : "Create Outlet"}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Create User */}
      {step === "create_admin" && (
        <form onSubmit={onCreateAdminUser} className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Target Outlet</span>
            <select
              value={selectedRestaurantId}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
              required
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
            >
              <option value="">Select Outlet</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">User Role</span>
            <select
              value={adminUserForm.role}
              onChange={(e) =>
                setAdminUserForm((prev) => ({
                  ...prev,
                  role: e.target.value as StaffRole,
                }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
            >
              <option value="OUTLET_ADMIN">Outlet Admin / Owner</option>
              <option value="MANAGER">Store Manager</option>
              <option value="CASHIER">Cashier</option>
              <option value="FLOOR_STAFF">Store Assistant / Basket Verifier</option>
              <option value="DELIVERY_BOY">Delivery Executive / Delivery Boy</option>
              <option value="STAFF">General Staff</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Full Name</span>
            <input
              type="text"
              value={adminUserForm.name}
              onChange={(e) =>
                setAdminUserForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              placeholder="e.g. Ramesh Kumar"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Email Address</span>
            <input
              type="email"
              value={adminUserForm.email}
              onChange={(e) =>
                setAdminUserForm((prev) => ({ ...prev, email: e.target.value }))
              }
              required
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              placeholder="user@outlet.com"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Phone Number (min 10 digits)</span>
            <input
              type="tel"
              required
              minLength={10}
              maxLength={15}
              value={adminUserForm.phone}
              onChange={(e) =>
                setAdminUserForm((prev) => ({ ...prev, phone: e.target.value.replace(/[^0-9+]/g, "") }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-mono"
              placeholder="+919876543210 (10-15 digits)"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">4-Digit POS PIN (Optional)</span>
            <input
              type="password"
              maxLength={4}
              pattern="\d{4}"
              value={adminUserForm.pin}
              onChange={(e) =>
                setAdminUserForm((prev) => ({ ...prev, pin: e.target.value }))
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-mono tracking-widest"
              placeholder="e.g. 1234"
            />
          </label>

          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Password</span>
            <input
              type="password"
              value={adminUserForm.password}
              onChange={(e) =>
                setAdminUserForm((prev) => ({ ...prev, password: e.target.value }))
              }
              required
              minLength={8}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              placeholder="Minimum 8 characters"
            />
          </label>

          <div className="flex items-end justify-between gap-2 sm:col-span-1">
            <button
              type="button"
              onClick={() => setStep("create_restaurant")}
              className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingUser || !selectedRestaurantId}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70"
            >
              <UserPlus className="h-4 w-4" />
              {isCreatingUser ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Done */}
      {step === "done" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">User Account Provisioned!</p>
              <p className="text-xs text-emerald-700">The account can now sign in at /admin.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep("create_restaurant")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Onboard Another Outlet
          </button>
        </div>
      )}
    </section>
  );
}
