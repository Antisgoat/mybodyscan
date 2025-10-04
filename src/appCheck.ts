import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { app } from "@/lib/firebase";

function siteKey(): string | undefined {
  const value =
    (import.meta as any)?.env?.VITE_RECAPTCHA_V3_SITE_KEY ??
    (import.meta as any)?.env?.VITE_APPCHECK_SITE_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ensureDebugToken() {
  if (typeof window === "undefined") return;
  const debug = (import.meta as any)?.env?.VITE_APPCHECK_DEBUG_TOKEN;
  if (debug) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debug;
  } else if ((import.meta as any)?.env?.DEV) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
}

const key = siteKey();

if (key) {
  ensureDebugToken();
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(key),
    isTokenAutoRefreshEnabled: true,
  });
} else {
  console.warn("[AppCheck] site key missing; App Check is disabled.");
}
