import { getAppCheckInstance, waitForAppCheck, isAppCheckAvailable } from "@/lib/firebase";
import { getToken, type AppCheck } from "firebase/app-check";

let initPromise: Promise<AppCheck | null> | null = null;
let initComplete = false;
let currentAppCheck: AppCheck | null = null;

function isDevOrDemo() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname || "";
  return h.includes("localhost") || h.includes("127.0.0.1") || h.includes("lovable");
}

function resolveAppCheckInstance(): AppCheck | null {
  if (currentAppCheck) {
    return currentAppCheck;
  }

  try {
    currentAppCheck = getAppCheckInstance();
    if (!currentAppCheck) {
      throw new Error("app-check/uninitialized");
    }
    return currentAppCheck;
  } catch (error) {
    if (isDevOrDemo()) {
      console.warn("AppCheck not yet available; continuing in soft mode", error);
      return null;
    }
    throw error;
  }
}

export async function ensureAppCheck() {
  if (typeof window === "undefined") {
    initComplete = true;
    return null;
  }

  // Wait for AppCheck to be initialized in firebase.ts
  await waitForAppCheck();
  
  const existing = resolveAppCheckInstance();
  if (existing) {
    initComplete = true;
    return existing;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const instance = resolveAppCheckInstance();
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
  await ensureAppCheck();
  const appCheck = resolveAppCheckInstance();
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
  return resolveAppCheckInstance() != null;
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
