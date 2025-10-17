import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  signInWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { FUNCTIONS_BASE, getViteEnv } from "@/lib/env";

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

  let appCheckInstance: AppCheck | null = null;
  const ensureAppCheck = (() => {
    let initialized = false;
    return () => {
      if (initialized) {
        return appCheckInstance;
      }
      initialized = true;
      if (typeof window === "undefined") {
        appCheckInstance = null;
        return appCheckInstance;
      }

      try {
        const siteKey =
          getViteEnv("VITE_RECAPTCHA_SITE_KEY") ??
          getViteEnv("VITE_RECAPTCHA_V3_KEY") ??
          "";
        let provider: CustomProvider | ReCaptchaV3Provider;
        let shouldRefresh = false;
        if (siteKey) {
          provider = new ReCaptchaV3Provider(siteKey);
          shouldRefresh = true;
        } else {
          if (typeof window !== "undefined") {
            (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }
          provider = new CustomProvider({
            getToken: async () => ({
              token: `debug-${Math.random().toString(36).slice(2)}.${Date.now()}`,
              expireTimeMillis: Date.now() + 60 * 60 * 1000,
            }),
          });
        }
        appCheckInstance = initializeAppCheck(app, {
          provider,
          isTokenAutoRefreshEnabled: shouldRefresh,
        });
      } catch (error) {
        console.warn("AppCheck initialization skipped", error);
        appCheckInstance = null;
      }
      return appCheckInstance;
    };
  })();

  if (typeof window !== "undefined") {
    ensureAppCheck();
  }

  const initAuth = (): Auth => {
    if (typeof window !== "undefined") {
      ensureAppCheck();
    }

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
    if (typeof window !== "undefined") {
      ensureAppCheck();
    }
    return getFirestore(app);
  };

  const initFunctions = (): Functions => {
    if (typeof window !== "undefined") {
      ensureAppCheck();
    }
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
    if (typeof window !== "undefined") {
      ensureAppCheck();
    }
    return getStorage(app);
  };

  return {
    app,
    auth: initAuth(),
    firestore: initFirestore(),
    functions: initFunctions(),
    storage: initStorage(),
    appCheck: appCheckInstance,
    ensureAppCheck,
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
    if (err?.code === "auth/network-request-failed") {
      await new Promise((r) => setTimeout(r, 1000));
      return await signInWithEmailAndPassword(auth, email, password);
    }
    throw err;
  }
}

export const getAppCheckInstance = () => firebaseBundle.ensureAppCheck();
