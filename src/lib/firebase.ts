import { env } from "@/env";
import type { FirebaseApp } from "firebase/app";
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

// Static Firebase client config for the mybodyscan-f3daf project.
// We intentionally do not override this with VITE_* env variables in production.
const firebaseConfig = {
  apiKey: "AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.firebasestorage.app",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
} as const;

const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"] as const;

export const firebaseConfigMissingKeys: string[] = requiredKeys.filter(
  (key) => !(firebaseConfig as any)?.[key]
);

export const hasFirebaseConfig: boolean = firebaseConfigMissingKeys.length === 0;

export function getFirebaseInitError(): string | null {
  if (!hasFirebaseConfig) {
    return `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`;
  }
  return null;
}

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const firebaseApp = app;
export const auth: Auth = getAuth(app);
let persistenceReady: Promise<void> = setPersistence(auth, browserLocalPersistence).catch(() => undefined);

export const db: Firestore = getFirestore(app);
const functionsRegion = env.VITE_FIREBASE_REGION ?? "us-central1";
export const functions: Functions = getFunctions(app, functionsRegion);
export const storage: FirebaseStorage = getStorage(app);

let analyticsInstance: Analytics | null = null;

export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analyticsInstance) return analyticsInstance;
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

export function ensureAppCheck(instance: FirebaseApp = app): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheckInstance) return appCheckInstance;
  if (appCheckInitialized) return appCheckInstance;
  appCheckInitialized = true;

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
  } catch (error) {
    if (!loggedAppCheckWarning) {
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

export function getFirebaseApp(): FirebaseApp {
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

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithApple() {
  return signInWithRedirect(auth, appleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function initFirebase() {
  return { app, auth, db, storage, functions, analytics: analyticsInstance };
}

export { app, auth, db, storage, functions };
