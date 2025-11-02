import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

type FBConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

const env = (key: string) => (import.meta as any).env?.[key] ?? (globalThis as any)?.process?.env?.[key];

function loadConfig(): FBConfig {
  const projectId =
    env("VITE_FIREBASE_PROJECT_ID") ||
    env("FIREBASE_PROJECT_ID") ||
    "";

  const authDomain =
    env("VITE_FIREBASE_AUTH_DOMAIN") ||
    (projectId ? `${projectId}.firebaseapp.com` : undefined);

  return {
    apiKey:
      env("VITE_FIREBASE_API_KEY") ||
      env("FIREBASE_WEB_API_KEY") ||
      env("FIREBASE_API_KEY") ||
      "",
    projectId,
    authDomain,
    storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("VITE_FIREBASE_APP_ID"),
    measurementId: env("VITE_FIREBASE_MEASUREMENT_ID"),
  };
}

const firebaseConfig = loadConfig();

let appInstance: FirebaseApp;

function ensureApp(): FirebaseApp {
  if (appInstance) return appInstance;
  const existing = getApps();
  if (existing.length > 0) {
    appInstance = existing[0]!;
    return appInstance;
  }
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("Missing Firebase config: apiKey or projectId");
  }
  appInstance = initializeApp(firebaseConfig as any);
  return appInstance;
}

const app = ensureApp();

let authInstance: Auth | undefined;
let persistenceReady: Promise<void> = Promise.resolve();

function ensureAuth(): Auth {
  if (authInstance) return authInstance;
  try {
    authInstance = initializeAuth(app, {
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    authInstance = getAuth(app);
  }
  persistenceReady = setPersistence(authInstance, browserLocalPersistence).catch(() => {});
  return authInstance;
}

const auth = ensureAuth();

let analytics: Analytics | undefined;
try {
  isSupported()
    .then((supported) => {
      if (supported) {
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
  return ensureApp();
}

export function getFirebaseAuth(): Auth {
  return ensureAuth();
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
export { analytics, firebaseConfig };
export { auth };

const flag = (key: string, defaultValue = true) => {
  const raw = env(key);
  if (typeof raw === "string") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
  }
  return defaultValue;
};

export const envFlags = {
  enableGoogle: flag("VITE_ENABLE_GOOGLE", true),
  enableApple: flag("VITE_ENABLE_APPLE", true),
  enableEmail: flag("VITE_ENABLE_EMAIL", true),
  enableDemo: flag("VITE_ENABLE_DEMO", true),
};
