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
  serviceError: string | null;
  functionsOrigin: string;
  lastErrorStatus: number | null;
  lastHealthStatus: number | null;
  lastRequestId: string | null;
};

let cachedHealth: SystemHealthSnapshot | null = null;
type SystemHealthLoad = { snapshot: SystemHealthSnapshot | null; serviceError: string | null; requestId: string | null };

let inflight: Promise<SystemHealthLoad> | null = null;

function safeFunctionsOrigin(): string {
  try {
    return getFunctionsOrigin();
  } catch {
    return "unresolved";
  }
}

async function loadSystemHealth(): Promise<SystemHealthLoad> {
  const healthCheck = await fetchJson<{ ok?: boolean }>("/health", { method: "GET" }, 2500);
  if (!healthCheck?.ok) {
    throw new Error("health_check_failed");
  }

  try {
    const system = await (
      inflight ??
      fetchSystemHealth().catch((error) => {
        throw error instanceof Error ? error : new Error(String(error));
      })
    );
    const snapshot =
      system && typeof system === "object"
        ? (system as SystemHealthSnapshot)
        : ({} as SystemHealthSnapshot);
    snapshot.functionsReachable = true;
    cachedHealth = snapshot;
    return { snapshot, serviceError: null, requestId: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const anyError = error as BackendError;
    const payload = anyError?.payload as Record<string, unknown> | undefined;
    const requestId =
      typeof payload?.debugId === "string"
        ? payload.debugId
        : typeof payload?.ref === "string"
          ? payload.ref
          : null;
    const fallback = cachedHealth ?? { functionsReachable: true };
    const snapshot = { ...fallback, functionsReachable: true } as SystemHealthSnapshot;
    cachedHealth = snapshot;
    return { snapshot, serviceError: message, requestId };
  }
}

export function useSystemHealth() {
  const [state, setState] = useState<HookState>(() => ({
    health: cachedHealth,
    loading: !cachedHealth,
    error: null,
    serviceError: null,
    functionsOrigin: safeFunctionsOrigin(),
    lastErrorStatus: null,
    lastHealthStatus: null,
    lastRequestId: null,
  }));

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null, serviceError: null, lastErrorStatus: null }));
      inflight = loadSystemHealth();
      const { snapshot, serviceError, requestId } = await inflight;
      setState((prev) => ({
        ...prev,
        health: snapshot,
        loading: false,
        error: null,
        serviceError,
        functionsOrigin: safeFunctionsOrigin(),
        lastHealthStatus: 200,
        lastRequestId: requestId,
      }));
    } catch (error) {
      const typed = error as BackendError;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({
        ...prev,
        health: cachedHealth,
        loading: false,
        error: message,
        serviceError: null,
        functionsOrigin: typed?.origin || safeFunctionsOrigin(),
        lastErrorStatus: typeof typed?.status === "number" ? typed.status : 0,
        lastHealthStatus: typeof typed?.status === "number" ? typed.status : 0,
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
        const { snapshot, serviceError, requestId } = await inflight;
        if (!active) return;
        setState((prev) => ({
          ...prev,
          health: snapshot,
          loading: false,
          error: null,
          serviceError,
          functionsOrigin: safeFunctionsOrigin(),
          lastErrorStatus: null,
          lastHealthStatus: 200,
          lastRequestId: requestId,
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
          serviceError: null,
          functionsOrigin: typed?.origin || safeFunctionsOrigin(),
          lastErrorStatus: typeof typed?.status === "number" ? typed.status : 0,
          lastHealthStatus: typeof typed?.status === "number" ? typed.status : 0,
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
