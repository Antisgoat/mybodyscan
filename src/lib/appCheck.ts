import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { app } from "@/lib/firebase";

const siteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || (import.meta as any).env?.VITE_APPCHECK_SITE_KEY || "";
const debugToken = (import.meta as any).env?.VITE_APPCHECK_DEBUG_TOKEN || "";

if (typeof self !== "undefined" && debugToken) {
  // @ts-ignore debug token assignment
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
}

let instance: AppCheck | null = null;
let initialized = false;

function initAppCheck(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (instance) return instance;
  if (initialized) return instance;
  initialized = true;

  if (!siteKey && !debugToken) {
    return null;
  }

  const key = siteKey || "unused-key";
  instance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(key),
    isTokenAutoRefreshEnabled: true,
  });
  return instance;
}

export const appCheck = initAppCheck();

export function hasAppCheck(): boolean {
  return Boolean(siteKey || debugToken);
}

export async function ensureAppCheck(): Promise<void> {
  initAppCheck();
}

export async function getAppCheckTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const inst = initAppCheck();
    if (!inst) return {};
    const { token } = await getToken(inst, forceRefresh);
    return token ? { "X-Firebase-AppCheck": token } : {};
  } catch {
    return {};
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  return getAppCheckTokenHeader(forceRefresh);
}
