import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { FUNCTIONS_BASE } from "@/lib/env";

let app: FirebaseApp;
let appCheckInstance: AppCheck | null = null;

if (getApps().length) {
  app = getApp();
} else {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
  const start = typeof performance !== "undefined" ? performance.now() : 0;
  app = initializeApp(firebaseConfig);
  try {
    if (start && typeof performance !== "undefined") {
      const initMs = Math.round(performance.now() - start);
      console.log(`[perf] firebase init: ${initMs}ms`);
    }
  } catch {}
}

try {
  if (typeof window !== "undefined") {
    const siteKey = import.meta.env.VITE_RECAPTCHA_V3_KEY || "public-recaptcha-placeholder";
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
} catch (e) {
  console.warn("AppCheck skipped:", e);
}

const auth = (() => {
  let instance;
  try {
    instance = getAuth(app);
  } catch (error) {
    instance = initializeAuth(app, { persistence: browserLocalPersistence });
  }
  const a = instance;
  setPersistence(a, browserLocalPersistence).catch(() => {});
  return a;
})();

const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
if (FUNCTIONS_BASE) {
  try {
    (functions as any).customDomain = FUNCTIONS_BASE;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[firebase] unable to set functions custom domain", error);
    }
  }
}
const storage = getStorage(app);

export async function safeEmailSignIn(email: string, password: string) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    if (err?.code === "auth/network-request-failed") {
      await new Promise((r) => setTimeout(r, 1000));
      return await signInWithEmailAndPassword(auth, email, password);
    }
    throw err;
  }
}

export { app, auth, db, functions, storage };
export const getAppCheckInstance = () => appCheckInstance;
