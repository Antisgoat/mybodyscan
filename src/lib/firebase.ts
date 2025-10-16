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
import { FUNCTIONS_BASE, getFirebaseConfig, getRecaptchaKey, isAuthorizedDomain } from "@/lib/env";

// Initialize Firebase App
let app: FirebaseApp;
if (getApps().length) {
  app = getApp();
} else {
  const firebaseConfig = getFirebaseConfig();
  app = initializeApp(firebaseConfig);
}

// Initialize AppCheck BEFORE any other Firebase services
// This is critical to prevent "use-before-activation" errors
let appCheckInstance: AppCheck | null = null;
let appCheckPromise: Promise<AppCheck | null> | null = null;

function initializeAppCheckSafely(): Promise<AppCheck | null> {
  if (appCheckPromise) return appCheckPromise;
  
  appCheckPromise = (async () => {
    try {
      if (typeof window === "undefined") {
        return null;
      }
      
      const siteKey = getRecaptchaKey();
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      
      // Wait a tiny bit to ensure AppCheck is fully initialized
      await new Promise(resolve => setTimeout(resolve, 10));
      
      return appCheckInstance;
    } catch (e) {
      console.warn("AppCheck initialization failed:", e);
      return null;
    }
  })();
  
  return appCheckPromise;
}

// Initialize AppCheck immediately
initializeAppCheckSafely();

// Initialize Auth AFTER AppCheck is initialized
// This ensures proper ordering and prevents auth failures
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

// Initialize other Firebase services
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

// Enhanced safeEmailSignIn with proper retry logic
export async function safeEmailSignIn(email: string, password: string) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    if (err?.code === "auth/network-request-failed") {
      console.warn("[auth] Network request failed, retrying after 1s...");
      await new Promise((r) => setTimeout(r, 1000));
      return await signInWithEmailAndPassword(auth, email, password);
    }
    throw err;
  }
}

// Wait for AppCheck to be ready before making any Firebase calls
export async function waitForAppCheck(): Promise<void> {
  await initializeAppCheckSafely();
}

// Check if AppCheck is available
export function isAppCheckAvailable(): boolean {
  return appCheckInstance !== null;
}

// Get AppCheck instance
export const getAppCheckInstance = () => appCheckInstance;

// Check if current domain is authorized
export function checkAuthorizedDomain(): void {
  if (!isAuthorizedDomain()) {
    console.warn(`[firebase] Current domain ${window.location.hostname} may not be authorized for Firebase Auth`);
  }
}

export { app, auth, db, functions, storage };
