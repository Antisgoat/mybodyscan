import { getToken, type AppCheck } from "firebase/app-check";
import { getAppCheckInstance, initFirebaseApp, isFirebaseAppCheckReady } from "@/lib/firebase";

function isDevOrDemo() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname || "";
  return h.includes("localhost") || h.includes("127.0.0.1") || h.includes("lovable");
}

export async function ensureAppCheck(): Promise<AppCheck | null> {
  if (typeof window === "undefined") {
    return null;
  }

  await initFirebaseApp();
  const instance = getAppCheckInstance();

  if (!instance) {
    if (isDevOrDemo()) {
      console.warn("AppCheck not yet available; continuing in soft mode");
      return null;
    }
    throw new Error("app-check/uninitialized");
  }

  return instance;
}

export async function getAppCheckToken(forceRefresh = false) {
  if (typeof window === "undefined") return null;
  try {
    const appCheck = await ensureAppCheck();
    if (!appCheck) return null;
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

export const initAppCheck = ensureAppCheck;

export function isAppCheckActive(): boolean {
  return getAppCheckInstance() != null;
}

export function isAppCheckReady(): boolean {
  return isFirebaseAppCheckReady();
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
