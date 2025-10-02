import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from "firebase/app-check";
import { app } from "@/lib/firebase";

let appCheckInstance: AppCheck | null = null;
let initAttempted = false;
let warnedMissing = false;

function siteKey(): string | undefined {
  const value = (import.meta as any)?.env?.VITE_APPCHECK_SITE_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ensureDebugToken() {
  if (typeof window === "undefined") return;
  const debug = (import.meta as any)?.env?.VITE_APPCHECK_DEBUG_TOKEN;
  if (debug) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debug;
  } else if ((import.meta as any)?.env?.DEV) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

function init(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheckInstance) return appCheckInstance;
  if (initAttempted) return appCheckInstance;
  initAttempted = true;

  const key = siteKey();
  if (!key) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn("[AppCheck] VITE_APPCHECK_SITE_KEY missing; protected endpoints will reject requests.");
    }
    return null;
  }

  ensureDebugToken();

  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(key),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error("[AppCheck] initialization failed", err);
    appCheckInstance = null;
  }
  return appCheckInstance;
}

export function ensureAppCheckInitialized(): void {
  init();
}

export async function fetchAppCheckToken(forceRefresh = false): Promise<string | null> {
  const instance = init();
  if (!instance) return null;
  try {
    const { token } = await getToken(instance, forceRefresh);
    return token;
  } catch (err) {
    console.error("[AppCheck] token retrieval failed", err);
    return null;
  }
}
