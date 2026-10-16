"use client";

import { useEffect, useState, useCallback } from "react";
import {
  dq11Display,
  type DQ11Settings,
  type DQ11Status,
  type DQ11ProtocolMode,
} from "@/lib/dq11DisplayService";

export function useDQ11Display() {
  const [status, setStatus] = useState<DQ11Status>(() => dq11Display.getStatus());
  const [settings, setSettings] = useState<DQ11Settings>(() => dq11Display.getSettings());

  useEffect(() => {
    // Attempt auto-connect on mount if supported
    dq11Display.autoInit();

    // Subscribe to state updates
    const unsubscribe = dq11Display.subscribe(() => {
      setStatus(dq11Display.getStatus());
      setSettings(dq11Display.getSettings());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const pairAndConnect = useCallback(async () => {
    return await dq11Display.requestPair();
  }, []);

  const disconnect = useCallback(async () => {
    await dq11Display.disconnect();
  }, []);

  const updateSettings = useCallback((newSettings: Partial<DQ11Settings>) => {
    dq11Display.saveSettings(newSettings);
    setSettings(dq11Display.getSettings());
  }, []);

  const sendTestQr = useCallback(async (upiId?: string) => {
    return await dq11Display.sendTest(upiId);
  }, []);

  const resetToWelcome = useCallback(async (storeName?: string) => {
    return await dq11Display.sendWelcome(storeName);
  }, []);

  return {
    status,
    settings,
    pairAndConnect,
    disconnect,
    updateSettings,
    sendTestQr,
    resetToWelcome,
  };
}
