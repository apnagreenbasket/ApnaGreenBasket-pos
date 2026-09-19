/**
 * AdminLoginForm — Pre-auth login screen for the admin dashboard.
 * Supports both Email/Password login and Quick Staff PIN login.
 */

"use client";

import { FormEvent, useState, useEffect } from "react";
import { ArrowRight, KeyRound, Mail, Store, Eye, EyeOff, ChevronDown, Check, Sun, Moon } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";
import { ToastNotification } from "@/app/components/ToastNotification";
import { useAdminTheme } from "../hooks/useAdminTheme";
import { ForgotPasswordModal } from "../modals/ForgotPasswordModal";

type OutletOption = {
  id: string;
  name: string;
  slug: string;
};

type AdminLoginFormProps = {
  onLogin: (email: string, password: string, outletId?: string) => Promise<void>;
  onPinLogin?: (outletId: string, staffId: string, pin: string) => Promise<void>;
  onlyPin?: boolean;
};

export function AdminLoginForm({ onLogin, onPinLogin, onlyPin = false }: AdminLoginFormProps) {
  const { theme, toggleTheme } = useAdminTheme();
  const [authMethod, setAuthMethod] = useState<"email" | "pin">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outletId, setOutletId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [staffList, setStaffList] = useState<{id: string, name: string}[]>([]);
  const [isLoadingOutlets, setIsLoadingOutlets] = useState(false);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"outlet" | "staff" | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.custom-dropdown')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    async function loadOutlets() {
      setIsLoadingOutlets(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/public/outlets`);
        if (res.ok && isSubscribed) {
          const data: OutletOption[] = await res.json();
          setOutlets(data);
          const savedOutlet = typeof window !== "undefined" ? localStorage.getItem("agb_last_outlet_id") : null;
          if (savedOutlet && data.some((o) => o.id === savedOutlet)) {
            setOutletId(savedOutlet);
          } else if (data.length === 1) {
            setOutletId(data[0].id);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isSubscribed) setIsLoadingOutlets(false);
      }
    }

    void loadOutlets();
    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    async function loadStaff() {
      if (!outletId) {
        setStaffList([]);
        setStaffId("");
        return;
      }
      setIsLoadingStaff(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/public/outlets/${outletId}/staff`);
        if (res.ok && isSubscribed) {
          const data = await res.json();
          const activeOnly = data.filter((s: any) => s.is_active !== false && s.status !== "inactive");
          setStaffList(activeOnly);
          const savedStaff = typeof window !== "undefined" ? localStorage.getItem("agb_last_staff_id") : null;
          if (savedStaff && activeOnly.some((s: any) => s.id === savedStaff)) {
            setStaffId(savedStaff);
          } else if (activeOnly.length === 1) {
            setStaffId(activeOnly[0].id);
          } else {
            setStaffId("");
          }
        }
      } catch {
        if (isSubscribed) setStaffList([]);
      } finally {
        if (isSubscribed) setIsLoadingStaff(false);
      }
    }
    void loadStaff();
    return () => {
      isSubscribed = false;
    };
  }, [outletId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setError(null);
    setNotice(null);

    try {
      if (authMethod === "email") {
        if (!outletId.trim() && outlets.length > 0) {
          throw new Error("Please select a Store.");
        }
        if (outletId.trim() && typeof window !== "undefined") {
          localStorage.setItem("agb_last_outlet_id", outletId.trim());
        }
        await onLogin(email, password, outletId.trim() || undefined);
      } else {
        if (!onPinLogin) throw new Error("PIN Login is not configured.");
        if (!outletId.trim()) throw new Error("Please select a Store.");
        if (!staffId.trim()) throw new Error("Please select your Name.");
        if (pin.length !== 4) throw new Error("PIN must be 4 digits.");
        if (typeof window !== "undefined") {
          localStorage.setItem("agb_last_outlet_id", outletId.trim());
          localStorage.setItem("agb_last_staff_id", staffId.trim());
        }
        await onPinLogin(outletId.trim(), staffId.trim(), pin.trim());
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("admin_active_tab");
      }
      setNotice("Signed in successfully.");
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in right now.";
      setError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg-base)] px-4 py-14 sm:px-6 flex items-center justify-center">
      <button 
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-all shadow-sm"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Outlet Operations Login</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage live basket orders, POS Billing, Products & Staff
          </p>
        </div>

        <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_35px_rgba(18,38,58,0.1)]">
          {/* Method Switcher Tabs */}
          {!onlyPin && (
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--bg-base)] p-1.5 mb-6 border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod("pin");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                  authMethod === "pin"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Staff POS PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod("email");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                  authMethod === "email"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                Email & Password
              </button>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Store / Outlet Selection (Shared for both Email and PIN login) */}
            <label className="block space-y-1">
              <span className="text-sm font-medium">Select Outlet / Store</span>
              {isLoadingOutlets ? (
                <div className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)] font-mono animate-pulse">
                  Loading store outlets...
                </div>
              ) : (
                <div className="relative custom-dropdown">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === "outlet" ? null : "outlet")}
                    className="w-full flex items-center justify-between rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[var(--accent-brand)] focus:outline-none transition-all hover:border-[var(--text-muted)]"
                  >
                    <span className={outletId ? "text-[var(--text-primary)] font-semibold" : "text-[var(--text-muted)]"}>
                      {outletId ? outlets.find(o => o.id === outletId)?.name : "-- Choose Your Outlet --"}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${openDropdown === "outlet" ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openDropdown === "outlet" && (
                    <div className="absolute z-10 mt-2 w-full max-h-60 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 shadow-xl shadow-[rgba(0,0,0,0.15)] ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1">
                      {outlets.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setOutletId(o.id);
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between group ${
                            outletId === o.id 
                              ? "bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] font-bold" 
                              : "text-[var(--text-primary)] hover:bg-[var(--bg-base)] font-medium"
                          }`}
                        >
                          <span>{o.name} <span className="opacity-50 text-xs ml-1 font-normal group-hover:opacity-80">/{o.slug}</span></span>
                          {outletId === o.id && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </label>

            {authMethod === "email" ? (
              <>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                    placeholder="admin@outlet.com"
                  />
                </label>
                <label className="block space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Password</span>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setIsForgotModalOpen(true);
                      }}
                      className="text-xs font-semibold text-[var(--accent-brand)] hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] pl-3 pr-10 py-2 text-sm"
                      placeholder="Minimum 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Select Staff Member</span>
                  {isLoadingStaff ? (
                    <div className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-muted)] font-mono animate-pulse">
                      Loading staff...
                    </div>
                  ) : (
                    <div className="relative custom-dropdown">
                      <button
                        type="button"
                        disabled={!outletId || staffList.length === 0}
                        onClick={() => setOpenDropdown(openDropdown === "staff" ? null : "staff")}
                        className="w-full flex items-center justify-between rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[var(--accent-brand)] focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--text-muted)]"
                      >
                        <span className={staffId ? "text-[var(--text-primary)] font-semibold" : "text-[var(--text-muted)]"}>
                          {staffId ? staffList.find(s => s.id === staffId)?.name : "-- Choose Your Name --"}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${openDropdown === "staff" ? "rotate-180" : ""}`} />
                      </button>
                      
                      {openDropdown === "staff" && (
                        <div className="absolute z-10 mt-2 w-full max-h-60 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1.5 shadow-xl shadow-[rgba(0,0,0,0.15)] ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1">
                          {staffList.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setStaffId(s.id);
                                setOpenDropdown(null);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between group ${
                                staffId === s.id 
                                  ? "bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] font-bold" 
                                  : "text-[var(--text-primary)] hover:bg-[var(--bg-base)] font-medium"
                              }`}
                            >
                              <span>{s.name}</span>
                              {staffId === s.id && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Staff 4-Digit PIN</span>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      required
                      maxLength={4}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-center text-xl font-bold tracking-widest font-mono"
                      placeholder="••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:cursor-not-allowed disabled:opacity-70 mt-2"
            >
              {isAuthenticating ? "Signing in..." : authMethod === "email" ? "Sign in to Outlet" : "Quick PIN Login"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <ToastNotification 
            notice={notice} 
            error={error} 
            clear={() => { setNotice(null); setError(null); }} 
          />

          <ForgotPasswordModal
            isOpen={isForgotModalOpen}
            onClose={() => setIsForgotModalOpen(false)}
            initialEmail={email}
            onSuccess={(resetEmail) => {
              setEmail(resetEmail);
              setPassword("");
              setNotice("Password successfully reset! Please sign in with your new password.");
            }}
          />
        </section>
      </div>
    </div>
  );
}
