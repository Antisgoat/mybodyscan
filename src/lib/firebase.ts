import { initializeApp, type FirebaseOptions, getApps, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported, type Analytics } from "firebase/analytics";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  type Auth,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const REQUIRED_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const satisfies readonly (keyof FirebaseOptions)[];

let firebaseConfigCache: FirebaseOptions | null = null;
let appSingleton: FirebaseApp | null = null;
let authSingleton: Auth | null = null;
let firestoreSingleton: Firestore | null = null;
let storageSingleton: FirebaseStorage | null = null;
let functionsSingleton: Functions | null = null;
let analyticsSingleton: Analytics | null = null;
let googleProviderSingleton: GoogleAuthProvider | null = null;
let appleProviderSingleton: OAuthProvider | null = null;
let readyPromise: Promise<void> | null = null;

function resolveFirebaseConfig(): FirebaseOptions {
  if (firebaseConfigCache) {
    return firebaseConfigCache;
  }

  const config: FirebaseOptions = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  for (const key of REQUIRED_KEYS) {
    const value = config[key];
    if (!value) {
      throw new Error(`Missing Firebase env var: ${key}. Ensure it exists in .env.local`);
    }
  }

  firebaseConfigCache = config;
  return config;
}

export function getFirebase(): FirebaseApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (appSingleton) {
    return appSingleton;
  }

  const apps = getApps();
  if (apps.length > 0) {
    appSingleton = apps[0]!;
    return appSingleton;
  }

  const config = resolveFirebaseConfig();
  appSingleton = initializeApp(config);
  return appSingleton;
}

function ensureAuth(): Auth | null {
  if (authSingleton) {
    return authSingleton;
  }
  const app = getFirebase();
  if (!app) return null;

  try {
    authSingleton = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    authSingleton = getAuth(app);
  }

  return authSingleton;
}

function ensureFirestore(): Firestore | null {
  if (firestoreSingleton) return firestoreSingleton;
  const app = getFirebase();
  if (!app) return null;
  firestoreSingleton = getFirestore(app);
  return firestoreSingleton;
}

function ensureStorage(): FirebaseStorage | null {
  if (storageSingleton) return storageSingleton;
  const app = getFirebase();
  if (!app) return null;
  storageSingleton = getStorage(app);
  return storageSingleton;
}

function ensureFunctions(): Functions | null {
  if (functionsSingleton) return functionsSingleton;
  const app = getFirebase();
  if (!app) return null;
  functionsSingleton = getFunctions(app, "us-central1");
  return functionsSingleton;
}

async function ensureAnalytics(): Promise<Analytics | null> {
  if (analyticsSingleton) return analyticsSingleton;
  if (typeof window === "undefined") return null;
  const app = getFirebase();
  if (!app) return null;
  const config = resolveFirebaseConfig();
  if (!config.measurementId) return null;
  try {
    const supported = await analyticsSupported();
    if (!supported) return null;
    analyticsSingleton = getAnalytics(app);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[Firebase] analytics support check failed:", error);
    }
    return null;
  }
  return analyticsSingleton;
}

function ensureGoogleProvider(): GoogleAuthProvider | null {
  if (googleProviderSingleton) return googleProviderSingleton;
  if (typeof window === "undefined") return null;
  googleProviderSingleton = new GoogleAuthProvider();
  return googleProviderSingleton;
}

function ensureAppleProvider(): OAuthProvider | null {
  if (appleProviderSingleton) return appleProviderSingleton;
  if (typeof window === "undefined") return null;
  appleProviderSingleton = new OAuthProvider("apple.com");
  return appleProviderSingleton;
}

export const onReady = () => {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (document.readyState === "complete") {
      resolve();
      return;
    }
    window.addEventListener("load", () => resolve(), { once: true });
  });
  return readyPromise;
};

function bindInstance<T extends object>(getInstance: () => T | null): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = getInstance();
      if (!instance) return undefined;
      const value = Reflect.get(instance as any, prop);
      if (typeof value === "function") {
        return value.bind(instance);
      }
      return value;
    },
    has(_target, prop) {
      const instance = getInstance();
      if (!instance) return false;
      return prop in (instance as any);
    },
  });
}

export const app = bindInstance(() => getFirebase() as FirebaseApp | null);
export const auth = bindInstance(() => ensureAuth() as Auth | null);
export const db = bindInstance(() => ensureFirestore() as Firestore | null);
export const storage = bindInstance(() => ensureStorage() as FirebaseStorage | null);
export const functions = bindInstance(() => ensureFunctions() as Functions | null);
export const analytics = bindInstance(() => analyticsSingleton ?? null);

export function getAuthObjects() {
  const authInstance = ensureAuth();
  const googleProvider = ensureGoogleProvider();
  const appleProvider = ensureAppleProvider();
  return { auth: authInstance, googleProvider, appleProvider };
}

export const googleProvider = bindInstance(() => ensureGoogleProvider() as GoogleAuthProvider | null);
export const appleProvider = bindInstance(() => ensureAppleProvider() as OAuthProvider | null);

if (typeof window !== "undefined") {
  void onReady().then(() => ensureAnalytics());
}

const firebaseConfig = resolveFirebaseConfig();
firebaseConfigCache = firebaseConfig;

export { firebaseConfig };
