import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import type { StaffMember } from "@/types";
import {
  SA_ACCESS_TOKEN_KEY,
  SA_REFRESH_TOKEN_KEY,
  type AdminUserForm,
  type LoginResponse,
  type RestaurantCreateForm,
  type RestaurantWithUsers,
} from "../superadminTypes";
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../../login/adminTypes";

function decodeJwtRole(token: string): string | null {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);
    return payload.role || null;
  } catch {
    return null;
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : "Request failed. Please try again.";
    throw new Error(detail);
  }
  return payload as T;
}

export function useSuperadminData() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Theme Mode
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = (localStorage.getItem("app_theme") as "light" | "dark") || "light";
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
      if (stored === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("app_theme", next);
    document.documentElement.setAttribute("data-theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Directory state
  const [restaurants, setRestaurants] = useState<RestaurantWithUsers[]>([]);
  const [isLoadingRestaurants, setIsLoadingRestaurants] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [staffByOutlet, setStaffByOutlet] = useState<Record<string, StaffMember[]>>({});

  // Check stored token on load and verify role is SUPERADMIN
  useEffect(() => {
    setIsMounted(true);
    if (typeof window === "undefined") return;
    const storedToken = window.localStorage.getItem(SA_ACCESS_TOKEN_KEY);
    if (storedToken) {
      const role = decodeJwtRole(storedToken);
      if (role === "SUPERADMIN") {
        setAccessToken(storedToken);
      } else {
        window.localStorage.removeItem(SA_ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(SA_REFRESH_TOKEN_KEY);
      }
    }
  }, []);

  // Restaurant creation state
  const [restaurantForm, setRestaurantForm] = useState<RestaurantCreateForm>({
    name: "",
    slug: "",
    payment_mode: "PAY_AT_COUNTER",
    razorpay_account_id: "",
    direct_upi_id: "",
    raw_upi_payload: "",
    logo_url: "",
    address: "",
    phone: "",
    gstin: "",
    fssai_no: "",
    session_duration_minutes: 30,
    verification_amount_cutoff: "",
    email: "",
    bill_qr_url: "",
    place_of_supply: "",
    invoice_terms_conditions: "",
  });
  const [isCreatingRestaurant, setIsCreatingRestaurant] = useState(false);

  // Outlet Settings Modal state
  const [settingsOutlet, setSettingsOutlet] = useState<RestaurantWithUsers | null>(null);
  const [settingsForm, setSettingsForm] = useState<RestaurantCreateForm>({
    name: "",
    slug: "",
    payment_mode: "PAY_AT_COUNTER",
    razorpay_account_id: "",
    direct_upi_id: "",
    raw_upi_payload: "",
    logo_url: "",
    address: "",
    phone: "",
    gstin: "",
    fssai_no: "",
    session_duration_minutes: 30,
    verification_amount_cutoff: "",
    email: "",
    bill_qr_url: "",
    place_of_supply: "",
    invoice_terms_conditions: "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.",
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // User creation state
  const [adminUserForm, setAdminUserForm] = useState<AdminUserForm>({
    name: "",
    email: "",
    phone: "",
    password: "",
    pin: "",
    role: "OUTLET_ADMIN",
  });
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Confirm Delete Modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "OUTLET" | "USER";
    id: string;
    name: string;
  } | null>(null);
  const [isDeletingEntity, setIsDeletingEntity] = useState(false);

  // Step: "create_restaurant" | "create_admin" | "done"
  const [step, setStep] = useState<"create_restaurant" | "create_admin" | "done">("create_restaurant");

  const authHeaders = useMemo(() => {
    if (!accessToken) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const refreshTokenPromiseRef = useRef<Promise<string | null> | null>(null);

  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    if (refreshTokenPromiseRef.current) {
      return refreshTokenPromiseRef.current;
    }

    const refreshToken = window.localStorage.getItem(SA_REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    refreshTokenPromiseRef.current = (async () => {
      try {
        const apiBase = getApiBaseUrl();
        const response = await fetch(`${apiBase}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          window.localStorage.removeItem(SA_ACCESS_TOKEN_KEY);
          window.localStorage.removeItem(SA_REFRESH_TOKEN_KEY);
          setAccessToken(null);
          return null;
        }

        const data = (await response.json()) as LoginResponse;
        setAccessToken(data.access_token);
        window.localStorage.setItem(SA_ACCESS_TOKEN_KEY, data.access_token);
        window.localStorage.setItem(SA_REFRESH_TOKEN_KEY, data.refresh_token);
        return data.access_token;
      } catch {
        window.localStorage.removeItem(SA_ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(SA_REFRESH_TOKEN_KEY);
        setAccessToken(null);
        return null;
      } finally {
        refreshTokenPromiseRef.current = null;
      }
    })();

    return refreshTokenPromiseRef.current;
  }, []);

  const apiRequest = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!authHeaders) throw new Error("Please sign in first.");
      const apiBase = getApiBaseUrl();
      let response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: { ...authHeaders, ...(options?.headers || {}) },
      });

      if (response.status === 401) {
        const newAccessToken = await tryRefreshToken();
        if (newAccessToken) {
          response = await fetch(`${apiBase}${path}`, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAccessToken}`,
              ...(options?.headers || {}),
            },
          });
        }
      }

      return parseApiResponse<T>(response);
    },
    [authHeaders, tryRefreshToken]
  );

  const loadStaffForOutlet = useCallback(
    async (restaurantId: string) => {
      if (!authHeaders || !restaurantId) return;
      try {
        const staffData = await apiRequest<StaffMember[]>(`/api/staff?outlet_id=${restaurantId}`);
        setStaffByOutlet((prev) => ({ ...prev, [restaurantId]: staffData }));
      } catch (err) {
        console.error("Superadmin staff fetch error:", err);
      }
    },
    [apiRequest, authHeaders]
  );

  const loadRestaurants = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingRestaurants(true);
    setError(null);

    try {
      const data = await apiRequest<RestaurantWithUsers[]>("/api/admin/outlets");
      setRestaurants(data);
      // Auto-expand all restaurant team sections by default
      setExpandedIds(new Set(data.map((r) => r.id)));
      data.forEach((r) => void loadStaffForOutlet(r.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load outlets.";
      setError(message);
    } finally {
      setIsLoadingRestaurants(false);
    }
  }, [accessToken, apiRequest, loadStaffForOutlet]);

  useEffect(() => {
    if (accessToken) {
      void loadRestaurants();
    }
  }, [accessToken, loadRestaurants]);

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthenticating(true);
    setError(null);
    setNotice(null);

    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseApiResponse<LoginResponse>(response);

      if (data.role !== "SUPERADMIN") {
        throw new Error(
          `Access denied. Superadmin credentials required. Your account role is '${data.role || "UNKNOWN"}'.`
        );
      }

      setAccessToken(data.access_token);
      window.localStorage.setItem(SA_ACCESS_TOKEN_KEY, data.access_token);
      window.localStorage.setItem(SA_REFRESH_TOKEN_KEY, data.refresh_token);
      setNotice("Signed in as superadmin.");
    } catch (loginError) {
      const message =
        loginError instanceof Error ? loginError.message : "Unable to sign in.";
      setError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const onLogout = async () => {
    try {
      if (accessToken) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    } catch {
      // Ignore
    }

    setAccessToken(null);
    window.localStorage.removeItem(SA_ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(SA_REFRESH_TOKEN_KEY);
    setRestaurants([]);
    setStep("create_restaurant");
    setNotice("Signed out.");
  };

  const onImpersonateOutlet = async (outletId: string) => {
    if (!accessToken) return;
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/impersonate/${outletId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to impersonate outlet.");
      }

      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        window.open("/", "_blank");
      } else {
        throw new Error("Invalid token received from server.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while impersonating.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const onCreateRestaurant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingRestaurant(true);
    setError(null);

    try {
      const payload = {
        name: restaurantForm.name.trim(),
        slug: restaurantForm.slug.trim(),
        payment_mode: restaurantForm.payment_mode,
        razorpay_account_id: restaurantForm.razorpay_account_id.trim() || null,
        direct_upi_id: restaurantForm.direct_upi_id.trim() || null,
        raw_upi_payload: restaurantForm.raw_upi_payload.trim() || null,
        logo_url: restaurantForm.logo_url.trim() || null,
        address: restaurantForm.address.trim() || null,
        phone: restaurantForm.phone.trim() || null,
        gstin: restaurantForm.gstin.trim() || null,
        fssai_no: restaurantForm.fssai_no.trim() || null,
        session_duration_minutes: Number(restaurantForm.session_duration_minutes) || 30,
        verification_amount_cutoff: restaurantForm.verification_amount_cutoff ? Number(restaurantForm.verification_amount_cutoff) : null,
        email: restaurantForm.email.trim() || null,
        bill_qr_url: restaurantForm.bill_qr_url.trim() || null,
        place_of_supply: restaurantForm.place_of_supply.trim() || null,
        invoice_terms_conditions: restaurantForm.invoice_terms_conditions.trim() || null,
      };

      const created = await apiRequest<RestaurantWithUsers>(
        "/api/admin/outlets",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setSelectedRestaurantId(created.id);
      setRestaurantForm({
        name: "",
        slug: "",
        payment_mode: "PAY_AT_COUNTER",
        razorpay_account_id: "",
        direct_upi_id: "",
        raw_upi_payload: "",
        logo_url: "",
        address: "",
        phone: "",
        gstin: "",
        fssai_no: "",
        session_duration_minutes: 30,
        verification_amount_cutoff: "",
        email: "",
        bill_qr_url: "",
        place_of_supply: "",
        invoice_terms_conditions: "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.",
      });
      setNotice(`Outlet "${created.name}" created successfully! Now assign a user.`);
      setStep("create_admin");
      void loadRestaurants();
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create outlet.";
      setError(message);
    } finally {
      setIsCreatingRestaurant(false);
    }
  };

  const openOutletSettings = (outlet: RestaurantWithUsers) => {
    setSettingsOutlet(outlet);
    setSettingsForm({
      name: outlet.name,
      slug: outlet.slug,
      payment_mode: outlet.payment_mode || "PAY_AT_COUNTER",
      razorpay_account_id: outlet.razorpay_account_id || "",
      direct_upi_id: outlet.direct_upi_id || "",
      raw_upi_payload: outlet.raw_upi_payload || "",
      logo_url: outlet.logo_url || "",
      address: outlet.address || "",
      phone: outlet.phone || "",
      gstin: outlet.gstin || "",
      fssai_no: outlet.fssai_no || "",
      session_duration_minutes: outlet.session_duration_minutes ?? 30,
      verification_amount_cutoff: outlet.verification_amount_cutoff != null ? String(outlet.verification_amount_cutoff) : "",
      email: outlet.email || "",
      bill_qr_url: outlet.bill_qr_url || "",
      place_of_supply: outlet.place_of_supply || "",
      invoice_terms_conditions: outlet.invoice_terms_conditions || "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.",
    });
  };

  const onSaveOutletSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settingsOutlet) return;
    setIsSavingSettings(true);
    setError(null);

    try {
      const payload = {
        name: settingsForm.name.trim(),
        slug: settingsForm.slug.trim(),
        payment_mode: settingsForm.payment_mode,
        razorpay_account_id: settingsForm.razorpay_account_id.trim() || null,
        direct_upi_id: settingsForm.direct_upi_id.trim() || null,
        raw_upi_payload: settingsForm.raw_upi_payload.trim() || null,
        logo_url: settingsForm.logo_url.trim() || null,
        address: settingsForm.address.trim() || null,
        phone: settingsForm.phone.trim() || null,
        gstin: settingsForm.gstin.trim() || null,
        fssai_no: settingsForm.fssai_no.trim() || null,
        session_duration_minutes: Number(settingsForm.session_duration_minutes) || 30,
        verification_amount_cutoff: settingsForm.verification_amount_cutoff ? Number(settingsForm.verification_amount_cutoff) : null,
        email: settingsForm.email.trim() || null,
        bill_qr_url: settingsForm.bill_qr_url.trim() || null,
        place_of_supply: settingsForm.place_of_supply.trim() || null,
        invoice_terms_conditions: settingsForm.invoice_terms_conditions.trim() || null,
      };

      await apiRequest(`/api/admin/outlets/${settingsOutlet.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setNotice(`Outlet "${settingsForm.name}" configuration updated successfully!`);
      setSettingsOutlet(null);
      void loadRestaurants();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save outlet settings.";
      setError(message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const onCreateAdminUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRestaurantId) {
      setError("Select an outlet first.");
      return;
    }

    const trimmedPhone = adminUserForm.phone.trim();
    const phoneDigits = trimmedPhone.replace(/\D/g, "");
    if (!trimmedPhone || phoneDigits.length < 10) {
      setError("Phone number is required and must contain at least 10 digits.");
      return;
    }
    if (phoneDigits.length > 15) {
      setError("Phone number cannot exceed 15 digits.");
      return;
    }

    const trimmedPin = adminUserForm.pin.trim();
    if (trimmedPin && trimmedPin.length !== 4) {
      setError("POS PIN must be exactly 4 digits.");
      return;
    }

    if (adminUserForm.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsCreatingUser(true);
    setError(null);

    try {
      await apiRequest<{ message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: adminUserForm.name.trim() || undefined,
          email: adminUserForm.email.trim(),
          phone: trimmedPhone || undefined,
          password: adminUserForm.password,
          pin: trimmedPin || undefined,
          outlet_id: selectedRestaurantId,
          role: adminUserForm.role,
        }),
      });

      setNotice(
        `User "${adminUserForm.name || adminUserForm.email}" (${adminUserForm.role.replace("_", " ")}) created successfully.`
      );
      setAdminUserForm({ name: "", email: "", phone: "", password: "", pin: "", role: "OUTLET_ADMIN" });
      setStep("done");
      void loadRestaurants();
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create user.";
      setError(message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const onActivateUser = async (userId: string, userEmail: string) => {
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${userId}/activate`, { method: "POST" });
      setNotice(`User account "${userEmail}" activated.`);
      void loadRestaurants();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to activate user.";
      setError(message);
    }
  };

  const onDeactivateUser = async (userId: string, userEmail: string) => {
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${userId}/deactivate`, { method: "POST" });
      setNotice(`User account "${userEmail}" deactivated.`);
      void loadRestaurants();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deactivate user.";
      setError(message);
    }
  };

  const deleteRestaurant = (restaurantId: string, restaurantName: string) => {
    setDeleteTarget({ type: "OUTLET", id: restaurantId, name: restaurantName });
  };

  const deleteUser = (userId: string, userEmail: string) => {
    const user = restaurants.flatMap((r) => r.users).find((u) => u.id === userId);
    if (user && user.is_active !== false && user.status !== "inactive") {
      setError(`Cannot delete active user "${userEmail}". Please deactivate the user first.`);
      return;
    }
    setDeleteTarget({ type: "USER", id: userId, name: userEmail });
  };

  const executeConfirmedDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingEntity(true);
    setError(null);
    try {
      if (deleteTarget.type === "OUTLET") {
        await apiRequest<void>(`/api/admin/outlets/${deleteTarget.id}`, {
          method: "DELETE",
        });
        setNotice(`Outlet "${deleteTarget.name}" deleted successfully.`);
      } else {
        const user = restaurants.flatMap((r) => r.users).find((u) => u.id === deleteTarget.id);
        if (user && user.is_active !== false && user.status !== "inactive") {
          setError(`Cannot delete active user "${deleteTarget.name}". Please deactivate the user first.`);
          setDeleteTarget(null);
          return;
        }
        await apiRequest<void>(`/api/auth/users/${deleteTarget.id}`, {
          method: "DELETE",
        });
        setNotice(`User account "${deleteTarget.name}" permanently deleted.`);
      }
      setDeleteTarget(null);
      void loadRestaurants();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete entity.";
      setError(message);
    } finally {
      setIsDeletingEntity(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startAddUserForRestaurant = (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
    setStep("create_admin");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const autoSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const filteredRestaurants = useMemo(() => {
    if (!searchQuery.trim()) return restaurants;
    const query = searchQuery.toLowerCase();
    return restaurants.filter((r) => {
      const matchesName = r.name.toLowerCase().includes(query);
      const matchesSlug = r.slug.toLowerCase().includes(query);
      const matchesUser = r.users.some((u) => u.email.toLowerCase().includes(query));
      return matchesName || matchesSlug || matchesUser;
    });
  }, [restaurants, searchQuery]);

  return {
    email,
    setEmail,
    password,
    setPassword,
    accessToken,
    isMounted,
    isAuthenticating,
    error,
    setError,
    notice,
    setNotice,
    theme,
    toggleTheme,
    restaurants,
    isLoadingRestaurants,
    searchQuery,
    setSearchQuery,
    expandedIds,
    toggleExpand,
    copiedId,
    copyToClipboard,
    staffByOutlet,
    restaurantForm,
    setRestaurantForm,
    isCreatingRestaurant,
    settingsOutlet,
    setSettingsOutlet,
    settingsForm,
    setSettingsForm,
    isSavingSettings,
    adminUserForm,
    setAdminUserForm,
    selectedRestaurantId,
    setSelectedRestaurantId,
    isCreatingUser,
    step,
    setStep,
    filteredRestaurants,
    onLogin,
    onImpersonateOutlet,
    onLogout,
    loadRestaurants,
    onCreateRestaurant,
    openOutletSettings,
    onSaveOutletSettings,
    onCreateAdminUser,
    onActivateUser,
    onDeactivateUser,
    deleteRestaurant,
    deleteUser,
    deleteTarget,
    setDeleteTarget,
    isDeletingEntity,
    executeConfirmedDelete,
    startAddUserForRestaurant,
    autoSlug,
  };
}
