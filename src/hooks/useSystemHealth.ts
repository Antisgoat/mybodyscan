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
      const message = error instanceof Error ? error.message : String(error);
      setState({ health: cachedHealth, loading: false, error: message });
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
        const message = error instanceof Error ? error.message : String(error);
        setState({ health: null, loading: false, error: message });
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
