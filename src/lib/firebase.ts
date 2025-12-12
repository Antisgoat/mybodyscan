import { env } from "@/env";
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from "firebase/auth";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

type FirebaseRuntimeConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

const FALLBACK_FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: "AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
};

const pickConfigValue = (
  ...candidates: Array<string | undefined | null | number | boolean>
): string | undefined => {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const asString = String(candidate).trim();
    if (asString) return asString;
  }
  return undefined;
};

const envConfig: Partial<FirebaseRuntimeConfig> = {
  apiKey: pickConfigValue(
    env.VITE_FIREBASE_API_KEY,
    import.meta.env.VITE_FIREBASE_API_KEY
  ),
  authDomain: pickConfigValue(
    env.VITE_FIREBASE_AUTH_DOMAIN,
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  ),
  projectId: pickConfigValue(
    env.VITE_FIREBASE_PROJECT_ID,
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  ),
  storageBucket: pickConfigValue(
    env.VITE_FIREBASE_STORAGE_BUCKET,
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: pickConfigValue(
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: pickConfigValue(
    env.VITE_FIREBASE_APP_ID,
    import.meta.env.VITE_FIREBASE_APP_ID
  ),
  measurementId: pickConfigValue(
    env.VITE_FIREBASE_MEASUREMENT_ID,
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  ),
};

const injectedConfig: Partial<FirebaseRuntimeConfig> | undefined =
  typeof globalThis !== "undefined"
    ? (((globalThis as any).__FIREBASE_CONFIG__ ||
        (globalThis as any).__FIREBASE_RUNTIME_CONFIG__) as
        | Partial<FirebaseRuntimeConfig>
        | undefined)
    : undefined;

const firebaseConfig: FirebaseRuntimeConfig = {
  ...(FALLBACK_FIREBASE_CONFIG as FirebaseRuntimeConfig),
  ...envConfig,
  ...(injectedConfig ?? {}),
};

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return String(value).trim() === "";
}

for (const [key, fallbackValue] of Object.entries(FALLBACK_FIREBASE_CONFIG)) {
  const currentValue = (firebaseConfig as any)[key];
  if (isMissing(currentValue) && !isMissing(fallbackValue)) {
    (firebaseConfig as any)[key] = fallbackValue;
  }
}
// NOTE: If https://mybodyscanapp.com (or any other production host) is not listed under
// Firebase Console → Auth → Settings → Authorized domains, Firebase Auth's Identity Toolkit
// endpoint will respond with a 404 and browsers will surface a CORS warning. This must be
// resolved in console configuration, not client code.

const requiredKeys = ["apiKey", "authDomain", "projectId"] as const;
const warningKeys = ["appId", "storageBucket", "measurementId"] as const;

export const firebaseConfigMissingKeys: string[] = requiredKeys.filter(
  (key) => {
    const value = (firebaseConfig as any)?.[key];
    return isMissing(value);
  }
);

export const firebaseConfigWarningKeys: string[] = warningKeys.filter((key) => {
  const value = (firebaseConfig as any)?.[key];
  return isMissing(value);
});

export const hasFirebaseConfig: boolean =
  firebaseConfigMissingKeys.length === 0;

if (firebaseConfigWarningKeys.length && typeof console !== "undefined") {
  console.warn(
    "[firebase] Optional config keys missing; continuing with defaults",
    firebaseConfigWarningKeys
  );
}

let firebaseInitError: string | null = null;

export function getFirebaseInitError(): string | null {
  return (
    firebaseInitError ||
    (hasFirebaseConfig
      ? null
      : `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`)
  );
}

function initializeFirebaseApp(): FirebaseApp | null {
  if (!hasFirebaseConfig && !firebaseInitError) {
    // Warn but continue booting with whatever partial config we have so the UI can render
    firebaseInitError = `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`;
    console.warn("[firebase] partial configuration detected", {
      missing: firebaseConfigMissingKeys,
    });
  }
  try {
    if (!getApps().length) {
      return initializeApp(firebaseConfig as FirebaseOptions);
    }
    return getApp();
  } catch (error) {
    firebaseInitError = error instanceof Error ? error.message : String(error);
    if (import.meta.env.DEV) {
      console.warn("[firebase] initialization failed", error);
    }
    return null;
  }
}

const app: FirebaseApp | null = initializeFirebaseApp();

export const firebaseApp: FirebaseApp | null = app;
export const auth: Auth | null = app ? getAuth(app) : null;
const persistenceReady: Promise<void> =
  app && auth
    ? setPersistence(auth, browserLocalPersistence).catch(() => undefined)
    : Promise.resolve();

export const db: Firestore = app
  ? getFirestore(app)
  : (null as unknown as Firestore);
const functionsRegion = env.VITE_FIREBASE_REGION ?? "us-central1";
export const functions: Functions = app
  ? getFunctions(app, functionsRegion)
  : (null as unknown as Functions);
export const storage: FirebaseStorage = app
  ? getStorage(app)
  : (null as unknown as FirebaseStorage);

let analyticsInstance: Analytics | null = null;

export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analyticsInstance) return analyticsInstance;
  if (!app) return null;
  const supported = await isSupported();
  if (!supported) return null;
  analyticsInstance = getAnalytics(app);
  return analyticsInstance;
}

// NOTE: Firebase emulators are intentionally disabled in the production bundle.
// If you need them for local development, re-enable this block in a dev-only branch.
// const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
// if (useEmulators) {
//   connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
// }

if (import.meta.env.DEV && typeof window !== "undefined") {
  console.info("[firebase] initialized", {
    origin: window.location.origin,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    hasConfig: hasFirebaseConfig,
    missingKeys: firebaseConfigMissingKeys,
  });
}

export async function firebaseReady(): Promise<void> {
  await persistenceReady.catch(() => undefined);
}

export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  return db;
}

export function getFirebaseFunctions(): Functions | null {
  return functions;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  return storage;
}

export function getFirebaseConfig() {
  return firebaseConfig;
}

export const firebaseApiKey = firebaseConfig.apiKey;

let loggedInfo = false;
export function logFirebaseRuntimeInfo(): void {
  if (!import.meta.env?.DEV || loggedInfo) return;
  const { projectId: pid, authDomain } = firebaseConfig;
  console.info(`[firebase] project=${pid} authDomain=${authDomain}`);
  loggedInfo = true;
}

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

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");

function ensureAuthAvailable(): Auth {
  if (!auth || !app) {
    const reason =
      getFirebaseInitError() ??
      (hasFirebaseConfig
        ? "Firebase auth unavailable"
        : "Firebase not initialized");
    throw new Error(reason);
  }
  return auth;
}

export async function signInWithGoogle() {
  const instance = ensureAuthAvailable();
  return signInWithPopup(instance, googleProvider);
}

export async function signInWithApple() {
  const instance = ensureAuthAvailable();
  return signInWithRedirect(instance, appleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  const instance = ensureAuthAvailable();
  return signInWithEmailAndPassword(instance, email, password);
}

export function initFirebase() {
  return { app, auth, db, storage, functions, analytics: analyticsInstance };
}
