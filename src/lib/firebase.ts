import { env } from "@/env";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
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
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken as fetchAppCheckToken,
  type AppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? env.VITE_FIREBASE_STORAGE_BUCKET ?? undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? env.VITE_FIREBASE_MEASUREMENT_ID ?? undefined,
};

type FirebaseConfig = typeof firebaseConfig;

const requiredKeys: (keyof FirebaseConfig)[] = ["apiKey", "authDomain", "projectId", "appId"];
const missingConfigKeys = requiredKeys.filter((key) => !String(firebaseConfig[key] ?? "").trim());
const hasRequiredFirebaseConfig = missingConfigKeys.length === 0;

const sanitizedConfig: FirebaseConfig = {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey || "missing-api-key",
  authDomain: firebaseConfig.authDomain || "missing-auth-domain",
  projectId: firebaseConfig.projectId || "missing-project",
  appId: firebaseConfig.appId || "missing-app-id",
};

if (!hasRequiredFirebaseConfig && typeof console !== "undefined") {
  console.warn("[firebase] Missing config keys:", missingConfigKeys.join(", "));
}

let firebaseInitError: Error | null = null;
let appInstance: FirebaseApp;

try {
  appInstance = getApps()[0] ?? initializeApp(sanitizedConfig as FirebaseConfig);
} catch (error) {
  firebaseInitError = (error instanceof Error ? error : new Error(String(error))) ?? null;
  console.error("[firebase] init failed", firebaseInitError);
  // As a fallback, ensure we still return a singleton app to avoid crashes elsewhere.
  const fallback = getApps()[0];
  appInstance = fallback ?? initializeApp(sanitizedConfig as FirebaseConfig);
}

export const firebaseConfigMissingKeys = missingConfigKeys;
export const hasFirebaseConfig = () => hasRequiredFirebaseConfig && !firebaseInitError;
export const getFirebaseInitError = () => firebaseInitError;

let appCheckInstance: AppCheck | null = null;
let appCheckInitialized = false;
let loggedAppCheckWarning = false;

export function ensureAppCheck(app: FirebaseApp = appInstance): AppCheck | null {
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
    appCheckInstance = initializeAppCheck(app, {
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

export const app = appInstance;

export const auth: Auth = getAuth(appInstance);
let persistenceReady: Promise<void> = setPersistence(auth, browserLocalPersistence).catch(() => undefined);

const firestoreSingleton: Firestore = getFirestore(appInstance);
const functionsRegion = import.meta.env.VITE_FIREBASE_REGION ?? env.VITE_FIREBASE_REGION ?? "us-central1";
const functionsSingleton: Functions = getFunctions(appInstance, functionsRegion);
const storageSingleton: FirebaseStorage = getStorage(appInstance);

export const db: Firestore = firestoreSingleton;
export const functions: Functions = functionsSingleton;
export const storage: FirebaseStorage = storageSingleton;

export const appCheck = ensureAppCheck();

export async function firebaseReady(): Promise<void> {
  await persistenceReady.catch(() => undefined);
}

export function getFirebaseApp(): FirebaseApp {
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  return firestoreSingleton;
}

export function getFirebaseFunctions(): Functions {
  return functionsSingleton;
}

export function getFirebaseStorage(): FirebaseStorage {
  return storageSingleton;
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
