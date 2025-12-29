import { env } from "@/env";
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
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
import {
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

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

const normalizeStorageBucket = (value?: string): string | undefined => {
  if (value == null) return value;
  let bucket = String(value).trim();
  if (!bucket) return undefined;
  if (bucket.startsWith("gs://")) bucket = bucket.slice(5);
  if (bucket.includes("://")) {
    try {
      const url = new URL(bucket);
      const path = url.pathname || "";
      const match =
        path.match(/\/v0\/b\/([^/]+)/) ||
        path.match(/\/upload\/storage\/v1\/b\/([^/]+)/) ||
        path.match(/\/b\/([^/]+)/);
      if (match?.[1]) {
        bucket = decodeURIComponent(match[1]);
      } else if (url.hostname) {
        bucket = url.hostname;
      }
    } catch {
      // ignore malformed URL
    }
  }
  if (bucket.endsWith(".firebasestorage.app")) {
    bucket = bucket.replace(/\.firebasestorage\.app$/, ".appspot.com");
  }
  return bucket;
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

function resolveRuntimeAuthDomain(): string | undefined {
  // iOS Safari + custom domain reliability:
  // Prefer a same-origin authDomain (custom domain / *.web.app) when deployed,
  // but never override localhost/dev unless explicitly configured via env.
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname?.trim();
  if (!host) return undefined;
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1") return undefined;
  if (lower.endsWith(".local")) return undefined;
  // Avoid accidentally using raw IPs in production.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return undefined;
  return host;
}

const runtimeAuthDomain = resolveRuntimeAuthDomain();

const explicitAuthDomain = pickConfigValue(
  envConfig.authDomain,
  injectedConfig?.authDomain
);

const firebaseConfig: FirebaseRuntimeConfig = {
  ...(FALLBACK_FIREBASE_CONFIG as FirebaseRuntimeConfig),
  ...envConfig,
  ...(injectedConfig ?? {}),
};

// If no explicit authDomain was configured, prefer same-origin at runtime.
// This is critical for iOS Safari where cross-site authDomain can lead to
// redirect result loss and endless "back to login" loops.
if (!explicitAuthDomain && runtimeAuthDomain) {
  firebaseConfig.authDomain = runtimeAuthDomain;
}

const normalizedStorageBucket = normalizeStorageBucket(firebaseConfig.storageBucket);
if (normalizedStorageBucket) {
  firebaseConfig.storageBucket = normalizedStorageBucket;
}

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

// Treat these as required for a production-ready web bundle:
const requiredKeys = [
  "apiKey",
  "authDomain",
  "projectId",
] as const;
// MeasurementId is optional (analytics) and should never block boot.
const warningKeys = ["storageBucket", "messagingSenderId", "appId", "measurementId"] as const;

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

function initializeFirebaseApp(): FirebaseApp {
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
    console.warn("[firebase] initialization failed; falling back to built-in config", error);
    // This should be extremely rare; do not crash the UI at import time.
    // Use a known-good config so auth can still load and the app can render.
    if (!getApps().length) {
      return initializeApp(FALLBACK_FIREBASE_CONFIG);
    }
    return getApp();
  }
}

export const app: FirebaseApp = initializeFirebaseApp();
export const firebaseApp: FirebaseApp = app;
export const auth: Auth = getAuth(app);
const persistenceReady: Promise<void> = setPersistence(auth, browserLocalPersistence)
  .catch(async (err) => {
    // Some environments (Safari private mode / constrained WebViews) can reject localStorage.
    // Try IndexedDB-backed persistence next.
    if (import.meta.env.DEV) {
      console.warn("[firebase] browserLocalPersistence failed; retrying", err);
    }
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      return;
    } catch (err2) {
      if (import.meta.env.DEV) {
        console.warn("[firebase] indexedDBLocalPersistence failed; retrying", err2);
      }
      // Last resort: session persistence (still supports redirect flows within a session).
      await setPersistence(auth, browserSessionPersistence).catch(() => undefined);
    }
  })
  .catch(() => undefined);

export const db: Firestore = getFirestore(app);
const functionsRegion = env.VITE_FIREBASE_REGION ?? "us-central1";
export const functions: Functions = getFunctions(app, functionsRegion);
export const storage: FirebaseStorage = getStorage(app);

// iPhone Safari resilience: prevent endless internal retries that look like a 1% stall forever.
try {
  // This SDK exposes retry timers as mutable properties.
  // Keep them short so Safari backgrounding doesn't look like an endless retry loop.
  (storage as any).maxUploadRetryTime = 120_000;
  (storage as any).maxOperationRetryTime = 120_000;
} catch {
  // ignore (older SDKs / non-browser environments)
}

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

let loggedConfigSummary = false;
function buildFirebaseConfigSummary(): Record<string, string> {
  const summary: Record<string, string> = {
    projectId: String(firebaseConfig.projectId || "").trim(),
    authDomain: String(firebaseConfig.authDomain || "").trim(),
  };
  const optional: Array<keyof FirebaseRuntimeConfig> = [
    "storageBucket",
    "messagingSenderId",
    "appId",
    "measurementId",
  ];
  for (const key of optional) {
    const value = String((firebaseConfig as any)?.[key] || "").trim();
    if (value) summary[key] = value;
  }
  return summary;
}

export function logFirebaseConfigSummary(): void {
  if (loggedConfigSummary) return;
  loggedConfigSummary = true;
  try {
    // Do not print apiKey; keep logs concise and non-sensitive.
    console.info("[firebase] config", buildFirebaseConfigSummary());
    if (firebaseConfigWarningKeys.length) {
      console.warn(
        "[firebase] Optional config keys missing; some features may be unavailable",
        firebaseConfigWarningKeys
      );
    }
  } catch {
    // ignore
  }
}

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
