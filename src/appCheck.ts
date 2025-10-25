import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";

import { APPCHECK_SITE_KEY } from "./lib/flags";
import { firebaseReady, getFirebaseApp } from "./lib/firebase";

let initPromise: Promise<void> | null = null;
let instance: AppCheck | null = null;
let ready = false;
let lastError: unknown = null;

function resolveReady() {
  ready = true;
}

async function ensureInitInternal(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (typeof window === "undefined") {
      resolveReady();
      return;
    }

    if (!APPCHECK_SITE_KEY) {
      resolveReady();
      return;
    }

    await firebaseReady();
    try {
      instance = initializeAppCheck(getFirebaseApp(), {
        provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      lastError = error;
      throw error;
    } finally {
      resolveReady();
    }
  })();

  try {
    await initPromise;
  } catch (error) {
    // swallow so callers can inspect via getAppCheckError
  }
}

export async function ensureAppCheck() {
  await ensureInitInternal();
  return instance;
}

export async function getAppCheckToken(forceRefresh = false) {
  await ensureInitInternal();
  if (!instance) return null;
  try {
    const { token } = await getToken(instance, forceRefresh);
    return token;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[app-check] token fetch failed", error);
    }
    return null;
  }
}

export function initAppCheck(): Promise<void> {
  return ensureInitInternal();
}

export function isAppCheckActive(): boolean {
  return instance !== null;
}

export function isAppCheckReady(): boolean {
  return ready;
}

export async function waitForAppCheckReady(): Promise<void> {
  await ensureInitInternal();
}

export function getAppCheckInstance(): AppCheck | null {
  return instance;
}

export function getAppCheckError(): unknown {
  return lastError;
}
