/**
 * useStaffPunch — Custom hook for managing staff shift punch-in, punch-out, live timer, and modals.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StaffPunchStatus } from "../adminTypes";

type UseStaffPunchProps = {
  accessToken: string | null;
  userRole?: string | null;
  isAdminRole: boolean;
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
  onOpenPinSwitch: () => void;
  onReloadDashboardData?: () => void;
};

export function useStaffPunch({
  accessToken,
  userRole,
  isAdminRole,
  apiRequest,
  setNotice,
  setError,
  onOpenPinSwitch,
  onReloadDashboardData,
}: UseStaffPunchProps) {
  const [punchStatus, setPunchStatus] = useState<StaffPunchStatus | null>(null);
  const [isCheckingPunch, setIsCheckingPunch] = useState<boolean>(false);
  const [isPunchingIn, setIsPunchingIn] = useState<boolean>(false);
  const [isPunchingOut, setIsPunchingOut] = useState<boolean>(false);
  const [punchInModalOpen, setPunchInModalOpen] = useState<boolean>(false);
  const [punchOutModalOpen, setPunchOutModalOpen] = useState<boolean>(false);
  const [liveShiftSeconds, setLiveShiftSeconds] = useState<number>(0);

  const isShiftExempt = isAdminRole || userRole?.toUpperCase() === "INVENTORY_MANAGER";

  const fetchPunchStatus = useCallback(async () => {
    if (!accessToken) return;

    if (isShiftExempt) {
      setPunchStatus({
        is_exempt: true,
        is_punched_in: true,
        elapsed_seconds: 0,
        max_shift_seconds: 43200,
      });
      setPunchInModalOpen(false);
      return;
    }

    setIsCheckingPunch(true);
    try {
      const data = await apiRequest<StaffPunchStatus>("/api/staff/punch/status");
      setPunchStatus(data);
      setLiveShiftSeconds(data.elapsed_seconds || 0);

      if (!data.is_punched_in && !data.is_exempt) {
        setPunchInModalOpen(true);
      } else {
        setPunchInModalOpen(false);
      }
    } catch (err: any) {
      console.error("Failed to check punch status:", err);
    } finally {
      setIsCheckingPunch(false);
    }
  }, [accessToken, isShiftExempt, apiRequest]);

  // Live timer tick every 1 second when punched in, with automatic 12:00 AM IST midnight shift expiry detection
  useEffect(() => {
    if (isShiftExempt || !punchStatus?.is_punched_in) {
      return;
    }

    let lastKnownDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const interval = setInterval(() => {
      // Check if midnight 12:00 AM IST crossed
      const currentDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (currentDate !== lastKnownDate) {
        lastKnownDate = currentDate;
        // Midnight IST arrived — trigger punch status refresh to auto-close shift and prompt punch-in for new day
        void fetchPunchStatus();
        try {
          onReloadDashboardData?.();
        } catch {}
        return;
      }

      setLiveShiftSeconds((prev) => {
        const next = prev + 1;
        // Check if exceeded 12 hours (43200 seconds)
        if (next >= 43200) {
          // Trigger refresh to let backend auto-expire
          void fetchPunchStatus();
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAdminRole, punchStatus?.is_punched_in, fetchPunchStatus, onReloadDashboardData]);

  // Initial check on token/role changes
  useEffect(() => {
    if (accessToken) {
      void fetchPunchStatus();
    } else {
      setPunchStatus(null);
      setPunchInModalOpen(false);
    }
  }, [accessToken, userRole, isAdminRole, fetchPunchStatus]);

  const handlePunchIn = useCallback(
    async (openingCash?: number) => {
      setIsPunchingIn(true);
      try {
        const body = openingCash !== undefined ? { opening_cash: openingCash } : {};
        const res = await apiRequest<StaffPunchStatus>("/api/staff/punch/in", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setPunchStatus(res);
        setLiveShiftSeconds(res.elapsed_seconds || 0);
        setPunchInModalOpen(false);
        setNotice("Shift started. Punched in successfully.");
        try {
          onReloadDashboardData?.();
        } catch (reloadErr) {
          console.warn("Failed to reload dashboard after punch in:", reloadErr);
        }
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Failed to punch in.");
      } finally {
        setIsPunchingIn(false);
      }
    },
    [apiRequest, setNotice, setError, onReloadDashboardData]
  );

  const fetchLiveShiftSummary = useCallback(
    async (sessionId?: string) => {
      const url = sessionId
        ? `/api/staff/punch/live-summary?session_id=${sessionId}`
        : "/api/staff/punch/live-summary";
      return await apiRequest<import("../adminTypes").ShiftFinancialSummary>(url);
    },
    [apiRequest]
  );

  const handlePunchOut = useCallback(
    async (actualCashHandedOver?: number, notes?: string, closingNotes?: string) => {
      setIsPunchingOut(true);
      try {
        const payload: Record<string, any> = {};
        if (notes) payload.notes = notes;
        if (actualCashHandedOver !== undefined) payload.actual_cash_handed_over = actualCashHandedOver;
        if (closingNotes) payload.closing_notes = closingNotes;

        const res = await apiRequest<StaffPunchStatus>("/api/staff/punch/out", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setPunchStatus(res);
        setLiveShiftSeconds(0);
        setPunchOutModalOpen(false);
        setNotice("Shift ended & settled. Punched out successfully.");
        try {
          onReloadDashboardData?.();
        } catch (reloadErr) {
          console.warn("Failed to reload dashboard after punch out:", reloadErr);
        }
        // Immediately trigger PIN Quick-Switch lock screen for next cashier
        onOpenPinSwitch();
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Failed to punch out.");
      } finally {
        setIsPunchingOut(false);
      }
    },
    [apiRequest, setNotice, setError, onReloadDashboardData, onOpenPinSwitch]
  );

  return {
    punchStatus,
    isCheckingPunch,
    isPunchingIn,
    isPunchingOut,
    punchInModalOpen,
    setPunchInModalOpen,
    punchOutModalOpen,
    setPunchOutModalOpen,
    liveShiftSeconds,
    fetchPunchStatus,
    fetchLiveShiftSummary,
    handlePunchIn,
    handlePunchOut,
  };
}
