import { FormEvent } from "react";
import { Settings2 } from "lucide-react";
import type { PaymentMode } from "@/types";
import type {
  RestaurantCreateForm,
  RestaurantWithUsers,
} from "../superadminTypes";

type EditOutletModalProps = {
  settingsOutlet: RestaurantWithUsers | null;
  onClose: () => void;
  settingsForm: RestaurantCreateForm;
  setSettingsForm: React.Dispatch<React.SetStateAction<RestaurantCreateForm>>;
  isSavingSettings: boolean;
  onSaveOutletSettings: (e: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function EditOutletModal({
  settingsOutlet,
  onClose,
  settingsForm,
  setSettingsForm,
  isSavingSettings,
  onSaveOutletSettings,
}: EditOutletModalProps) {
  if (!settingsOutlet) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Configure Outlet Settings</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Managing settings &amp; bill receipt attributes for {settingsOutlet.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSaveOutletSettings} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Name</span>
              <input
                type="text"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, name: e.target.value }))}
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">URL Slug</span>
              <input
                type="text"
                value={settingsForm.slug}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, slug: e.target.value }))}
                required
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Payment Mode</span>
              <select
                value={settingsForm.payment_mode}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, payment_mode: e.target.value as PaymentMode }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              >
                <option value="PAY_AT_COUNTER">Pay At Counter (Verify/Collect at counter)</option>
                <option value="RAZORPAY_GATEWAY">Razorpay Gateway (Instant automated)</option>
                <option value="BOTH">Both (Pay At Counter &amp; Razorpay Gateway)</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Contact Phone</span>
              <input
                type="text"
                value={settingsForm.phone}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                placeholder="+91 9876543210"
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Address (Bill Header)</span>
              <input
                type="text"
                value={settingsForm.address}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                placeholder="Full outlet address"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">GSTIN</span>
              <input
                type="text"
                value={settingsForm.gstin}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, gstin: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                placeholder="01AAFCB7044K1ZV"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">FSSAI License No.</span>
              <input
                type="text"
                value={settingsForm.fssai_no}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, fssai_no: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                placeholder="10718026..."
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Email</span>
              <input
                type="email"
                value={settingsForm.email}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm font-mono"
                placeholder="store@apnagreenbasket.com"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Place of Supply (State)</span>
              <input
                type="text"
                value={settingsForm.place_of_supply}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, place_of_supply: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                placeholder="Jammu and Kashmir"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Bill QR URL</span>
              <input
                type="url"
                value={settingsForm.bill_qr_url}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, bill_qr_url: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                placeholder="https://apnagreenbasket.com"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Logo URL</span>
              <input
                type="text"
                value={settingsForm.logo_url}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, logo_url: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                placeholder="https://... logo image URL"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Direct UPI ID</span>
              <input
                type="text"
                value={settingsForm.direct_upi_id}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, direct_upi_id: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                placeholder="merchant@upi"
              />
            </label>

            {(settingsForm.payment_mode === "RAZORPAY_GATEWAY" || settingsForm.payment_mode === "BOTH") && (
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Razorpay Account ID</span>
                <input
                  type="text"
                  value={settingsForm.razorpay_account_id}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, razorpay_account_id: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                  placeholder="acc_XXXXXXXXX"
                />
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Session Duration (minutes)</span>
              <input
                type="number"
                min={5}
                max={120}
                value={settingsForm.session_duration_minutes}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, session_duration_minutes: Number(e.target.value) || 30 }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Verification Cutoff Amount (₹)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={settingsForm.verification_amount_cutoff}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, verification_amount_cutoff: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                placeholder="Optional threshold for auto-verification"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingSettings}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-5 py-2 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70"
            >
              {isSavingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
