import { initializeApp, type FirebaseOptions, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

for (const key of [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const) {
  const value = firebaseConfig[key];
  if (!value) {
    throw new Error(`Missing Firebase env var: ${key}. Ensure it exists in .env.local`);
  }
}

const existingApp = getApps()[0];
export const app = existingApp ?? initializeApp(firebaseConfig);

let authInstance: ReturnType<typeof getAuth>;
if (existingApp) {
  authInstance = getAuth(app);
} else {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
}

export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

let analyticsInstance: ReturnType<typeof getAnalytics> | undefined;
if (typeof window !== "undefined" && firebaseConfig.measurementId) {
  analyticsSupported()
    .then((supported) => {
      if (supported) {
        analyticsInstance = getAnalytics(app);
      }
    })
    .catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[Firebase] analytics support check failed:", error);
      }
    });
}

export const analytics = analyticsInstance;

export { firebaseConfig };
