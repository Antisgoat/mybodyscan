import { ensureAppCheck as ensureFirebaseAppCheck, getAppCheckTokenSafe } from "./firebase";

const SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "";

export function hasAppCheck(): boolean {
  return Boolean(SITE_KEY);
}

export async function ensureAppCheck(forceRefresh = false): Promise<string | undefined> {
  ensureFirebaseAppCheck();
  return getAppCheckTokenSafe(forceRefresh);
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  const token = await getAppCheckTokenSafe(forceRefresh);
  return token ? { "X-Firebase-AppCheck": token } : {};
}
