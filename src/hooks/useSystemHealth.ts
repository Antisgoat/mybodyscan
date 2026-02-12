/**
 * Pipeline map — Feature gating:
 * - Fetches `/systemHealth` once (with caching) so Scan, Nutrition, and Workouts UIs know if backend services/keys exist.
 * - Exposes `refresh` for Settings diagnostics while keeping previous snapshot during retries.
 */
import { useCallback, useEffect, useState } from "react";

import { fetchJson, type BackendError } from "@/lib/backend/fetchJson";
import { getFunctionsOrigin } from "@/lib/backend/functionsOrigin";
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
  functionsOrigin: string;
  lastErrorStatus: number | null;
};

let cachedHealth: SystemHealthSnapshot | null = null;
let inflight: Promise<SystemHealthSnapshot | null> | null = null;

function safeFunctionsOrigin(): string {
  try {
    return getFunctionsOrigin();
  } catch {
    return "unresolved";
  }
}

async function loadSystemHealth(): Promise<SystemHealthSnapshot | null> {
  const [healthResult, reachableResult] = await Promise.allSettled([
    inflight ??
      fetchSystemHealth().catch((error) => {
        throw error instanceof Error ? error : new Error(String(error));
      }),
    fetchJson<{ ok?: boolean }>("/health", { method: "GET" }, 2500),
  ]);

  if (healthResult.status !== "fulfilled") {
    throw healthResult.reason;
  }

  const snapshot =
    healthResult.value && typeof healthResult.value === "object"
      ? (healthResult.value as SystemHealthSnapshot)
      : ({} as SystemHealthSnapshot);

  snapshot.functionsReachable =
    reachableResult.status === "fulfilled" && reachableResult.value?.ok === true;

  cachedHealth = snapshot;
  return snapshot;
}

export function useSystemHealth() {
  const [state, setState] = useState<HookState>(() => ({
    health: cachedHealth,
    loading: !cachedHealth,
    error: null,
    functionsOrigin: safeFunctionsOrigin(),
    lastErrorStatus: null,
  }));

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null, lastErrorStatus: null }));
      inflight = loadSystemHealth();
      const snapshot = await inflight;
      setState((prev) => ({
        ...prev,
        health: snapshot,
        loading: false,
        error: null,
        functionsOrigin: safeFunctionsOrigin(),
      }));
    } catch (error) {
      const typed = error as BackendError;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({
        ...prev,
        health: cachedHealth,
        loading: false,
        error: message,
        functionsOrigin: typed?.origin || safeFunctionsOrigin(),
        lastErrorStatus: typeof typed?.status === "number" ? typed.status : 0,
      }));
    } finally {
      inflight = null;
    }
  }, []);

  useEffect(() => {
    if (cachedHealth) {
      setState((prev) => ({ ...prev, health: cachedHealth, loading: false, error: null }));
      return;
    }

    let active = true;
    (async () => {
      try {
        inflight = loadSystemHealth();
        const snapshot = await inflight;
        if (!active) return;
        setState((prev) => ({
          ...prev,
          health: snapshot,
          loading: false,
          error: null,
          functionsOrigin: safeFunctionsOrigin(),
          lastErrorStatus: null,
        }));
      } catch (error) {
        if (!active) return;
        const typed = error as BackendError;
        const message = error instanceof Error ? error.message : String(error);
        setState((prev) => ({
          ...prev,
          health: null,
          loading: false,
          error: message,
          functionsOrigin: typed?.origin || safeFunctionsOrigin(),
          lastErrorStatus: typeof typed?.status === "number" ? typed.status : 0,
        }));
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
