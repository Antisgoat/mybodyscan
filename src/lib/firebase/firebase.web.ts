import { env } from "@/env";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import {
  firebaseApiKey,
  firebaseConfigMissingKeys,
  firebaseConfigWarningKeys,
  getBlockingFirebaseConfigError,
  getFirebaseConfig,
  getFirebaseInitError,
  hasFirebaseConfig,
  logFirebaseConfigSummary,
  logFirebaseRuntimeInfo,
} from "./config";
import { app, auth, db } from "./client";

export { auth };

export const firebaseApp = app;

export { app, db };

const functionsRegion = env.VITE_FIREBASE_REGION ?? "us-central1";
export const functions: Functions = getFunctions(app, functionsRegion);
export const storage: FirebaseStorage = getStorage(app);

// iPhone Safari resilience: prevent endless internal retries that look like a stall.
try {
  (storage as any).maxUploadRetryTime = 120_000;
  (storage as any).maxOperationRetryTime = 120_000;
} catch {
  // ignore (older SDKs / non-browser environments)
}

let analyticsInstance: Analytics | null = null;

export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analyticsInstance) return analyticsInstance;
  const supported = await isSupported();
  if (!supported) return null;
  analyticsInstance = getAnalytics(app);
  return analyticsInstance;
}

export async function firebaseReady(): Promise<void> {
  return;
}

export function getFirebaseApp() {
  return app;
}

export function getFirebaseFirestore() {
  return db;
}

export function getFirebaseFunctions() {
  return functions;
}

export function getFirebaseStorage() {
  return storage;
}

export { getFirebaseConfig };

export { firebaseApiKey };

export { logFirebaseConfigSummary, logFirebaseRuntimeInfo };

export {
  firebaseConfigMissingKeys,
  firebaseConfigWarningKeys,
  hasFirebaseConfig,
  getFirebaseInitError,
  getBlockingFirebaseConfigError,
};

const parseFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return fallback;
  if (["false", "0", "off", "no"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
};

export const providerFlags = {
  google: parseFlag(
    import.meta.env.VITE_ENABLE_GOOGLE ?? env.VITE_ENABLE_GOOGLE,
    true
  ),
  apple: parseFlag(
    import.meta.env.VITE_ENABLE_APPLE ?? env.VITE_ENABLE_APPLE,
    true
  ),
  email: parseFlag(
    import.meta.env.VITE_ENABLE_EMAIL ?? env.VITE_ENABLE_EMAIL,
    true
  ),
  demo: parseFlag(
    import.meta.env.VITE_ENABLE_DEMO ?? env.VITE_ENABLE_DEMO,
    true
  ),
};

export const envFlags = providerFlags;

export async function signInWithEmail(email: string, password: string) {
  void email;
  void password;
  throw new Error("signInWithEmail moved to the auth facade");
}

export function initFirebase() {
  return {
    app,
    db,
    storage,
    functions,
    analytics: analyticsInstance,
  };
}
