import { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Moon, ShieldCheck, Sun, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { ToastNotification } from "@/app/components/ToastNotification";
import { ForgotPasswordModal } from "../../login/modals/ForgotPasswordModal";

type SuperadminLoginFormProps = {
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  isAuthenticating: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  error: string | null;
  notice: string | null;
  setNotice: (val: string | null) => void;
  setError: (val: string | null) => void;
  onLogin: (e: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function SuperadminLoginForm({
  email,
  setEmail,
  password,
  setPassword,
  isAuthenticating,
  theme,
  toggleTheme,
  error,
  notice,
  setNotice,
  setError,
  onLogin,
}: SuperadminLoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-brand)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Outlet Admin Login
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition"
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? (
              <Moon className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        </div>

        <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[0_10px_35px_rgba(18,38,58,0.1)]">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand)] text-[var(--text-on-accent)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Superadmin Portal</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Platform management &amp; outlet directory
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={onLogin}>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Superadmin Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-base)] px-3 py-2 text-sm"
                placeholder="superadmin@apnagreenbasket.com"
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
                  onChange={(e) => setPassword(e.target.value)}
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
            <button
              type="submit"
              disabled={isAuthenticating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAuthenticating ? "Verifying..." : "Sign in as Superadmin"}
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
