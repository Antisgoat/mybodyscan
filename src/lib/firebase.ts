// Firebase initialization - single source of truth
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getEnv, missingEnvVars } from "./env";

// Collect Firebase config from env with safe fallbacks for preview
export const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY", "demo-api-key"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN", "demo-project.firebaseapp.com"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID", "demo-project"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET", "demo-project.appspot.com"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123456789"),
  appId: getEnv("VITE_FIREBASE_APP_ID", "1:123456789:web:abcdef"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-ABCDEF"),
};

// Initialize Firebase only once
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

let warned = false;
const appCheckKey = getEnv("VITE_APPCHECK_SITE_KEY");
if (typeof window !== "undefined") {
  if (appCheckKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (!warned && import.meta.env.DEV) {
    warned = true;
    console.warn("App Check site key missing; requests are not protected. See README to enable.");
  }
}

// Expose missing env vars for a dev-only banner
export { missingEnvVars };
