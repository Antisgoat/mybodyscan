import {
  ensureAppCheckInitialized,
  ensureClientInitialized,
  getCurrentAppCheck,
} from "@/lib/firebase";

let initPromise: Promise<import("firebase/app-check").AppCheck | null> | null = null;
let initComplete = false;

function isDevOrDemo() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname || "";
  return h.includes("localhost") || h.includes("127.0.0.1") || h.includes("lovable");
}

export async function ensureAppCheck() {
  if (typeof window === "undefined") {
    initComplete = true;
    return null;
  }

  const existing = getCurrentAppCheck();
  if (existing) {
    initComplete = true;
    return existing;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await ensureClientInitialized();
        const instance = await ensureAppCheckInitialized();
        return instance;
      } finally {
        initComplete = true;
      }
    })();
  }

  try {
    const instance = await initPromise;
    if (!instance) {
      initPromise = null;
    }
    return instance;
  } catch (error) {
    if (isDevOrDemo()) {
      console.warn("AppCheck init failed; continuing in soft mode", error);
      initPromise = null;
      return null;
    }
    throw error;
  }
}

export async function getAppCheckToken(forceRefresh = false) {
  if (typeof window === "undefined") return null;
  const { getToken } = await import("firebase/app-check");
  await ensureAppCheck();
  const appCheck = getCurrentAppCheck();
  if (!appCheck) return null;
  try {
    const res = await getToken(appCheck, forceRefresh);
    return res.token;
  } catch (error) {
    if (isDevOrDemo()) {
      console.warn("AppCheck token unavailable; soft mode", error);
      return null;
    }
    throw error;
  }
}

// Alias for clarity in startup
export const initAppCheck = ensureAppCheck;

export function isAppCheckActive(): boolean {
  return getCurrentAppCheck() != null;
}

export function isAppCheckReady(): boolean {
  return initComplete;
}

export async function waitForAppCheckReady(): Promise<void> {
  try {
    await ensureAppCheck();
  } catch (error) {
    if (!isDevOrDemo()) {
      throw error;
    }
  }
}
