import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  RolePermissions,
  StaffAuditEntry,
  StaffAuditLogPage,
  StaffMember,
} from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import type { StaffModalFormState } from "../modals/StaffModal";
import { isAuthError } from "../adminUtils";

type UseStaffManagementProps = {
  accessToken: string | null;
  authHeaders: Record<string, string> | null;
  restaurant: RestaurantProfile | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setSessionToken?: (newToken: string) => void;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useStaffManagement({
  accessToken,
  authHeaders,
  restaurant,
  apiRequest,
  setSessionToken,
  setNotice,
  setError,
}: UseStaffManagementProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [staffPermissions, setStaffPermissions] = useState<RolePermissions | null>(null);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffAuditLogs, setStaffAuditLogs] = useState<StaffAuditEntry[]>([]);

  // Staff Modals State
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffFormState, setStaffFormState] = useState<StaffModalFormState>({
    outlet_id: "",
    name: "",
    email: "",
    phone: "",
    role: "STAFF",
    password: "",
    pin: "",
  });
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTargetStaff, setPinTargetStaff] = useState<StaffMember | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);

  const [pinSwitchModalOpen, setPinSwitchModalOpen] = useState(false);
  const [pinSwitchStaffId, setPinSwitchStaffId] = useState("");
  const [pinSwitchInput, setPinSwitchInput] = useState("");
  const [isSwitchingPin, setIsSwitchingPin] = useState(false);

  // Audit Filters & Pagination
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>("");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditDateFilter, setAuditDateFilter] = useState<string>("");
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);

  // Load Staff Data
  const loadStaffMembers = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingStaff(true);
    try {
      const data = await apiRequest<StaffMember[]>("/api/staff");
      setStaffList(data);
      const activeMembers = data.filter((m) => m.status === "active");
      if (activeMembers.length > 0 && (!pinSwitchStaffId || !activeMembers.some((m) => m.id === pinSwitchStaffId))) {
        setPinSwitchStaffId(activeMembers[0].id);
      }
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Staff fetch error:", err);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [apiRequest, authHeaders]);

  const loadStaffPermissions = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const perms = await apiRequest<RolePermissions>("/api/staff/permissions");
      setStaffPermissions(perms);
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Permissions fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

  const loadMyProfile = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const myProfile = await apiRequest<StaffMember>("/api/staff/me");
      if (myProfile) {
        setActiveStaff(myProfile);
      }
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Profile fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

  const loadStaffAuditLogs = useCallback(async () => {
    if (!authHeaders || !staffPermissions?.can_manage_staff) return;
    try {
      const params = new URLSearchParams({
        page: String(auditPage),
        page_size: "20",
      });
      if (auditRoleFilter) params.set("role", auditRoleFilter);
      if (auditActionFilter) params.set("action_type", auditActionFilter);
      if (auditDateFilter === "today") {
        params.set("from_date", new Date().toISOString().split("T")[0]);
      } else if (auditDateFilter === "7days") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.set("from_date", d.toISOString().split("T")[0]);
      } else if (auditDateFilter === "30days") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.set("from_date", d.toISOString().split("T")[0]);
      }

      const res = await apiRequest<StaffAuditLogPage>(`/api/staff/audit-log?${params.toString()}`);
      setStaffAuditLogs(res.items);
      setAuditTotalPages(res.total_pages);
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Audit log fetch error:", err);
    }
  }, [authHeaders, staffPermissions?.can_manage_staff, auditPage, auditRoleFilter, auditActionFilter, auditDateFilter, apiRequest]);

  // Initial load
  useEffect(() => {
    if (authHeaders) {
      setStaffPermissions(null);
      void loadStaffPermissions();
      void loadMyProfile();
      void loadStaffMembers();
    } else {
      setStaffPermissions(null);
      setActiveStaff(null);
      setStaffList([]);
      setStaffAuditLogs([]);
    }
  }, [authHeaders, loadStaffPermissions, loadMyProfile, loadStaffMembers]);

  // Ensure staffList is loaded whenever PIN switcher modal is opened
  useEffect(() => {
    if (pinSwitchModalOpen && staffList.length === 0 && authHeaders) {
      void loadStaffMembers();
    }
  }, [pinSwitchModalOpen, staffList.length, authHeaders, loadStaffMembers]);

  // Automatically select the first active staff member if none selected or if selected is inactive
  useEffect(() => {
    const activeMembers = staffList.filter((m) => m.status === "active");
    if (activeMembers.length > 0 && (!pinSwitchStaffId || !activeMembers.some((m) => m.id === pinSwitchStaffId))) {
      setPinSwitchStaffId(activeMembers[0].id);
    }
  }, [staffList, pinSwitchStaffId]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setAuditPage(1);
  }, [auditRoleFilter, auditActionFilter, auditDateFilter]);

  // Re-fetch audit logs when permissions are ready or when filters / page change
  useEffect(() => {
    if (staffPermissions?.can_manage_staff) {
      void loadStaffAuditLogs();
    }
  }, [staffPermissions?.can_manage_staff, loadStaffAuditLogs]);

  const onSubmitStaffMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingStaff(true);
    setError(null);

    const targetRestaurantId = restaurant?.id || null;

    const trimmedPhone = staffFormState.phone.trim();
    const phoneDigits = trimmedPhone.replace(/\D/g, "");
    if (!editingStaffId) {
      if (!trimmedPhone || phoneDigits.length < 10) {
        setError("Phone number is required and must contain at least 10 digits.");
        setIsSavingStaff(false);
        return;
      }
      if (phoneDigits.length > 15) {
        setError("Phone number cannot exceed 15 digits.");
        setIsSavingStaff(false);
        return;
      }
    } else if (trimmedPhone) {
      if (phoneDigits.length < 10) {
        setError("Phone number must contain at least 10 digits.");
        setIsSavingStaff(false);
        return;
      }
      if (phoneDigits.length > 15) {
        setError("Phone number cannot exceed 15 digits.");
        setIsSavingStaff(false);
        return;
      }
    }

    try {
      if (editingStaffId) {
        const payload = {
          name: staffFormState.name.trim(),
          email: staffFormState.email.trim(),
          phone: trimmedPhone || null,
          role: staffFormState.role,
        };
        const updated = await apiRequest<StaffMember>(`/api/staff/${editingStaffId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice(`Staff member "${updated.name}" updated.`);
      } else {
        if (staffFormState.password.length < 8) {
          setError("Password must be at least 8 characters.");
          setIsSavingStaff(false);
          return;
        }
        const trimmedPin = staffFormState.pin.trim();
        if (trimmedPin && trimmedPin.length !== 4) {
          setError("Initial PIN must be exactly 4 digits.");
          setIsSavingStaff(false);
          return;
        }
        const payload = {
          outlet_id: targetRestaurantId,
          name: staffFormState.name.trim(),
          email: staffFormState.email.trim(),
          phone: trimmedPhone || null,
          role: staffFormState.role,
          password: staffFormState.password,
          pin: trimmedPin || null,
        };
        const created = await apiRequest<StaffMember>("/api/staff", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice(`Staff member "${created.name}" created.`);
      }

      setStaffModalOpen(false);
      setEditingStaffId(null);
      setStaffFormState({ outlet_id: "", name: "", email: "", phone: "", role: "STAFF", password: "", pin: "" });
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save staff member.");
    } finally {
      setIsSavingStaff(false);
    }
  };

  const onDeactivateStaffMember = async (id: string, name: string) => {
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${id}/deactivate`, { method: "POST" });
      setNotice(`Staff member "${name}" deactivated.`);
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate staff.");
    }
  };

  const onActivateStaffMember = async (id: string, name: string) => {
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${id}/activate`, { method: "POST" });
      setNotice(`Staff member "${name}" activated.`);
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate staff.");
    }
  };

  const onDeleteStaffMemberPermanently = async (id: string, name: string) => {
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${id}?permanent=true`, { method: "DELETE" });
      setNotice(`Staff member "${name}" permanently deleted.`);
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete staff member.");
    }
  };

  const onSubmitSetStaffPin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pinTargetStaff) return;
    const trimmedPin = pinInput.trim();
    if (trimmedPin.length !== 4) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    setIsSavingPin(true);
    setError(null);

    try {
      await apiRequest<void>(`/api/staff/${pinTargetStaff.id}/set-pin`, {
        method: "POST",
        body: JSON.stringify({ pin: trimmedPin }),
      });
      setNotice(`PIN updated for "${pinTargetStaff.name}".`);
      setPinModalOpen(false);
      setPinTargetStaff(null);
      setPinInput("");
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set PIN.");
    } finally {
      setIsSavingPin(false);
    }
  };

  const onSubmitPinQuickSwitch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pinSwitchStaffId) {
      setError("Please select a staff member.");
      return;
    }
    const target = staffList.find((m) => m.id === pinSwitchStaffId);
    if (target && target.status !== "active") {
      setError("This staff account is deactivated and cannot switch active context.");
      return;
    }
    const trimmedPin = pinSwitchInput.trim();
    if (trimmedPin.length !== 4) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    setIsSwitchingPin(true);
    setError(null);

    try {
      const res = await apiRequest<{ staff_context_token: string; active_staff: StaffMember }>(
        "/api/staff/pin-switch",
        {
          method: "POST",
          body: JSON.stringify({ staff_id: pinSwitchStaffId, pin: trimmedPin }),
        }
      );

      // Prevent race conditions by synchronously clearing permissions before the token hot-swap
      setStaffPermissions(null);

      if (res.staff_context_token && setSessionToken) {
        setSessionToken(res.staff_context_token);
      }
      setActiveStaff(res.active_staff);
      setNotice(`Switched active staff to ${res.active_staff.name} (${res.active_staff.role})`);
      setPinSwitchModalOpen(false);
      setPinSwitchInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid staff PIN.");
    } finally {
      setIsSwitchingPin(false);
    }
  };

  return {
    staffList,
    setStaffList,
    activeStaff,
    setActiveStaff,
    staffPermissions,
    setStaffPermissions,
    isLoadingStaff,
    staffAuditLogs,
    setStaffAuditLogs,
    staffModalOpen,
    setStaffModalOpen,
    editingStaffId,
    setEditingStaffId,
    staffFormState,
    setStaffFormState,
    isSavingStaff,
    pinModalOpen,
    setPinModalOpen,
    pinTargetStaff,
    setPinTargetStaff,
    pinInput,
    setPinInput,
    isSavingPin,
    pinSwitchModalOpen,
    setPinSwitchModalOpen,
    pinSwitchStaffId,
    setPinSwitchStaffId,
    pinSwitchInput,
    setPinSwitchInput,
    isSwitchingPin,
    // Filters
    auditRoleFilter,
    setAuditRoleFilter,
    auditActionFilter,
    setAuditActionFilter,
    auditDateFilter,
    setAuditDateFilter,
    auditPage,
    setAuditPage,
    auditTotalPages,
    // Handlers
    loadStaffMembers,
    loadStaffPermissions,
    loadStaffAuditLogs,
    onSubmitStaffMember,
    onDeactivateStaffMember,
    onActivateStaffMember,
    onDeleteStaffMemberPermanently,
    onSubmitSetStaffPin,
    onSubmitPinQuickSwitch,
  };
}
