import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { app } from "@/lib/firebase";

const siteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || "";
const debug = (import.meta as any).env?.VITE_APPCHECK_DEBUG_TOKEN || "";
if (debug && typeof self !== "undefined") {
  // @ts-ignore allow debug override
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debug;
}

let instance: AppCheck | null = null;
let initialized = false;

function init(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (instance) return instance;
  if (initialized) return instance;
  initialized = true;
  instance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey || "unused"),
    isTokenAutoRefreshEnabled: true,
  });
  return instance;
}

export const appCheck = init();

export function hasAppCheck(): boolean {
  return Boolean(siteKey || debug);
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
  } catch {
    return {};
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  return getAppCheckTokenHeader(forceRefresh);
}
