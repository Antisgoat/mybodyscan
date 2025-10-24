import { getApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";

import { isWeb } from "./lib/platform";

let initPromise: Promise<void> | null = null;
let initComplete = false;
let appCheckInstance: AppCheck | null = null;

function ensureInitPromise(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const siteKey = (import.meta as any)?.env?.VITE_APPCHECK_SITE_KEY as string | undefined;
        if (isWeb && siteKey) {
          const app = getApp();
          appCheckInstance = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true,
          });
        }
      } catch (e) {
        console.warn("[boot] AppCheck init failed:", e);
      } finally {
        initComplete = true;
      }
    })();
  }

  return initPromise!;
}

export async function ensureAppCheck() {
  await ensureInitPromise();
  return appCheckInstance;
}

export async function getAppCheckToken(forceRefresh = false) {
  await ensureInitPromise();
  if (!appCheckInstance) return null;
  try {
    const { token } = await getToken(appCheckInstance, forceRefresh);
    return token;
  } catch (e) {
    console.warn("[boot] AppCheck token fetch failed:", e);
    return null;
  }
}

export const initAppCheck = ensureAppCheck;

export function isAppCheckActive(): boolean {
  return appCheckInstance !== null;
}

export function isAppCheckReady(): boolean {
  return initComplete;
}

export async function waitForAppCheckReady(): Promise<void> {
  await ensureInitPromise();
}
