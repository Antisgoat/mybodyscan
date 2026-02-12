/**
 * Pipeline map — Feature gating:
 * - Fetches `/systemHealth` once (with caching) so Scan, Nutrition, and Workouts UIs know if backend services/keys exist.
 * - Exposes `refresh` for Settings diagnostics while keeping previous snapshot during retries.
 */
import { useCallback, useEffect, useState } from "react";

import {
  functionsReachable,
  getFunctionsOrigin,
} from "@/lib/config/functionsOrigin";
import { fetchSystemHealth } from "@/lib/system";

export interface SystemHealthSnapshot {
  openaiKeyPresent?: boolean;
  openaiConfigured?: boolean;
  stripeSecretPresent?: boolean;
  usdaKeyPresent?: boolean;
  nutritionConfigured?: boolean;
  coachRpmPresent?: boolean;
  nutritionRpmPresent?: boolean;
  scanConfigured?: boolean;
  scanServicesHealthy?: boolean;
  coachConfigured?: boolean;
  workoutsConfigured?: boolean;
  workoutAdjustConfigured?: boolean;
  scanEngineConfigured?: boolean;
  scanEngineMissing?: string[];
  storageBucket?: string | null;
  storageBucketSource?: string | null;
  functionsReachable?: boolean;
  [key: string]: unknown;
}

type HookState = {
  health: SystemHealthSnapshot | null;
  loading: boolean;
  error: string | null;
};

let cachedHealth: SystemHealthSnapshot | null = null;
let inflight: Promise<SystemHealthSnapshot | null> | null = null;


function classifyHealthError(error: unknown): string {
  const typed = error as Error & { status?: number; message?: string };
  const message = String(typed?.message || error || "unknown_error");
  const { origin, source } = getFunctionsOrigin();
  if (!origin) {
    return "Cloud Functions origin is missing. Set VITE_FUNCTIONS_ORIGIN or runtime config window.__MBS_RUNTIME_CONFIG__."
  }
  if (typed?.status === 0 || /failed to fetch|networkerror|load failed/i.test(message)) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return `Network offline. Could not reach Cloud Functions (${origin}).`;
    }
    return `Cloud Functions request blocked or unreachable (${origin}). Check CORS for capacitor://localhost and network access.`;
  }
  if (typed?.status === 401 || typed?.status === 403) {
    return `Cloud Functions rejected request (HTTP ${typed.status}). Check App Check/Auth headers.`;
  }
  if (typed?.status === 404) {
    return `Cloud Functions endpoint not found at ${origin} (source=${source}).`;
  }
  return message;
}


async function loadSystemHealth(): Promise<SystemHealthSnapshot | null> {
  const { origin, projectId } = getFunctionsOrigin();
  const [healthResult, reachableResult] = await Promise.allSettled([
    inflight ??
      fetchSystemHealth().catch((error) => {
        throw error instanceof Error ? error : new Error(String(error));
      }),
    functionsReachable(),
  ]);

  if (import.meta.env.DEV) {
    console.info("[systemHealth] functions target", {
      origin,
      projectId,
      reachable:
        reachableResult.status === "fulfilled" ? reachableResult.value : false,
    });
  }

  if (healthResult.status !== "fulfilled") {
    throw healthResult.reason;
  }

  const snapshot =
    healthResult.value && typeof healthResult.value === "object"
      ? (healthResult.value as SystemHealthSnapshot)
      : ({} as SystemHealthSnapshot);

  snapshot.functionsReachable =
    reachableResult.status === "fulfilled" ? reachableResult.value : false;

  cachedHealth = snapshot;
  return snapshot;
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
      inflight = loadSystemHealth();
      const snapshot = await inflight;
      setState({ health: snapshot, loading: false, error: null });
    } catch (error) {
      const message = classifyHealthError(error);
      setState({ health: cachedHealth, loading: false, error: message });
      if (typeof window !== "undefined") (window as any).__MBS_LAST_ERROR__ = message;
    } finally {
      inflight = null;
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
        inflight = loadSystemHealth();
        const snapshot = await inflight;
        if (!active) return;
        setState({ health: snapshot, loading: false, error: null });
      } catch (error) {
        if (!active) return;
        const message = classifyHealthError(error);
        setState({ health: null, loading: false, error: message });
        if (typeof window !== "undefined") (window as any).__MBS_LAST_ERROR__ = message;
      } finally {
        inflight = null;
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return { ...state, refresh };
}
