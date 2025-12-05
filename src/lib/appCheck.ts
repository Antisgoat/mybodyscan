import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { firebaseApp } from "@/lib/firebase";

const siteKeyRaw =
  (import.meta as any).env?.VITE_APPCHECK_SITE_KEY || (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || "";
const siteKey = siteKeyRaw === "__DISABLE__" ? "" : siteKeyRaw;
const debug = (import.meta as any).env?.VITE_APPCHECK_DEBUG_TOKEN || "";
let warned = false;
let recaptchaWarned = false;
if (debug && typeof self !== "undefined") {
  // @ts-expect-error -- Firebase debug token is a global escape hatch for App Check
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debug;
}

let instance: AppCheck | null = null;
let initialized = false;

function init(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (instance) return instance;
  if (initialized) return instance;
  if (!siteKey) {
    if (!warned) {
      console.warn("[AppCheck] site key not set, running without AppCheck");
      warned = true;
    }
    initialized = true;
    return null;
  }
  if (!firebaseApp) {
    if (!warned) {
      console.warn("[AppCheck] Firebase app unavailable, skipping App Check init");
      warned = true;
    }
    initialized = true;
    return null;
  }
  initialized = true;
  try {
    instance = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    if (!warned) {
      console.warn("[AppCheck] init_failed_soft", error);
      warned = true;
    }
    instance = null;
  }
  return instance;
}

export const appCheck = init();

export function hasAppCheck(): boolean {
  return Boolean(siteKey);
}

export async function ensureAppCheck(): Promise<void> {
  init();
}

export async function getAppCheckTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const inst = init();
    if (!inst) return {};
    const { token } = await getToken(inst, forceRefresh);
    return token ? { "X-Firebase-AppCheck": token } : {};
  } catch (error: any) {
    const code = (error as any)?.code || (error as any)?.message;
    if (code === "appCheck/recaptcha-error" || code === "appcheck/recaptcha-error") {
      if (!recaptchaWarned) {
        console.warn("appcheck_recaptcha_error_soft", error);
        recaptchaWarned = true;
      }
      return {};
    }
    return {};
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  return getAppCheckTokenHeader(forceRefresh);
}
