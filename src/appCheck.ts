import { initializeApp, getApps, getApp } from "firebase/app";

let _appCheck: import("firebase/app-check").AppCheck | null = null;

function app() {
  return getApps().length
    ? getApp()
    : initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
}

export async function ensureAppCheck() {
  if (typeof window === "undefined") return null;
  if (_appCheck) return _appCheck;
  const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
  _appCheck = initializeAppCheck(app(), {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  return _appCheck;
}

export async function getAppCheckToken(forceRefresh = false) {
  if (typeof window === "undefined") return null;
  const { getToken } = await import("firebase/app-check");
  await ensureAppCheck();
  if (!_appCheck) return null;
  const res = await getToken(_appCheck, forceRefresh);
  return res.token;
}
