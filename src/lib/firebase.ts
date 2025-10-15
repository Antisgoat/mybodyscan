import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
let appCheckInstance: AppCheck | null = null;

// Always initialize AppCheck BEFORE exporting any other service.
// Use a safe fallback provider when no site key is configured so demo works.
type AppCheckToken = { token: string; expireTimeMillis: number };
class NoopAppCheckProvider {
  getToken(): Promise<AppCheckToken> {
    return Promise.resolve({
      token: "NOOP",
      expireTimeMillis: Date.now() + 5 * 60 * 1000,
    });
  }
}

if (typeof window !== "undefined") {
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
      // In dev or soft mode this bypasses enforcement.
      // Remove or set to a real token if you later hard-enforce AppCheck.
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    } else if ("FIREBASE_APPCHECK_DEBUG_TOKEN" in self) {
      delete (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN;
    }

    const provider = siteKey
      ? new ReCaptchaV3Provider(siteKey)
      : (new NoopAppCheckProvider() as unknown as ReCaptchaV3Provider);

    appCheckInstance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // Never block the app if AppCheck can’t init
    console.warn("AppCheck init skipped:", err);
  }
}

// Now it is safe to create and export other services.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");
export const storage = getStorage(app);
export { app };
export const getAppCheckInstance = () => appCheckInstance;
