/* Centralized, typed flags with safe defaults. No secrets required to run. */
import { useEffect, useSyncExternalStore } from "react";
import { doc, getDoc } from "firebase/firestore";

import { firebaseReady, getFirebaseFirestore } from "./firebase";
import { MBS_FLAGS as CONFIG_FLAGS } from "../mbs.config";

const env = (import.meta as any)?.env ?? {};

function bool(v: unknown, def = false): boolean {
  if (v == null) return def;
  const s = String(v).toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export const APPCHECK_SITE_KEY: string | undefined = env.VITE_APPCHECK_SITE_KEY || undefined;
export const DEMO_ENABLED: boolean = bool(env.VITE_DEMO_ENABLED, false);
export const SHOW_APPLE_WEB: boolean = bool(env.VITE_SHOW_APPLE ?? env.VITE_SHOW_APPLE_WEB, false);

export const USDA_API_KEY: string | undefined = env.VITE_USDA_API_KEY || undefined;
export const OFF_ENABLED: boolean = bool(env.VITE_OFF_ENABLED, true); // default ON for fallback

export const STRIPE_PUBLISHABLE_KEY: string | undefined =
  env.VITE_STRIPE_PK || env.VITE_STRIPE_PUBLISHABLE_KEY || undefined;

/* Platform/service-worker */
export const SW_ENABLED: boolean = bool(env.VITE_SW_ENABLED, false); // stays disabled by default

/* Marketing/public experience */
export const MBS_FLAGS = {
  ...CONFIG_FLAGS,
  ENABLE_PUBLIC_MARKETING_PAGE: bool(env.VITE_ENABLE_PUBLIC_MARKETING_PAGE, false),
} as const;

/* Scan polling defaults (safe, overridable later) */
export const SCAN_POLL_MIN_MS = 2000;
export const SCAN_POLL_MAX_MS = 4000;
export const SCAN_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export type RemoteFlagState = {
  flags: {
    enableApple: boolean;
    enableCoach: boolean;
    enableNutrition: boolean;
    enableDemo: boolean;
  };
  environment: {
    stripeMode: "test" | "live";
  };
  loaded: boolean;
};

const DEFAULT_FLAGS: RemoteFlagState = {
  flags: {
    enableApple: SHOW_APPLE_WEB,
    enableCoach: true,
    enableNutrition: true,
    enableDemo: DEMO_ENABLED,
  },
  environment: {
    stripeMode: inferStripeMode(),
  },
  loaded: false,
};

let cache: RemoteFlagState = { ...DEFAULT_FLAGS };
let fetchPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function inferStripeMode(): "test" | "live" {
  const key = STRIPE_PUBLISHABLE_KEY || "";
  if (key.startsWith("pk_live")) return "live";
  return "test";
}

function updateCache(partial: Partial<RemoteFlagState>) {
  const nextFlags = partial.flags ? { ...cache.flags, ...partial.flags } : cache.flags;
  const nextEnv = partial.environment ? { ...cache.environment, ...partial.environment } : cache.environment;
  cache = { ...cache, ...partial, flags: nextFlags, environment: nextEnv };
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("flags_listener_error", err);
    }
  }
}

async function fetchPublicConfig(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      await firebaseReady();
      const db = getFirebaseFirestore();
      const ref = doc(db, "app", "publicConfig");
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        updateCache({ loaded: true });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const remoteFlags = data?.flags && typeof data.flags === "object" ? (data.flags as Record<string, unknown>) : {};
      const remoteEnv = data?.environment && typeof data.environment === "object" ? (data.environment as Record<string, unknown>) : {};
      const stripeMode = remoteEnv?.stripeMode === "live" ? "live" : remoteEnv?.stripeMode === "test" ? "test" : inferStripeMode();
      updateCache({
        flags: {
          enableApple: remoteFlags.enableApple === true,
          enableCoach: remoteFlags.enableCoach !== false,
          enableNutrition: remoteFlags.enableNutrition !== false,
          enableDemo: remoteFlags.enableDemo === true,
        },
        environment: { stripeMode },
        loaded: true,
      });
    } catch (err) {
      console.warn("flags_fetch_failed", err);
      updateCache({ loaded: true });
    }
  })().finally(() => {
    fetchPromise = null;
  });
  await fetchPromise;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RemoteFlagState {
  return cache;
}

export function useFlags(): RemoteFlagState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!snapshot.loaded) {
      void fetchPublicConfig();
    }
  }, [snapshot.loaded]);
  return snapshot;
}

export function getCachedFlags(): RemoteFlagState {
  return cache;
}
