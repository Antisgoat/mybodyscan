import { useCallback, useEffect, useState } from "react";

import { fetchSystemHealth } from "@/lib/system";

export interface SystemHealthSnapshot {
  openaiKeyPresent?: boolean;
  openaiConfigured?: boolean;
  stripeSecretPresent?: boolean;
  usdaKeyPresent?: boolean;
  nutritionConfigured?: boolean;
  coachRpmPresent?: boolean;
  nutritionRpmPresent?: boolean;
  [key: string]: unknown;
}

type HookState = {
  health: SystemHealthSnapshot | null;
  loading: boolean;
  error: string | null;
};

let cachedHealth: SystemHealthSnapshot | null = null;
let inflight: Promise<SystemHealthSnapshot | null> | null = null;

async function loadSystemHealth(): Promise<SystemHealthSnapshot | null> {
  inflight = inflight ?? fetchSystemHealth().catch((error) => {
    throw error instanceof Error ? error : new Error(String(error));
  });
  try {
    const snapshot = await inflight;
    cachedHealth = snapshot;
    return snapshot;
  } finally {
    inflight = null;
  }
}

export function useSystemHealth() {
  const [state, setState] = useState<HookState>(() => ({
    health: cachedHealth,
    loading: !cachedHealth,
    error: null,
  }));

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const snapshot = await loadSystemHealth();
      setState({ health: snapshot, loading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState({ health: cachedHealth, loading: false, error: message });
    }
  }, []);

  useEffect(() => {
    if (cachedHealth) {
      setState({ health: cachedHealth, loading: false, error: null });
      return;
    }

    let active = true;
    (async () => {
      try {
        const snapshot = await loadSystemHealth();
        if (!active) return;
        setState({ health: snapshot, loading: false, error: null });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setState({ health: null, loading: false, error: message });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { ...state, refresh };
}
