import { initializeApp, type FirebaseOptions, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import { FIREBASE_PUBLIC_CONFIG } from "@/config/firebase.public";

const firebaseConfig: FirebaseOptions = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY || FIREBASE_PUBLIC_CONFIG.apiKey || "REPLACE_ME_WITH_REAL_API_KEY",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mybodyscan-f3daf.firebaseapp.com",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PUBLIC_CONFIG.projectId || "mybodyscan-f3daf",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || FIREBASE_PUBLIC_CONFIG.storageBucket || "mybodyscan-f3daf.appspot.com",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || FIREBASE_PUBLIC_CONFIG.messagingSenderId || "REPLACE_ME",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FIREBASE_PUBLIC_CONFIG.appId || "REPLACE_ME",
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || FIREBASE_PUBLIC_CONFIG.measurementId
    ? {
        measurementId:
          import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || FIREBASE_PUBLIC_CONFIG.measurementId,
      }
    : {}),
};

export { firebaseConfig };

// Guard against double-initialization in dev/HMR and multiple entrypoints
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

let analyticsInstance: ReturnType<typeof getAnalytics> | undefined;
if (typeof window !== "undefined" && typeof document !== "undefined" && firebaseConfig.measurementId) {
  try {
    analyticsInstance = getAnalytics(app);
  } catch (error) {
    console.warn("[Firebase] analytics disabled:", error);
  }
}

export const analytics = analyticsInstance;

// Re-export App Check status flag for convenience
export { isAppCheckActive } from "@/appCheck";
