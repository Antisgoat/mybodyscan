// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  type Auth,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
} from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// ---- fallback public config (do not change) ----
export const PUBLIC_WEB_CONFIG = {
  apiKey: "AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.firebasestorage.app",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
} as const;

// Pull from Vite env if present; otherwise fallback to PUBLIC_WEB_CONFIG
function cfgFromEnv() {
  const e = import.meta.env as any;
  const cfg = {
    apiKey: e?.VITE_FIREBASE_API_KEY,
    authDomain: e?.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e?.VITE_FIREBASE_PROJECT_ID,
    storageBucket: e?.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: e?.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: e?.VITE_FIREBASE_APP_ID,
    measurementId: e?.VITE_FIREBASE_MEASUREMENT_ID,
  };
  const hasAll = Object.values(cfg).filter(Boolean).length >= 6 && !!cfg.apiKey && !!cfg.appId;
  return hasAll ? (cfg as typeof PUBLIC_WEB_CONFIG) : PUBLIC_WEB_CONFIG;
}

const firebaseConfig = cfgFromEnv();

const app: FirebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);

// Prefer local persistence; fall back silently if unsupported
const persistenceReady = (async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
    } catch {
      // noop
    }
  }
})();

// Analytics is optional; never throw
let analytics: Analytics | undefined;
try {
  // set later if supported
  // @ts-ignore
  isSupported().then((ok: boolean) => ok && (analytics = getAnalytics(app))).catch(() => {});
} catch {
  /* noop */
}

let firestoreInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;
let storageInstance: FirebaseStorage | undefined;

export const db: Firestore = (firestoreInstance = getFirestore(app));
export const functions: Functions = (functionsInstance = getFunctions(app, "us-central1"));
export const storage: FirebaseStorage = (storageInstance = getStorage(app));

let loggedInfo = false;

export async function firebaseReady(): Promise<void> {
  await persistenceReady.catch(() => {});
}

export function getFirebaseApp(): FirebaseApp {
  return app;
}

export function getFirebaseAuth(): Auth {
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

export function getFirebaseFunctions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app, "us-central1");
  }
  return functionsInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(app);
  }
  return storageInstance;
}

export function getFirebaseConfig() {
  return firebaseConfig;
}

export const firebaseApiKey = firebaseConfig.apiKey;

export function logFirebaseRuntimeInfo(): void {
  if (!import.meta.env.DEV || loggedInfo) return;
  const { projectId, authDomain } = firebaseConfig;
  console.info(`[firebase] project=${projectId} authDomain=${authDomain}`);
  loggedInfo = true;
}

export { app, auth, analytics, firebaseConfig };
