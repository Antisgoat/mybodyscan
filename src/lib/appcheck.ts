import { ensureAppCheck as ensureFirebaseAppCheck, getAppCheckHeader as getHeader } from "./firebase";

const SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "";

export function hasAppCheck(): boolean {
  return Boolean(SITE_KEY);
}

export async function ensureAppCheck(forceRefresh = false): Promise<string | undefined> {
  const instance = ensureFirebaseAppCheck();
  if (!instance) return undefined;
  const header = await getHeader(forceRefresh);
  return header["X-Firebase-AppCheck"];
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  const header = await getHeader(forceRefresh);
  return header;
}
