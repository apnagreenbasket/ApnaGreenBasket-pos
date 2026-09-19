/**
 * SettingsTab — Restaurant profile settings tab for the admin dashboard.
 *
 * Manages restaurant name, slug, payment mode, logo, address, tax info,
 * session settings, verification rules, and flagged products.
 * Extracted from admin page.tsx (lines 5261-5628).
 */

"use client";

import { FormEvent, useState } from "react";
import { Loader2, Save, Settings2, Upload, Plus, Trash2, BellRing } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import type { PaymentMode } from "@/types";
import type {
  AdminMenuItem,
  RestaurantFormState,
  RestaurantProfile,
} from "../adminTypes";
import { ACCESS_TOKEN_KEY } from "../adminTypes";
import { formatRupees } from "../adminUtils";

type SettingsTabProps = {
  restaurant: RestaurantProfile | null;
  menuItems: AdminMenuItem[];
  restaurantForm: RestaurantFormState;
  setRestaurantForm: React.Dispatch<React.SetStateAction<RestaurantFormState>>;
  isSavingRestaurant: boolean;
  onSubmitRestaurantSettings: (event: FormEvent<HTMLFormElement>) => void;
  accessToken: string | null;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

type SettingsSubTab = "general" | "billing" | "hardware" | "security" | "loyalty";

export function SettingsTab({
  restaurant,
  menuItems,
  restaurantForm,
  setRestaurantForm,
  isSavingRestaurant,
  onSubmitRestaurantSettings,
  accessToken,
  setNotice,
  setError,
}: SettingsTabProps) {
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsSubTab>("general");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Outlet Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Manage outlet profile, payment modes, Razorpay keys, and UPI details
        </p>
      </div>

      <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Outlet Profile &amp; Payment Gateway</h2>
            <p className="text-xs text-[var(--text-secondary)]">Configure outlet payment mode and info</p>
          </div>
        </div>

                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-4 mt-4">
          <button type="button" onClick={() => setActiveTab("general")} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === "general" ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]" : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated-hover)]"}`}>General Info</button>
          <button type="button" onClick={() => setActiveTab("billing")} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === "billing" ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]" : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated-hover)]"}`}>Billing & Taxes</button>
          <button type="button" onClick={() => setActiveTab("hardware")} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === "hardware" ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]" : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated-hover)]"}`}>Inventory & Hardware</button>
          <button type="button" onClick={() => setActiveTab("security")} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === "security" ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]" : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated-hover)]"}`}>Security & Rules</button>
          <button type="button" onClick={() => setActiveTab("loyalty")} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === "loyalty" ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]" : "bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated-hover)]"}`}>Loyalty Program</button>
        </div>

        <form onSubmit={onSubmitRestaurantSettings} className="space-y-4 mt-4">
          {/* --- GENERAL TAB --- */}
          {activeTab === "general" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Name</span>
                  <input
                    value={restaurantForm.name}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">URL Slug</span>
                  <input
                    value={restaurantForm.slug}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, slug: event.target.value }))}
                    required
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 font-mono text-sm"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Logo URL</span>
                <div className="flex gap-2">
                  <input
                    value={restaurantForm.logo_url}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, logo_url: event.target.value }))}
                    placeholder="https://... or upload image"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                  />
                  <label className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-xs transition shrink-0 ${isUploadingLogo ? "bg-amber-600 opacity-80 pointer-events-none" : "bg-[var(--accent-brand)] hover:opacity-90"}`}>
                    {isUploadingLogo ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload Logo</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingLogo}
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsUploadingLogo(true);
                        const formData = new FormData();
                        formData.append("file", file);
                        try {
                          const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) || accessToken;
                          const apiBase = getApiBaseUrl();
                          const res = await fetch(`${apiBase}/api/upload/image`, {
                            method: "POST",
                            headers: token ? { Authorization: `Bearer ${token}` } : {},
                            body: formData,
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setRestaurantForm((prev) => ({ ...prev, logo_url: data.url }));
                            setNotice("Store logo uploaded successfully! Click Save Settings.");
                          } else {
                            const errData = await res.json().catch(() => ({}));
                            setError(errData.detail || "Logo upload failed.");
                          }
                        } catch (err) {
                          console.error("Logo upload error:", err);
                          setError("Logo upload failed. Check connection.");
                        } finally {
                          setIsUploadingLogo(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Store Address</span>
                <input
                  value={restaurantForm.address}
                  onChange={(event) => setRestaurantForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Full store address for receipts"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Contact Phone</span>
                  <input
                    value={restaurantForm.phone}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="+91 9876543210"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Outlet Email</span>
                  <input
                    type="email"
                    value={restaurantForm.email}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="store@apnagreenbasket.com"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                  />
                </label>
              </div>

              {restaurant && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 mt-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Restaurant ID</p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-primary)] select-all break-all">{restaurant.id}</p>
                </div>
              )}
            </div>
          )}

          {/* --- BILLING & TAXES TAB --- */}
          {activeTab === "billing" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Payment Mode</span>
                <select
                  value={restaurantForm.payment_mode}
                  onChange={(event) => setRestaurantForm((current) => ({ ...current, payment_mode: event.target.value as PaymentMode }))}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                >
                  <option value="PAY_AT_COUNTER">Pay At Counter (Verify/Collect at counter)</option>
                  <option value="RAZORPAY_GATEWAY">Razorpay Gateway (Instant automated)</option>
                  <option value="BOTH">Both (Customer can choose at checkout)</option>
                </select>
              </label>

              {(restaurantForm.payment_mode === "RAZORPAY_GATEWAY" || restaurantForm.payment_mode === "BOTH") && (
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Razorpay Account ID</span>
                  <input
                    value={restaurantForm.razorpay_account_id}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, razorpay_account_id: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm"
                    placeholder="acc_XXXXXXXXX"
                  />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">GSTIN</span>
                  <input
                    value={restaurantForm.gstin}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, gstin: event.target.value }))}
                    placeholder="01AAFCB7044K1ZV"
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">FSSAI Registration</span>
                  <input
                    value={restaurantForm.fssai_no}
                    onChange={(event) => setRestaurantForm((current) => ({ ...current, fssai_no: event.target.value }))}
                    placeholder="10718026..."
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Place of Supply (State)</span>
                <input
                  type="text"
                  value={restaurantForm.place_of_supply}
                  onChange={(event) => setRestaurantForm((current) => ({ ...current, place_of_supply: event.target.value }))}
                  placeholder="Jammu and Kashmir"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">State name for GST compliance on bills</span>
              </label>

              <label className="block space-y-1 mt-3">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Inter-State GST (IGST) Mode</span>
                <select
                  value={restaurantForm.interstate_mode || "OFF"}
                  onChange={(event) => setRestaurantForm((current) => ({ ...current, interstate_mode: event.target.value as any }))}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="OFF">Disabled / Local Only (Default - Strict Intra-State CGST + SGST only)</option>
                  <option value="PER_BILL">Per-Bill Selection (Local walk-in default, allow IGST toggle per order)</option>
                  <option value="ALWAYS_ON">Always Inter-State (IGST 100% on every bill - e.g. Central Out-of-State Fulfillment Hub)</option>
                </select>
                <span className="text-[10px] text-[var(--text-muted)] block">
                  Controls how GST is collected on customer invoices and reported to your CA for GSTR-1 filings.
                </span>
              </label>

              <div className="mt-3 p-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-[var(--text-primary)] font-bold block">
                      B2B Tax Invoice Mode
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">
                      Enable B2B GSTIN collection and legal business invoicing during billing. When disabled (default), B2B tax invoice options are hidden.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                    <input
                      type="checkbox"
                      checked={Boolean(restaurantForm.b2b_enabled)}
                      onChange={(e) => setRestaurantForm((current) => ({ ...current, b2b_enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[var(--bg-surface-elevated)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 border border-[var(--border-strong)]"></div>
                  </label>
                </div>
              </div>

              <label className="block space-y-1 mt-3">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Bill QR URL</span>
                <input
                  type="url"
                  value={restaurantForm.bill_qr_url}
                  onChange={(event) => setRestaurantForm((current) => ({ ...current, bill_qr_url: event.target.value }))}
                  placeholder="https://apnagreenbasket.com"
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">URL encoded in the printed receipt QR code. (e.g., website or app store link)</span>
              </label>

              <label className="block space-y-1 mt-3">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Invoice Terms & Conditions</span>
                <textarea
                  value={restaurantForm.invoice_terms_conditions}
                  onChange={(event) => setRestaurantForm((current) => ({ ...current, invoice_terms_conditions: event.target.value }))}
                  placeholder="1. Goods once sold will not be taken back."
                  rows={3}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                />
                <span className="text-[10px] text-[var(--text-muted)] block">These terms will be dynamically printed at the bottom of the A4 Tax Invoice.</span>
              </label>
            </div>
          )}

          {/* --- INVENTORY & HARDWARE TAB --- */}
          {activeTab === "hardware" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Hardware Integrations</h3>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Weighing Scale Barcode Format</span>
                  <div className="flex flex-col gap-2">
                    <select
                      value={restaurantForm.weighing_scale_barcode_format?.startsWith("CUSTOM:") ? "CUSTOM_MASK" : (restaurantForm.weighing_scale_barcode_format || "21_5I_5W_GRAMS")}
                      onChange={(e) => setRestaurantForm((current) => ({ ...current, weighing_scale_barcode_format: e.target.value === "CUSTOM_MASK" ? "CUSTOM:XX IIIII WWWWW C" : e.target.value }))}
                      className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm max-w-sm w-full"
                    >
                      <option value="21_5I_5W_GRAMS">21 IIIII WWWWW C (CAS/Essae Default - Grams)</option>
                      <option value="21_5I_5P_INR">21 IIIII PPPPP C (Total Price - INR)</option>
                      <option value="20_6I_4W_GRAMS">20 IIIIII WWWW C (6-digit Item - 4-digit Grams)</option>
                      <option value="03_3I_5W_GRAMS">03 III WWWWW (10-digit: 3-Item 5-Grams)</option>
                      <option value="CUSTOM_MASK">Custom Barcode Mask...</option>
                    </select>

                    {restaurantForm.weighing_scale_barcode_format?.startsWith("CUSTOM:") && (
                      <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-2 max-w-sm">
                        <label className="block space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Custom Mask Pattern</span>
                          <input
                            type="text"
                            value={restaurantForm.weighing_scale_barcode_format.replace("CUSTOM:", "")}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
                              setRestaurantForm((current) => ({ ...current, weighing_scale_barcode_format: `CUSTOM:${val}` }));
                            }}
                            placeholder="e.g. XX III WWWWW"
                            className="rounded-lg border border-sky-500/30 bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm w-full font-mono uppercase focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                          />
                        </label>
                        <div className="text-[10px] text-[var(--text-primary)] font-mono flex gap-3">
                          <span><b className="text-sky-400">I</b> = Item Code</span>
                          <span><b className="text-sky-400">W</b> = Weight</span>
                          <span><b className="text-sky-400">P</b> = Price</span>
                          <span><b className="text-sky-400">X</b> = Ignore</span>
                          <span><b className="text-sky-400">C</b> = Checksum</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] block mt-1">
                    Configures the EAN-13 parser for the POS barcode scanner. Match this to your physical scale's output format.
                  </span>
                </label>
              </div>

              <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <BellRing className="h-4 w-4 text-amber-400" />
                    <span>Inventory &amp; Expiry Alert Settings</span>
                  </h3>
                  <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                    Auto-Dispatches via Resend Email, WhatsApp &amp; SMS
                  </span>
                </div>

                {/* Threshold Setting Card */}
                <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-primary)] font-bold block">
                      Near-Expiry Threshold (Days)
                    </span>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      Batches expiring within these days or reaching shelf life trigger notifications &amp; dispatch to configured contacts.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={restaurantForm.near_expiry_threshold_days}
                      onChange={(event) =>
                        setRestaurantForm((current) => ({
                          ...current,
                          near_expiry_threshold_days: parseInt(event.target.value) || 7,
                        }))
                      }
                      className="w-20 rounded-xl border border-amber-500/40 bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-center text-sm font-bold text-amber-400 focus:border-amber-400 focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-amber-400">Days</span>
                  </div>
                </div>

                {/* Progressive Alert Contacts (Spacious 2-column layout) */}
                <div className="grid sm:grid-cols-2 gap-5 pt-1">
                  {/* Alert Emails Column */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold block">
                        Alert Emails ({restaurantForm.notification_emails?.filter(Boolean).length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRestaurantForm((current) => ({
                            ...current,
                            notification_emails: [...(current.notification_emails || []), ""],
                          }));
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 transition cursor-pointer"
                        title="Add another email recipient"
                      >
                        <Plus className="h-3 w-3" /> Add Email
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(restaurantForm.notification_emails && restaurantForm.notification_emails.length > 0
                        ? restaurantForm.notification_emails
                        : [""]
                      ).map((email, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        const isFilled = email.trim().length > 0;
                        return (
                          <div key={`email-${idx}`} className="flex items-center gap-1.5 animate-in fade-in duration-150">
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRestaurantForm((current) => {
                                  const list = [...(current.notification_emails || [""])];
                                  list[idx] = val;
                                  return { ...current, notification_emails: list };
                                });
                              }}
                              placeholder={idx === 0 ? "admin1@example.com" : `Additional email ${idx + 1}`}
                              className="min-w-0 flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-mono focus:border-amber-400 focus:outline-none transition-colors"
                            />

                            {/* + icon appears on the last entry: brightly lit and active when filled, visible and muted when empty */}
                            {isLast && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isFilled) {
                                    setRestaurantForm((current) => ({
                                      ...current,
                                      notification_emails: [...(current.notification_emails || []), ""],
                                    }));
                                  }
                                }}
                                disabled={!isFilled}
                                title={isFilled ? "Add another alert email" : "Type an email above to activate +"}
                                className={`h-8 w-8 flex items-center justify-center rounded-xl transition-all border shrink-0 ${
                                  isFilled
                                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 hover:scale-105 border-amber-500/30 cursor-pointer shadow-xs"
                                    : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-[var(--border-strong)] opacity-50 cursor-not-allowed"
                                }`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}

                            {/* Delete/remove button if more than 1 entry */}
                            {arr.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRestaurantForm((current) => {
                                    const list = (current.notification_emails || []).filter((_, i) => i !== idx);
                                    return { ...current, notification_emails: list.length > 0 ? list : [""] };
                                  });
                                }}
                                title="Remove email"
                                className="h-8 w-8 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition border border-rose-500/20 shrink-0 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Dispatched via Resend REST API. Click <strong>+</strong> or <strong>Add Email</strong> to add more.
                    </span>
                  </div>

                  {/* Alert Phones Column */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold block">
                        Alert Phones ({restaurantForm.notification_phones?.filter(Boolean).length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRestaurantForm((current) => ({
                            ...current,
                            notification_phones: [...(current.notification_phones || []), ""],
                          }));
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 transition cursor-pointer"
                        title="Add another phone recipient"
                      >
                        <Plus className="h-3 w-3" /> Add Phone
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(restaurantForm.notification_phones && restaurantForm.notification_phones.length > 0
                        ? restaurantForm.notification_phones
                        : [""]
                      ).map((phone, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        const isFilled = phone.trim().length > 0;
                        return (
                          <div key={`phone-${idx}`} className="flex items-center gap-1.5 animate-in fade-in duration-150">
                            <input
                              type="tel"
                              value={phone}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRestaurantForm((current) => {
                                  const list = [...(current.notification_phones || [""])];
                                  list[idx] = val;
                                  return { ...current, notification_phones: list };
                                });
                              }}
                              placeholder={idx === 0 ? "+919876543210" : `Additional phone ${idx + 1}`}
                              className="min-w-0 flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm font-mono focus:border-amber-400 focus:outline-none transition-colors"
                            />

                            {/* + icon appears on the last entry: brightly lit and active when filled, visible and muted when empty */}
                            {isLast && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isFilled) {
                                    setRestaurantForm((current) => ({
                                      ...current,
                                      notification_phones: [...(current.notification_phones || []), ""],
                                    }));
                                  }
                                }}
                                disabled={!isFilled}
                                title={isFilled ? "Add another alert phone" : "Type a phone number above to activate +"}
                                className={`h-8 w-8 flex items-center justify-center rounded-xl transition-all border shrink-0 ${
                                  isFilled
                                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 hover:scale-105 border-amber-500/30 cursor-pointer shadow-xs"
                                    : "bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-[var(--border-strong)] opacity-50 cursor-not-allowed"
                                }`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}

                            {/* Delete/remove button if more than 1 entry */}
                            {arr.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRestaurantForm((current) => {
                                    const list = (current.notification_phones || []).filter((_, i) => i !== idx);
                                    return { ...current, notification_phones: list.length > 0 ? list : [""] };
                                  });
                                }}
                                title="Remove phone"
                                className="h-8 w-8 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition border border-rose-500/20 shrink-0 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Dispatched via WhatsApp &amp; SMS. Click <strong>+</strong> or <strong>Add Phone</strong> to add more.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- SECURITY & RULES TAB --- */}
          {activeTab === "security" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Basket Session & Dashboard Settings</h3>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Dashboard Reset Time (HH:MM)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={restaurantForm.dashboard_reset_time}
                      onChange={(event) => setRestaurantForm((current) => ({ ...current, dashboard_reset_time: event.target.value }))}
                      className="w-32 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-[var(--text-muted)]">Local time when dashboard stats (orders, intake, etc.) reset to a new shift.</span>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Session Duration (minutes)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={restaurantForm.session_duration_minutes}
                      onChange={(event) => setRestaurantForm((current) => ({ ...current, session_duration_minutes: parseInt(event.target.value) || 30 }))}
                      className="w-24 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-[var(--text-muted)]">min (5–120). How long a customer's basket session lasts before expiry.</span>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Public Basket Number</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={restaurantForm.public_basket_number || ""}
                      onChange={(event) => setRestaurantForm((current) => ({ ...current, public_basket_number: event.target.value }))}
                      placeholder="e.g. 0"
                      className="w-24 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-3 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-[var(--text-muted)]">Basket number that bypasses session locking. Leave empty to disable.</span>
                  </div>
                </label>
              </div>

              <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-4">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Basket Verification Rules (Manager+)</h3>
                  <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold">Rule Precedence: Flagged Overrides Cutoff</span>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Auto-Skip Amount Cutoff (₹)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Disabled (Manual for all)"
                      value={restaurantForm.verification_amount_cutoff || ""}
                      onChange={(event) => setRestaurantForm((current) => ({ ...current, verification_amount_cutoff: event.target.value }))}
                      className="w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                    />
                    <span className="text-xs text-[var(--text-muted)]">Orders under this amount skip manual verification.</span>
                  </div>
                </label>

                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Flagged Products (Always Require Verification)</span>
                  <p className="text-xs text-[var(--text-muted)]">Products checked below will ALWAYS require manual staff verification at the counter.</p>
                  {menuItems.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic">No products available in catalog.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3">
                      {menuItems.map((item) => {
                        const isFlagged = restaurantForm.flagged_item_ids.includes(item.id);
                        return (
                          <label key={item.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isFlagged}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setRestaurantForm((current) => {
                                    const updated = checked ? [...current.flagged_item_ids, item.id] : current.flagged_item_ids.filter((id) => id !== item.id);
                                    return { ...current, flagged_item_ids: updated };
                                  });
                                }}
                                className="h-4 w-4 rounded-md border-[var(--border-strong)] text-[var(--accent-brand)] focus:ring-0 accent-[var(--accent-brand)]"
                              />
                              <span className="font-medium text-[var(--text-primary)]">{item.name}</span>
                            </div>
                            <span className="text-[var(--text-muted)] font-mono">{formatRupees(item.price)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- LOYALTY PROGRAM TAB --- */}
          {activeTab === "loyalty" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <span>Customer Loyalty Program</span>
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Points Earned Per ₹100 Spent</span>
                    <input
                      type="number"
                      min={0}
                      value={restaurantForm.loyalty_points_per_100_inr}
                      onChange={(event) => setRestaurantForm((current) => ({ ...current, loyalty_points_per_100_inr: parseInt(event.target.value) || 0 }))}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-bold text-sky-400"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] block">e.g. 5 means ₹350 bill earns 18 points. Set 0 to disable.</span>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-semibold">Max Bill Percentage Redeemable (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={restaurantForm.loyalty_max_bill_percentage}
                      onChange={(event) => setRestaurantForm((current) => ({ ...current, loyalty_max_bill_percentage: event.target.value }))}
                      placeholder="100.00"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] block">Cap to prevent 100% free bills.</span>
                  </label>
                </div>

                <div className="space-y-2 pt-2 border-t border-sky-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-sky-400 font-semibold">Redemption Tiers</span>
                    <button
                      type="button"
                      onClick={() => setRestaurantForm((prev) => ({ ...prev, loyalty_redemption_tiers: [...(prev.loyalty_redemption_tiers || []), { min_points: 0, max_points: null, discount_percentage: 0 }] }))}
                      className="flex items-center gap-1 bg-sky-500/20 text-sky-400 px-2 py-1 rounded-md text-[10px] font-bold hover:bg-sky-500/30 transition"
                    >
                      <Plus className="w-3 h-3" /> Add Tier
                    </button>
                  </div>

                  {(!restaurantForm.loyalty_redemption_tiers || restaurantForm.loyalty_redemption_tiers.length === 0) ? (
                    <div className="text-center py-4 text-xs text-[var(--text-muted)] border border-dashed border-sky-500/20 rounded-xl">
                      No tiers defined. Customers cannot redeem points.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-2 text-[10px] uppercase font-bold text-sky-400/70">
                        <span>Min Points Balance</span>
                        <span>Max Points Balance</span>
                        <span>Conversion Rate (%)</span>
                        <span className="w-6"></span>
                      </div>
                      {restaurantForm.loyalty_redemption_tiers.map((tier, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                          <input
                            type="number"
                            min={0}
                            value={tier.min_points}
                            onChange={(e) => {
                              const newTiers = [...restaurantForm.loyalty_redemption_tiers];
                              newTiers[idx].min_points = parseInt(e.target.value) || 0;
                              setRestaurantForm({ ...restaurantForm, loyalty_redemption_tiers: newTiers });
                            }}
                            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-mono"
                          />
                          <input
                            type="number"
                            min={0}
                            value={tier.max_points === null ? "" : tier.max_points}
                            placeholder="Unlimited"
                            onChange={(e) => {
                              const newTiers = [...restaurantForm.loyalty_redemption_tiers];
                              newTiers[idx].max_points = e.target.value === "" ? null : parseInt(e.target.value);
                              setRestaurantForm({ ...restaurantForm, loyalty_redemption_tiers: newTiers });
                            }}
                            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-mono"
                          />
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={tier.discount_percentage}
                              onChange={(e) => {
                                const newTiers = [...restaurantForm.loyalty_redemption_tiers];
                                newTiers[idx].discount_percentage = parseFloat(e.target.value) || 0;
                                setRestaurantForm({ ...restaurantForm, loyalty_redemption_tiers: newTiers });
                              }}
                              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-mono"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newTiers = restaurantForm.loyalty_redemption_tiers.filter((_, i) => i !== idx);
                              setRestaurantForm({ ...restaurantForm, loyalty_redemption_tiers: newTiers });
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-500/20 rounded-md transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 px-1">
                        Conversion Rate Example: 3% means 1 point equals ₹0.03. If a customer redeems 1000 points, they get a ₹30.00 discount.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--border-subtle)] mt-6">
            <button
              type="submit"
              disabled={isSavingRestaurant}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-md transition active:scale-[0.98]"
            >
              <Save className="h-4 w-4" />
              {isSavingRestaurant ? "Saving Settings..." : "Save All Settings"}
            </button>
          </div>
</form>
      </article>
    </div>
  );
}
