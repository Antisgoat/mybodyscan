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

const readEnv = (key: string) =>
  (import.meta as any).env?.[key] ?? (globalThis as any)?.process?.env?.[key];

const projectId =
  readEnv("VITE_FIREBASE_PROJECT_ID") || readEnv("FIREBASE_PROJECT_ID") || "";

const firebaseConfig: FirebaseConfig = {
  apiKey:
    readEnv("VITE_FIREBASE_API_KEY") ||
    readEnv("FIREBASE_WEB_API_KEY") ||
    readEnv("FIREBASE_API_KEY") ||
    "",
  projectId,
  authDomain:
    readEnv("VITE_FIREBASE_AUTH_DOMAIN") ||
    (projectId ? `${projectId}.firebaseapp.com` : undefined),
  storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readEnv("VITE_FIREBASE_APP_ID"),
  measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID"),
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let persistenceReady: Promise<void> = Promise.resolve();
let appCheckInitialized = false;
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

    const siteKey = (readEnv("VITE_APPCHECK_SITE_KEY") || "").trim();
    if (siteKey && !appCheckInitialized) {
      appCheckInitialized = true;
      void import("firebase/app-check")
        .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
          try {
            initializeAppCheck(appInstance!, {
              provider: new ReCaptchaV3Provider(siteKey),
              isTokenAutoRefreshEnabled: true,
            });
          } catch (err) {
            if (import.meta.env?.DEV) {
              console.warn("[firebase] App Check init failed", err);
            }
          }
        })
        .catch((err) => {
          if (import.meta.env?.DEV) {
            console.warn("[firebase] Unable to load app-check", err);
          }
        });
    }
  }

  return { app: appInstance!, auth: authInstance! };
}

const { app: firebaseApp, auth } = initFirebase();

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
appleProvider.addScope("email");
appleProvider.addScope("name");

export async function signInWithGoogle() {
  const { auth } = initFirebase();
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithApple() {
  const { auth } = initFirebase();
  return signInWithPopup(auth, appleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  const { auth } = initFirebase();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signInDemo() {
  const { auth } = initFirebase();
  return signInAnonymously(auth);
}

export { auth, firebaseApp, firebaseConfig };
