import { app as firebaseApp } from "@/lib/firebase";

let _appCheck: import("firebase/app-check").AppCheck | null = null;
let initPromise: Promise<import("firebase/app-check").AppCheck | null> | null = null;
let initComplete = false;

const app = () => firebaseApp;

function isDevOrDemo() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname || "";
  return h.includes("localhost") || h.includes("127.0.0.1") || h.includes("lovable");
}

export async function ensureAppCheck() {
  if (typeof window === "undefined") {
    initComplete = true;
    return null;
  }
  if (_appCheck) {
    initComplete = true;
    return _appCheck;
  }
  if (!initPromise) {
    const siteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY as string | undefined;
    initPromise = (async () => {
      try {
        const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
        if (!siteKey) {
          if (isDevOrDemo()) {
            console.warn("AppCheck: site key missing; soft mode enabled (dev/demo)");
            return null;
          }
          console.warn("AppCheck: site key missing; initialization skipped");
          return null;
        }
        _appCheck = initializeAppCheck(app(), {
          provider: new ReCaptchaV3Provider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
        return _appCheck;
      } catch (error) {
        if (isDevOrDemo()) {
          console.warn("AppCheck init failed; continuing in soft mode", error);
          return null;
        }
        throw error;
      } finally {
        initComplete = true;
      }
    })();
  }
  try {
    return await initPromise;
  } catch (error) {
    if (isDevOrDemo()) {
      return null;
    }
    throw error;
  }
}

export async function getAppCheckToken(forceRefresh = false) {
  if (typeof window === "undefined") return null;
  const { getToken } = await import("firebase/app-check");
  await ensureAppCheck();
  if (!_appCheck) return null;
  try {
    const res = await getToken(_appCheck, forceRefresh);
    return res.token;
  } catch (error) {
    if (isDevOrDemo()) {
      console.warn("AppCheck token unavailable; soft mode", error);
      return null;
    }
    throw error;
  }
}

// Alias for clarity in startup
export const initAppCheck = ensureAppCheck;

export function isAppCheckActive(): boolean {
  return _appCheck != null;
}

export function isAppCheckReady(): boolean {
  return initComplete;
}

export async function waitForAppCheckReady(): Promise<void> {
  try {
    await ensureAppCheck();
  } catch (error) {
    if (!isDevOrDemo()) {
      throw error;
    }
  }
}
