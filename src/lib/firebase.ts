import { env } from "@/env";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

type FirebaseConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  appId: env.VITE_FIREBASE_APP_ID || undefined,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let persistenceReady: Promise<void> = Promise.resolve();
let firestoreInstance: Firestore | null = null;
let functionsInstance: Functions | null = null;
let storageInstance: FirebaseStorage | null = null;
let loggedInfo = false;

export function initFirebase(): { app: FirebaseApp; auth: Auth } {
  if (!appInstance) {
    const existing = getApps();
    if (existing.length > 0) {
      appInstance = existing[0]!;
    } else {
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        console.warn("[firebase] Missing Firebase config: apiKey or projectId");
      }
      appInstance = initializeApp(firebaseConfig as any);
    }
  }

  if (!authInstance) {
    authInstance = getAuth(appInstance);
    persistenceReady = setPersistence(authInstance, browserLocalPersistence).catch(() => {
      /* non-fatal */
    });
  }

  return { app: appInstance!, auth: authInstance! };
}

const { app: firebaseApp, auth } = initFirebase();

export const app = firebaseApp;

const firestoreSingleton = getFirestore(firebaseApp);
const functionsSingleton = getFunctions(firebaseApp, "us-central1");
const storageSingleton = getStorage(firebaseApp);

firestoreInstance = firestoreSingleton;
functionsInstance = functionsSingleton;
storageInstance = storageSingleton;

export const db: Firestore = firestoreSingleton;
export const functions: Functions = functionsSingleton;
export const storage: FirebaseStorage = storageSingleton;

export async function firebaseReady(): Promise<void> {
  await persistenceReady.catch(() => {});
}

export function getFirebaseApp(): FirebaseApp {
  return initFirebase().app;
}

export function getFirebaseAuth(): Auth {
  return initFirebase().auth;
}

export function getFirebaseFirestore(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(initFirebase().app);
  }
  return firestoreInstance;
}

export function getFirebaseFunctions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(initFirebase().app, "us-central1");
  }
  return functionsInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(initFirebase().app);
  }
  return storageInstance;
}

export function getFirebaseConfig() {
  return firebaseConfig;
}

export const firebaseApiKey = firebaseConfig.apiKey;

export function logFirebaseRuntimeInfo(): void {
  if (!import.meta.env?.DEV || loggedInfo) return;
  const { projectId: pid, authDomain } = firebaseConfig;
  console.info(`[firebase] project=${pid} authDomain=${authDomain}`);
  loggedInfo = true;
}

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

export async function signInDemo() {
  return signInAnonymously(auth);
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
  google: parseFlag(env.VITE_ENABLE_GOOGLE, true),
  apple: parseFlag(env.VITE_ENABLE_APPLE, true),
  email: parseFlag(env.VITE_ENABLE_EMAIL, true),
  demo: parseFlag(env.VITE_ENABLE_DEMO, true),
};

export const envFlags = providerFlags;

export { auth, firebaseApp, firebaseConfig };
