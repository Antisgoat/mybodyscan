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
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken as fetchAppCheckToken,
  type AppCheck,
} from "firebase/app-check";

type FirebaseRuntimeConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
};

const envConfig: FirebaseRuntimeConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || (import.meta.env.VITE_FIREBASE_API_KEY as string) || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || "",
  messagingSenderId:
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) ||
    "",
  appId: env.VITE_FIREBASE_APP_ID || (import.meta.env.VITE_FIREBASE_APP_ID as string) || "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) || "",
};

const injectedConfig: Partial<FirebaseRuntimeConfig> | undefined =
  typeof globalThis !== "undefined"
    ? ((globalThis as any).__FIREBASE_CONFIG__ as Partial<FirebaseRuntimeConfig> | undefined)
    : undefined;

const firebaseConfig: FirebaseRuntimeConfig = {
  ...envConfig,
  ...(injectedConfig ?? {}),
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"] as const;

export const firebaseConfigMissingKeys: string[] = requiredKeys.filter((key) => {
  const value = (firebaseConfig as any)?.[key];
  return value === undefined || value === null || value === "";
});

export const hasFirebaseConfig: boolean = firebaseConfigMissingKeys.length === 0;

let firebaseInitError: string | null = null;

export function getFirebaseInitError(): string | null {
  return firebaseInitError || (hasFirebaseConfig ? null : `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`);
}

function initializeFirebaseApp(): FirebaseApp | null {
  if (!hasFirebaseConfig) {
    firebaseInitError = `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`;
    return null;
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

export const firebaseApp = app as FirebaseApp;
export const auth: Auth = app ? getAuth(app) : (null as unknown as Auth);
const persistenceReady: Promise<void> = app
  ? setPersistence(auth, browserLocalPersistence).catch(() => undefined)
  : Promise.resolve();

export const db: Firestore = app ? getFirestore(app) : (null as unknown as Firestore);
const functionsRegion = env.VITE_FIREBASE_REGION ?? "us-central1";
export const functions: Functions = app
  ? getFunctions(app, functionsRegion)
  : (null as unknown as Functions);
export const storage: FirebaseStorage = app ? getStorage(app) : (null as unknown as FirebaseStorage);

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

let appCheckInstance: AppCheck | null = null;
let appCheckInitialized = false;
let loggedAppCheckWarning = false;

export function ensureAppCheck(instance: FirebaseApp | null = app): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheckInstance) return appCheckInstance;
  if (appCheckInitialized) return appCheckInstance;
  appCheckInitialized = true;

  if (!instance) {
    if (!loggedAppCheckWarning) {
      console.warn("[AppCheck] Firebase app not initialized; skipping App Check.");
      loggedAppCheckWarning = true;
    }
    return null;
  }

  (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || undefined;
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
  if (!siteKey || siteKey === "__DISABLE__") {
    console.warn("[AppCheck] VITE_APPCHECK_SITE_KEY not set — callables may be rejected.");
    return null;
  }
  try {
    appCheckInstance = initializeAppCheck(instance, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("[AppCheck] initialization failed", error);
    appCheckInstance = null;
  }
  return appCheckInstance;
}

export async function getAppCheckTokenSafe(forceRefresh = false): Promise<string | undefined> {
  const instance = ensureAppCheck();
  if (!instance) return undefined;
  try {
    const { token } = await fetchAppCheckToken(instance, forceRefresh);
    if (!token && !loggedAppCheckWarning) {
      console.warn("App Check token missing; proceeding in soft mode");
      loggedAppCheckWarning = true;
    }
    return token || undefined;
  } catch (error: any) {
    const code = error?.code || error?.message;
    if (!loggedAppCheckWarning || code === "appCheck/recaptcha-error" || code === "appcheck/recaptcha-error") {
      console.warn("App Check token missing; proceeding in soft mode", error);
      loggedAppCheckWarning = true;
    }
    return undefined;
  }
}

export async function getAppCheckHeader(forceRefresh = false): Promise<Record<string, string>> {
  const token = await getAppCheckTokenSafe(forceRefresh);
  return token ? { "X-Firebase-AppCheck": token } : {};
}

export const appCheck = ensureAppCheck();

export async function firebaseReady(): Promise<void> {
  await persistenceReady.catch(() => undefined);
}

export function getFirebaseApp(): FirebaseApp | null {
  return app;
}

export function getFirebaseAuth(): Auth {
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  return db;
}

export function getFirebaseFunctions(): Functions {
  return functions;
}

export function getFirebaseStorage(): FirebaseStorage {
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
  google: parseFlag(import.meta.env.VITE_ENABLE_GOOGLE ?? env.VITE_ENABLE_GOOGLE, true),
  apple: parseFlag(import.meta.env.VITE_ENABLE_APPLE ?? env.VITE_ENABLE_APPLE, true),
  email: parseFlag(import.meta.env.VITE_ENABLE_EMAIL ?? env.VITE_ENABLE_EMAIL, true),
  demo: parseFlag(import.meta.env.VITE_ENABLE_DEMO ?? env.VITE_ENABLE_DEMO, true),
};

export const envFlags = providerFlags;

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");

function ensureAuthAvailable(): Auth {
  if (!app) {
    const reason = getFirebaseInitError() ?? "Firebase not initialized";
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

