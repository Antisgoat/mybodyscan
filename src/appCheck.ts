import { getApps, initializeApp, type FirebaseApp } from "firebase/app";

// IMPORTANT: only import app-check in the browser to avoid bundler/runtime issues.
let _appInstance: FirebaseApp | null = null;
let _appCheckInstance: import("firebase/app-check").AppCheck | null = null;

function ensureApp(): FirebaseApp {
  if (_appInstance) return _appInstance;
  const apps = getApps();
  if (apps.length) {
    _appInstance = apps[0]!;
    return _appInstance;
  }

  _appInstance = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });

  return _appInstance;
}

export async function ensureAppCheck() {
  if (typeof window === "undefined") return null;
  if (_appCheckInstance) return _appCheckInstance;

  const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");

  const app = ensureApp();

  _appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });

  return _appCheckInstance;
}

// Optional helper if any code needs a fresh token on demand
export async function getAppCheckToken(forceRefresh = false) {
  if (typeof window === "undefined") return null;
  await ensureAppCheck();
  const { getToken } = await import("firebase/app-check");
  if (!_appCheckInstance) return null;
  const res = await getToken(_appCheckInstance, forceRefresh);
  return res.token;
}
