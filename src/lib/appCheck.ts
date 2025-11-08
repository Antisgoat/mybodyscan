// src/lib/appCheck.ts
import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { app } from "./firebase";

let instance: AppCheck | null = null;
let initialized = false;

export function hasAppCheck(): boolean {
  return Boolean(import.meta.env.VITE_APPCHECK_SITE_KEY);
}

export async function ensureAppCheck(): Promise<void> {
  if (initialized) return;
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
  // Soft mode: proceed without throwing if site key absent (server can be permissive during rollout)
  if (!siteKey) { initialized = true; return; }
  instance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  initialized = true;
}

export async function getAppCheckTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    if (!initialized) await ensureAppCheck();
    if (!instance) return {};
    const t = await getToken(instance, forceRefresh);
    return t?.token ? { "X-Firebase-AppCheck": t.token } : {};
  } catch {
    return {};
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  return getAppCheckTokenHeader(forceRefresh);
}
