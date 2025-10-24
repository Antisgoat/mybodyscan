import { getToken } from "firebase/app-check";

import {
  ensureAppCheckInit,
  getAppCheckInstance,
  isAppCheckActive as isAppCheckActiveInternal,
  isAppCheckReady as isAppCheckReadyInternal,
  waitForAppCheckReady as waitForAppCheckReadyInternal,
} from "./lib/firebase";

let initPromise: Promise<void> | null = null;

function ensureInitPromise(): Promise<void> {
  if (!initPromise) {
    ensureAppCheckInit();
    initPromise = waitForAppCheckReadyInternal().catch(() => {
      // Swallow readiness errors; App Check remains optional.
    });
  }
  return initPromise;
}

export async function ensureAppCheck() {
  await ensureInitPromise();
  return getAppCheckInstance();
}

export async function getAppCheckToken(forceRefresh = false) {
  await ensureInitPromise();
  const instance = getAppCheckInstance();
  if (!instance) return null;
  try {
    const { token } = await getToken(instance, forceRefresh);
    return token;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[boot] AppCheck token fetch failed:", error);
    return null;
  }
}

export function initAppCheck(): Promise<void> {
  return ensureInitPromise();
}

export function isAppCheckActive(): boolean {
  return isAppCheckActiveInternal();
}

export function isAppCheckReady(): boolean {
  return isAppCheckReadyInternal();
}

export async function waitForAppCheckReady(): Promise<void> {
  await ensureInitPromise();
}
