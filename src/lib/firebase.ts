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
import { FUNCTIONS_BASE, getViteString } from "@/lib/env";

let app: FirebaseApp;
let appCheckInstance: AppCheck | null = null;

// Initialize core Firebase app first
if (getApps().length) {
  app = getApp();
} else {
  const firebaseConfig = {
    apiKey: getViteString("VITE_FIREBASE_API_KEY"),
    authDomain: getViteString("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: getViteString("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: getViteString("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getViteString("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: getViteString("VITE_FIREBASE_APP_ID"),
    measurementId: getViteString("VITE_FIREBASE_MEASUREMENT_ID"),
  };
  app = initializeApp(firebaseConfig);
}

// IMPORTANT: App Check must be initialized BEFORE any Auth/Firestore/Functions instances are created.
// This ensures App Check tokens are attached from first network requests and avoids "use-before-activation" errors.
try {
  if (typeof window !== "undefined") {
    const siteKey = getViteString("VITE_RECAPTCHA_V3_KEY", "public-recaptcha-placeholder");
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
} catch (e) {
  console.warn("AppCheck skipped:", e);
}

// Only construct Auth AFTER App Check has been initialized (above)
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

// Construct Firestore/Functions/Storage after AppCheck to ensure requests carry tokens from first use
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
export const appCheck = appCheckInstance;
export const getAppCheckInstance = () => appCheckInstance;
