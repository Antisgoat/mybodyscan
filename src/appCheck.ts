import { initializeApp, getApp, getApps } from "firebase/app";
import { CustomProvider, initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { getViteEnv } from "@/lib/env";

let appCheckInstance: AppCheck | null = null;
let initPromise: Promise<AppCheck | null> | null = null;
let initComplete = false;

function isDevOrDemo() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname || "";
  return h.includes("localhost") || h.includes("127.0.0.1") || h.includes("lovable");
}

function getFirebaseConfig() {
  return {
    apiKey: getViteEnv("VITE_FIREBASE_API_KEY") ?? "",
    authDomain: getViteEnv("VITE_FIREBASE_AUTH_DOMAIN") ?? "",
    projectId: getViteEnv("VITE_FIREBASE_PROJECT_ID") ?? "",
    storageBucket: getViteEnv("VITE_FIREBASE_STORAGE_BUCKET") ?? "",
    messagingSenderId: getViteEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") ?? "",
    appId: getViteEnv("VITE_FIREBASE_APP_ID") ?? "",
    measurementId: getViteEnv("VITE_FIREBASE_MEASUREMENT_ID") ?? undefined,
  };
}

async function initializeAppCheckInstance(): Promise<AppCheck | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (appCheckInstance) {
    return appCheckInstance;
  }

  try {
    const config = getFirebaseConfig();
    const app = getApps().length ? getApp() : initializeApp(config);

    const siteKey =
      getViteEnv("VITE_RECAPTCHA_SITE_KEY") ??
      getViteEnv("VITE_RECAPTCHA_V3_KEY") ??
      "";
    
    let provider: CustomProvider | ReCaptchaV3Provider;
    let shouldRefresh = false;
    
    if (siteKey) {
      provider = new ReCaptchaV3Provider(siteKey);
      shouldRefresh = true;
    } else {
      if (typeof window !== "undefined") {
        (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      provider = new CustomProvider({
        getToken: async () => ({
          token: `debug-${Math.random().toString(36).slice(2)}.${Date.now()}`,
          expireTimeMillis: Date.now() + 60 * 60 * 1000,
        }),
      });
    }

    appCheckInstance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: shouldRefresh,
    });

    return appCheckInstance;
  } catch (error) {
    if (isDevOrDemo()) {
      console.warn("AppCheck initialization failed; continuing in soft mode", error);
      return null;
    }
    throw error;
  }
}

export async function ensureAppCheck(): Promise<AppCheck | null> {
  if (initComplete) {
    return appCheckInstance;
  }

  if (!initPromise) {
    initPromise = initializeAppCheckInstance();
  }

  try {
    const instance = await initPromise;
    initComplete = true;
    return instance;
  } catch (error) {
    if (isDevOrDemo()) {
      console.warn("AppCheck init failed; continuing in soft mode", error);
      initComplete = true;
      return null;
    }
    throw error;
  }
}

export async function getAppCheckToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === "undefined") return null;
  
  const appCheck = await ensureAppCheck();
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
  return appCheckInstance != null;
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

// Export the singleton instance getter
export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}
