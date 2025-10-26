import { firebaseReady, getFirebaseApp } from "./firebase";
import { APPCHECK_SITE_KEY } from "./flags";
import type { AppCheck } from "firebase/app-check";

let appCheckInstance: AppCheck | null = null;
let warnedOnce = false;

function warnOnce(error: unknown): void {
  if (warnedOnce) return;
  warnedOnce = true;
  // eslint-disable-next-line no-console
  console.warn("[appcheck] failed:", error);
}

export function hasAppCheck(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(APPCHECK_SITE_KEY);
  } catch {
    return false;
  }
}

export async function ensureAppCheck(): Promise<void> {
  if (!hasAppCheck()) return;
  if (appCheckInstance) return;
  try {
    await firebaseReady();
    const app = getFirebaseApp();
    const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
    const siteKey = APPCHECK_SITE_KEY as string;
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    warnOnce(error);
    appCheckInstance = null;
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    if (!hasAppCheck()) return {};
    await ensureAppCheck();
    if (!appCheckInstance) return {};
    const { getToken } = await import("firebase/app-check");
    const tokenResult = await getToken(appCheckInstance, forceRefresh).catch((error) => {
      warnOnce(error);
      return null;
    });
    const token = tokenResult?.token;
    if (!token) return {};
    return { "X-Firebase-AppCheck": token };
  } catch (error) {
    warnOnce(error);
    return {};
  }
}
