/* eslint-disable no-console */
import { initializeApp, type FirebaseApp, getApps } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { isWeb } from "./platform";

type HostingConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
  measurementId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  databaseURL?: string;
};

type ResolvedConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  measurementId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  databaseURL?: string;
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

function assignConfigFromApp(existing: FirebaseApp): void {
  const options = existing.options || {};
  const cfg: ResolvedConfig = {
    apiKey: options.apiKey || "",
    authDomain: options.authDomain || "",
    projectId: options.projectId || "",
    appId: options.appId || "",
    measurementId: options.measurementId || undefined,
    storageBucket: options.storageBucket || undefined,
    messagingSenderId: options.messagingSenderId || undefined,
    databaseURL: options.databaseURL || undefined,
  };
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
    throw new Error("Firebase config missing. Check Hosting init.json.");
  }
  configInstance = cfg;
}

function ensureDeviceLanguage(auth: Auth) {
  try {
    auth.useDeviceLanguage();
  } catch {
    // ignore unsupported platforms
  }
}

async function init(): Promise<void> {
  if (appInstance && authInstance) return;

  // If already initialized elsewhere in dev, reuse
  if (getApps().length > 0) {
    appInstance = getApps()[0]!;
    assignConfigFromApp(appInstance);
    // Reuse existing Auth if already initialized elsewhere (e.g., HMR)
    try {
      authInstance = getAuth(appInstance);
    } catch {
      // Initialize with deterministic persistence order when not yet created
      authInstance = initializeAuth(appInstance, {
        persistence: [
          indexedDBLocalPersistence,
          browserLocalPersistence,
          browserSessionPersistence,
        ],
      });
    }
    ensureDeviceLanguage(authInstance);
    return;
  }

  if (!isWeb) throw new Error("web-only init");

  // Fetch hosting config fresh (avoid stale caches)
  const r = await fetch("/__/firebase/init.json?ts=" + Date.now(), { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as HostingConfig;
  const cfg: ResolvedConfig = {
    apiKey: j.apiKey || "",
    authDomain: j.authDomain || "",
    projectId: j.projectId || "",
    appId: j.appId || "",
    measurementId: j.measurementId || undefined,
    storageBucket: j.storageBucket || undefined,
    databaseURL: j.databaseURL || undefined,
    messagingSenderId: j.messagingSenderId || undefined,
  };

  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
    console.warn("[firebase] invalid init.json", cfg);
    throw new Error("Firebase config missing. Check Hosting init.json.");
  }

  configInstance = cfg;
  appInstance = initializeApp(cfg);
  // Deterministic persistence order; SDK falls back to first available
  try {
    authInstance = initializeAuth(appInstance, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
    });
  } catch {
    // Final fallback to default getter if initializeAuth fails in edge environments
    authInstance = getAuth(appInstance);
  }
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
