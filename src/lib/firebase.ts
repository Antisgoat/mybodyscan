/* eslint-disable no-console */
import { initializeApp, type FirebaseApp, getApps } from "firebase/app";
import type { FirebaseError } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { isWeb } from "./platform";

type ResolvedConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;
let configInstance: ResolvedConfig | null = null;
let initPromise: Promise<void> | null = null;

type LazyGetter<T> = () => T;

function bindIfFunction<T extends object>(target: T, value: unknown) {
  if (typeof value !== "function") return value;
  return (value as (...args: unknown[]) => unknown).bind(target);
}

function createLazyProxy<T extends object>(getter: LazyGetter<T>, label: string): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const instance = getter();
      const value = Reflect.get(instance as object, prop, receiver);
      return bindIfFunction(instance, value);
    },
    set(_target, prop, value, receiver) {
      const instance = getter();
      return Reflect.set(instance as object, prop, value, receiver);
    },
    has(_target, prop) {
      const instance = getter();
      return Reflect.has(instance as object, prop);
    },
    ownKeys() {
      const instance = getter();
      return Reflect.ownKeys(instance as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const instance = getter();
      return Reflect.getOwnPropertyDescriptor(instance as object, prop);
    },
    getPrototypeOf() {
      const instance = getter();
      return Object.getPrototypeOf(instance as object);
    },
    setPrototypeOf(_target, proto) {
      const instance = getter();
      return Reflect.setPrototypeOf(instance as object, proto);
    },
    deleteProperty(_target, prop) {
      const instance = getter();
      return Reflect.deleteProperty(instance as object, prop);
    },
    defineProperty(_target, prop, descriptor) {
      const instance = getter();
      return Reflect.defineProperty(instance as object, prop, descriptor);
    },
    apply() {
      throw new Error(`${label} is not callable.`);
    },
    construct() {
      throw new Error(`${label} is not constructible.`);
    },
  });
}

function ensureDeviceLanguage(auth: Auth) {
  try {
    auth.useDeviceLanguage();
  } catch {
    // ignore unsupported platforms
  }
}

let envConfigCache: ResolvedConfig | null = null;

function configFromEnv(): ResolvedConfig {
  if (envConfigCache) {
    return envConfigCache;
  }

  const cfg: ResolvedConfig = {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
    appId: (import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim() || undefined,
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim() || undefined,
  };

  const missing: string[] = [];
  if (!cfg.apiKey) missing.push("VITE_FIREBASE_API_KEY");
  if (!cfg.authDomain) missing.push("VITE_FIREBASE_AUTH_DOMAIN");
  if (!cfg.projectId) missing.push("VITE_FIREBASE_PROJECT_ID");
  if (!cfg.appId) missing.push("VITE_FIREBASE_APP_ID");

  if (missing.length) {
    throw new Error(`Firebase env config missing: ${missing.join(", ")}`);
  }

  envConfigCache = cfg;
  return cfg;
}

export const firebaseApiKey = configFromEnv().apiKey;

let loggedConfig = false;

export function logFirebaseRuntimeInfo(): void {
  if (!import.meta.env.DEV || loggedConfig) return;
  const { projectId, authDomain } = configFromEnv();
  console.info(`[firebase] project=${projectId} authDomain=${authDomain}`);
  loggedConfig = true;
}

async function init(): Promise<void> {
  if (appInstance && authInstance) return;

  // If already initialized elsewhere in dev, reuse
  if (getApps().length > 0) {
    appInstance = getApps()[0]!;
    configInstance = configFromEnv();
    authInstance = getAuth(appInstance);
    ensureDeviceLanguage(authInstance);
    return;
  }

  if (!isWeb) throw new Error("web-only init");

  const cfg = configFromEnv();

  console.log("[firebase] runtime init.json:", { projectId: cfg.projectId, authDomain: cfg.authDomain, apiKey: cfg.apiKey ? "***" : "missing" });

  configInstance = cfg;
  appInstance = initializeApp(cfg);
  authInstance = ensureAuth(appInstance);
  ensureDeviceLanguage(authInstance);
}

function requireApp(): FirebaseApp {
  if (!appInstance) {
    throw new Error("Firebase not initialized. Call firebaseReady() first.");
  }
  return appInstance;
}

function requireAuth(): Auth {
  if (!authInstance) {
    throw new Error("Firebase not initialized. Call firebaseReady() first.");
  }
  return authInstance;
}

function requireConfig(): ResolvedConfig {
  if (!configInstance) {
    throw new Error("Firebase not initialized. Call firebaseReady() first.");
  }
  return configInstance;
}

function ensureFirestore(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(requireApp());
  }
  return firestoreInstance;
}

function ensureStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(requireApp());
  }
  return storageInstance;
}

function ensureFunctions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(requireApp(), "us-central1");
  }
  return functionsInstance;
}

function ensureAuth(app: FirebaseApp): Auth {
  if (authInstance) {
    return authInstance;
  }

  const persistence = [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
  ];

  const attempt = (opts: Parameters<typeof initializeAuth>[1]) => {
    try {
      authInstance = initializeAuth(app, opts);
      return authInstance;
    } catch (error) {
      const fbError = error as FirebaseError | undefined;
      if (fbError?.code === "auth/already-initialized") {
        authInstance = getAuth(app);
        return authInstance;
      }
      throw error;
    }
  };

  try {
    return attempt({ persistence, popupRedirectResolver: browserPopupRedirectResolver });
  } catch (error) {
    const fbError = error as FirebaseError | undefined;
    if (import.meta.env.DEV) {
      console.warn("[firebase] Falling back to in-memory auth persistence", fbError?.code || error);
    }
    return attempt({ persistence: [inMemoryPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  }
}

export async function firebaseReady(): Promise<void> {
  if (appInstance && authInstance) return;
  if (!initPromise) {
    initPromise = init().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

export function getFirebaseApp(): FirebaseApp {
  return requireApp();
}

export function getFirebaseAuth(): Auth {
  return requireAuth();
}

export function getFirebaseFirestore(): Firestore {
  return ensureFirestore();
}

export function getFirebaseStorage(): FirebaseStorage {
  return ensureStorage();
}

export function getFirebaseFunctions(): Functions {
  return ensureFunctions();
}

export function getFirebaseConfig(): ResolvedConfig {
  return requireConfig();
}

const app = createLazyProxy(() => getFirebaseApp(), "Firebase app");
const auth = createLazyProxy(() => getFirebaseAuth(), "Firebase auth");
const db = createLazyProxy(() => getFirebaseFirestore(), "Firestore");
const storage = createLazyProxy(() => getFirebaseStorage(), "Firebase storage");
const functions = createLazyProxy(() => getFirebaseFunctions(), "Firebase functions");
const firebaseConfig = createLazyProxy(() => getFirebaseConfig(), "Firebase config");

export { app, db, storage, functions, firebaseConfig };
export { auth }; // kept for legacy imports; throws if accessed before ready()
