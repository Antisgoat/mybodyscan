import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const FALLBACK_CONFIG = {
  apiKey: "AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
} as const;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || FALLBACK_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || FALLBACK_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FALLBACK_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || FALLBACK_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || FALLBACK_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FALLBACK_CONFIG.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || FALLBACK_CONFIG.measurementId,
};

function ensureApp(): FirebaseApp {
  const apps = getApps();
  return apps.length ? apps[0] : initializeApp(firebaseConfig);
}

const app = ensureApp();

let authInstance: Auth;
let persistenceReady: Promise<void> = Promise.resolve();

try {
  authInstance = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
} catch {
  authInstance = getAuth(app);
  persistenceReady = setPersistence(authInstance, browserLocalPersistence).catch(async () => {
    try {
      await setPersistence(authInstance, indexedDBLocalPersistence);
    } catch {
      // noop
    }
  });
}

// Analytics is optional; never throw
let analytics: Analytics | undefined;
try {
  isSupported()
    .then((ok) => {
      if (ok) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
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
  return authInstance;
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

export const firebaseApp = app;
export const auth = authInstance;
export { app, analytics, firebaseConfig };

export const envFlags = {
  enableGoogle: (import.meta.env.VITE_ENABLE_GOOGLE ?? "true") !== "false",
  enableApple: (import.meta.env.VITE_ENABLE_APPLE ?? "true") !== "false",
  enableEmail: (import.meta.env.VITE_ENABLE_EMAIL ?? "true") !== "false",
  enableDemo: (import.meta.env.VITE_ENABLE_DEMO ?? "true") !== "false",
};
