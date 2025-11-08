import { initializeAppCheck, getToken, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { app } from "./firebase";

let appCheckInstance: AppCheck | null = null;
let initialized = false;

export function hasAppCheck(): boolean {
  return Boolean(import.meta.env.VITE_APPCHECK_SITE_KEY);
}

export async function ensureAppCheck(): Promise<void> {
  if (initialized) return;
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
  if (!siteKey) {
    initialized = true;
    return;
  }
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
}

export async function getAppCheckTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    if (!appCheckInstance) await ensureAppCheck();
    if (!appCheckInstance) return {};
    const token = await getToken(appCheckInstance, forceRefresh);
    if (token?.token) {
      return { "X-Firebase-AppCheck": token.token };
    }
  } catch {}
  return {};
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  return getAppCheckTokenHeader(forceRefresh);
}
