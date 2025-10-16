import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
  type AppCheckProvider,
} from "firebase/app-check";
import { FUNCTIONS_BASE } from "@/lib/env";

// IMPORTANT: Use the real, merged config in env or fallback to hardcoded prod config.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDA90cwKTCQ9tGfUx66PDmfGwUoiTbhafE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mybodyscan-f3daf.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mybodyscan-f3daf",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mybodyscan-f3daf.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "157018993008",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-TV8M3PY1X3",
};

let firebaseApp: FirebaseApp | null = null;
let appCheckInstance: AppCheck | null = null;
let appCheckInitialized = false;

// Always initialize AppCheck BEFORE exporting any other service.
// Use a safe fallback provider when no site key is configured so demo works.
type AppCheckToken = { token: string; expireTimeMillis: number };

class SoftAppCheckProvider implements AppCheckProvider {
  getToken(): Promise<AppCheckToken> {
    return Promise.resolve({
      token: "NOOP",
      expireTimeMillis: Date.now() + 5 * 60 * 1000,
    });
  }
}

function ensureFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

function initAppCheck(): void {
  if (appCheckInitialized || typeof window === "undefined") {
    appCheckInitialized = true;
    return;
  }

  const app = ensureFirebaseApp();

  try {
    const siteKey =
      import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY ||
      import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
      "";

    const shouldEnableDebugToken = (() => {
      if (!siteKey) return true;
      if (import.meta.env.VITE_DEMO_MODE === "true") return true;
      if (import.meta.env.DEV) return true;
      const host = window.location?.hostname || "";
      return (
        host.includes("localhost") ||
        host.includes("127.0.0.1") ||
        host.includes("lovable")
      );
    })();

    if (shouldEnableDebugToken) {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    } else if ("FIREBASE_APPCHECK_DEBUG_TOKEN" in self) {
      delete (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN;
    }

    const provider: AppCheckProvider = siteKey
      ? new ReCaptchaV3Provider(siteKey)
      : new SoftAppCheckProvider();

    appCheckInstance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn("AppCheck init skipped:", err);
  } finally {
    appCheckInitialized = true;
  }
}

const app = ensureFirebaseApp();
initAppCheck();

// Now it is safe to create and export other services.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");
if (FUNCTIONS_BASE) {
  try {
    (functions as any).customDomain = FUNCTIONS_BASE;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[firebase] unable to set functions custom domain", error);
    }
  }
}
export const storage = getStorage(app);
export { app };
export const getAppCheckInstance = () => appCheckInstance;
