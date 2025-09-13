// Firebase initialization - single source of truth
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getEnv, missingEnvVars } from "./env";

// Collect Firebase config from env with safe fallbacks for preview
const env = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "mybodyscan-f3daf",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "mybodyscan-f3daf.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function isValidConfig(c: any): boolean {
  return !!c?.apiKey && !!c?.appId;
}

// Initialize with proper fallback for preview
export const firebaseConfig = isValidConfig(env) ? env : {
  apiKey: "demo-api-key",
  authDomain: "mybodyscan-f3daf.firebaseapp.com", 
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:demo"
};

export const isFirebaseConfigured = isValidConfig(env);

// Initialize Firebase only once
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

if (!isFirebaseConfigured) {
  console.warn("Preview: Firebase env vars missing/invalid — using placeholder config so UI can render.");
}
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
