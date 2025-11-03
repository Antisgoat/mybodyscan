import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { app } from "./firebase";

const SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY || "";

let appCheckInstance: AppCheck | null = null;
let appCheckInited = false;

export function hasAppCheck(): boolean {
  return Boolean(SITE_KEY);
}

export async function ensureAppCheck(forceRefresh = false): Promise<string | undefined> {
  try {
    if (!SITE_KEY) return undefined;
    if (!appCheckInited) {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckInited = true;
    }
    const { token } = await getToken(appCheckInstance ?? undefined, forceRefresh);
    return token;
  } catch {
    return undefined;
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  const token = await ensureAppCheck(forceRefresh);
  return token ? { "X-Firebase-AppCheck": token } : {};
}
