import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  signInWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { FUNCTIONS_BASE, getViteEnv } from "@/lib/env";
import { ensureAppCheck, getAppCheckInstance, getAppCheckToken, type AppCheck } from "@/appCheck";

type FirebaseBundle = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
  appCheck: AppCheck | null;
  ensureAppCheck: () => AppCheck | null;
};

const GLOBAL_KEY = "__MBS_FIREBASE__";

function getFirebaseConfig() {
  return {
    apiKey: getViteEnv("VITE_FIREBASE_API_KEY") ?? "",
    authDomain: getViteEnv("VITE_FIREBASE_AUTH_DOMAIN") ?? "",
    projectId: getViteEnv("VITE_FIREBASE_PROJECT_ID") ?? "",
    storageBucket: getViteEnv("VITE_FIREBASE_STORAGE_BUCKET") ?? "",
    messagingSenderId: getViteEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") ?? "",
    appId: getViteEnv("VITE_FIREBASE_APP_ID") ?? "",
    measurementId: getViteEnv("VITE_FIREBASE_MEASUREMENT_ID") ?? undefined,
  };
}

const createFirebaseBundle = (): FirebaseBundle => {
  const config = getFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp(config);

  // Initialize App Check first (soft mode)
  if (typeof window !== "undefined") {
    ensureAppCheck().catch((error) => {
      console.warn("AppCheck initialization failed; continuing in soft mode", error);
    });
  }

  const initAuth = (): Auth => {
    let instance: Auth;
    try {
      instance = getAuth(app);
    } catch {
      instance = initializeAuth(app, { persistence: browserLocalPersistence });
    }

    if (typeof window !== "undefined") {
      setPersistence(instance, browserLocalPersistence).catch(() => {});
    }
    return instance;
  };

  const initFirestore = (): Firestore => {
    return getFirestore(app);
  };

  const initFunctions = (): Functions => {
    const instance = getFunctions(app, "us-central1");
    if (FUNCTIONS_BASE) {
      try {
        (instance as Functions & { customDomain?: string }).customDomain = FUNCTIONS_BASE;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[firebase] unable to set functions custom domain", error);
        }
      }
    }
    return instance;
  };

  const initStorage = (): FirebaseStorage => {
    return getStorage(app);
  };

  return {
    app,
    auth: initAuth(),
    firestore: initFirestore(),
    functions: initFunctions(),
    storage: initStorage(),
    appCheck: getAppCheckInstance(),
    ensureAppCheck: () => getAppCheckInstance(),
  };
};

const globalScope = globalThis as typeof globalThis & { [GLOBAL_KEY]?: FirebaseBundle };
const firebaseBundle = globalScope[GLOBAL_KEY] ?? createFirebaseBundle();
if (!globalScope[GLOBAL_KEY]) {
  globalScope[GLOBAL_KEY] = firebaseBundle;
}

export const app = firebaseBundle.app;
export const auth = firebaseBundle.auth;
export const db = firebaseBundle.firestore;
export const functions = firebaseBundle.functions;
export const storage = firebaseBundle.storage;

export async function safeEmailSignIn(email: string, password: string) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    // Add lightweight diagnostics for sign-in failure
    const diagnostics = {
      appCheckTokenPresent: false,
      origin: typeof window !== "undefined" ? window.location.origin : "unknown",
      errorCode: err?.code || "unknown",
      timestamp: new Date().toISOString(),
    };

    // Check if App Check token is present
    try {
      const appCheckToken = await getAppCheckToken();
      diagnostics.appCheckTokenPresent = !!appCheckToken;
    } catch (appCheckError) {
      console.warn("App Check token check failed:", appCheckError);
    }

    // Log diagnostics (non-blocking)
    console.warn("Sign-in failure diagnostics:", diagnostics);

    if (err?.code === "auth/network-request-failed") {
      await new Promise((r) => setTimeout(r, 1000));
      return await signInWithEmailAndPassword(auth, email, password);
    }
    throw err;
  }
}

export const getAppCheckInstance = () => firebaseBundle.ensureAppCheck();
