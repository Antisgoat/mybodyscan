import { initializeApp, getApps } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";

import { waitForAppCheckReady } from "@/appCheck";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const appCheckReady = waitForAppCheckReady();

let _auth: Auth | null = null;
let _authInitPromise: Promise<Auth> | null = null;

export const getSequencedAuth = async (): Promise<Auth> => {
  if (_auth) return _auth;
  
  if (_authInitPromise) return _authInitPromise;
  
  _authInitPromise = (async () => {
    await appCheckReady;
    _auth = getAuth(app);
    await setPersistence(_auth, browserLocalPersistence);
    if (typeof window !== "undefined") console.log("[init] Auth ready (after AppCheck readiness)");
    return _auth;
  })();
  
  return _authInitPromise;
};

// Optional: one-time breadcrumb so QA can see build-time env
if (typeof window !== "undefined") {
  console.log("[init] Build env:", {
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  });

  console.log(
    "[build] version:",
    typeof (globalThis as any).__APP_VERSION__ !== "undefined" ? (globalThis as any).__APP_VERSION__ : "dev",
  );
}
