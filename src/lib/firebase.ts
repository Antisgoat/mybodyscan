import { initializeApp, type FirebaseOptions, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { FIREBASE_PUBLIC_CONFIG } from "@/config/firebase.public";
import { getSequencedAuth } from "@/lib/firebase/init";
import type { Auth } from "firebase/auth";

/**
 * Prefer Vite env vars when present; otherwise fall back to committed public config.
 * This allows Lovable preview to run without an Environment UI.
 */
function env(name: string): string | undefined {
  return (import.meta as any)?.env?.[name];
}

function mergedConfig(): FirebaseOptions {
  const envConfig = {
    apiKey: env("VITE_FIREBASE_API_KEY"),
    authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: env("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("VITE_FIREBASE_APP_ID"),
    measurementId: env("VITE_FIREBASE_MEASUREMENT_ID"),
  };

  // If apiKey (required) is missing, use the committed public config.
  if (!envConfig.apiKey) return FIREBASE_PUBLIC_CONFIG;

  const cfg: FirebaseOptions = {
    apiKey: envConfig.apiKey!,
    authDomain: envConfig.authDomain!,
    projectId: envConfig.projectId!,
    storageBucket: envConfig.storageBucket!,
    messagingSenderId: envConfig.messagingSenderId!,
    appId: envConfig.appId!,
  };
  if (envConfig.measurementId) cfg.measurementId = envConfig.measurementId;
  return cfg;
}

export const firebaseConfig = mergedConfig();

// Guard against double-initialization in dev/HMR and multiple entrypoints
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

let authInstance: Auth | null = null;
let authInitStarted = false;
let authInitError: unknown = null;

function ensureAuthInit() {
  if (authInitStarted) return;
  authInitStarted = true;
  void getSequencedAuth()
    .then((instance) => {
      authInstance = instance;
    })
    .catch((err) => {
      authInitError = err;
    });
}

ensureAuthInit();

export const auth = new Proxy({} as Auth, {
  get(_target, prop) {
    ensureAuthInit();
    if (authInitError) {
      throw authInitError instanceof Error
        ? authInitError
        : new Error(typeof authInitError === "string" ? authInitError : "Auth init failed");
    }
    if (!authInstance) {
      if (prop === "currentUser") return null;
      return undefined;
    }
    const value = (authInstance as any)[prop];
    if (typeof value === "function") {
      return value.bind(authInstance);
    }
    return value;
  },
  set(_target, prop, value) {
    ensureAuthInit();
    if (!authInstance) {
      throw new Error("Auth not ready");
    }
    (authInstance as any)[prop] = value;
    return true;
  },
}) as Auth;

export { getSequencedAuth };

// Re-export App Check status flag for convenience
export { isAppCheckActive } from "@/appCheck";
