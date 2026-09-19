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

  // Live timer tick every 1 second when punched in
  useEffect(() => {
    if (isAdminRole || !punchStatus?.is_punched_in) {
      return;
    }

    const interval = setInterval(() => {
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
  }, [isAdminRole, punchStatus?.is_punched_in]);

  const fetchPunchStatus = useCallback(async () => {
    if (!accessToken) return;

    if (isAdminRole) {
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
  }, [accessToken, isAdminRole, apiRequest]);

  // Initial check on token/role changes
  useEffect(() => {
    if (accessToken) {
      void fetchPunchStatus();
    } else {
      setPunchStatus(null);
      setPunchInModalOpen(false);
    }
  }, [accessToken, userRole, isAdminRole, fetchPunchStatus]);

  const handlePunchIn = useCallback(async () => {
    setIsPunchingIn(true);
    try {
      const res = await apiRequest<StaffPunchStatus>("/api/staff/punch/in", {
        method: "POST",
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
  }, [apiRequest, setNotice, setError, onReloadDashboardData]);

  const handlePunchOut = useCallback(
    async (notes?: string) => {
      setIsPunchingOut(true);
      try {
        const res = await apiRequest<StaffPunchStatus>("/api/staff/punch/out", {
          method: "POST",
          body: JSON.stringify(notes ? { notes } : {}),
        });
        setPunchStatus(res);
        setLiveShiftSeconds(0);
        setPunchOutModalOpen(false);
        setNotice("Shift ended. Punched out successfully.");
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
    handlePunchIn,
    handlePunchOut,
  };
}
