import { appCheckReady } from "./lib/firebase/init";

let initComplete = false;

export async function ensureAppCheck() {
  if (!initComplete) {
    initComplete = true;
  }
  await appCheckReady;
  return null;
}

export async function getAppCheckToken(_forceRefresh = false) {
  await appCheckReady;
  return null;
}

// Alias for clarity in startup
export const initAppCheck = ensureAppCheck;

export function isAppCheckActive(): boolean {
  return false;
}

export function isAppCheckReady(): boolean {
  return initComplete;
}

export async function waitForAppCheckReady(): Promise<void> {
  await ensureAppCheck();
}
