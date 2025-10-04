import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { FIREBASE_PUBLIC_CONFIG } from "@/config/firebase.public";
import {
  VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID,
} from "@/lib/env";

/**
 * Prefer Vite env vars when present; otherwise fall back to committed public config.
 * This allows Lovable preview to run without an Environment UI.
 */
function env(name: string): string | undefined {
  return (import.meta as any)?.env?.[name];
}

function mergedConfig(): FirebaseOptions {
  const envConfig = {
    apiKey: VITE_FIREBASE_API_KEY,
    authDomain: VITE_FIREBASE_AUTH_DOMAIN,
    projectId: VITE_FIREBASE_PROJECT_ID,
    storageBucket: VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: VITE_FIREBASE_APP_ID,
    measurementId: VITE_FIREBASE_MEASUREMENT_ID,
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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

// Re-export App Check status flag for convenience
export { isAppCheckActive } from "@/appCheck";
