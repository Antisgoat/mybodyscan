// Firebase initialization - single source of truth
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFunctions } from "firebase/functions";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import { assertEnv } from "./envGuard";

assertEnv();

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

export const firebaseConfig = cfg;

// Initialize Firebase only once
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

let warned = false;
const appCheckKey = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined;
if (typeof window !== "undefined") {
  if (appCheckKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (!warned) {
    warned = true;
    console.warn("App Check site key missing; requests are not protected. See README to enable.");
  }
}

// Safe analytics init (non-blocking)
export async function initAnalytics() {
  try {
    if (!cfg.measurementId) return;
    if (typeof window === "undefined") return;
    const isHttps = location.protocol === "https:" || location.hostname === "localhost";
    if (!isHttps) return;
    if (!(await analyticsSupported())) return;
    getAnalytics(app);
  } catch {
    // swallow; analytics must never crash boot
  }
}
