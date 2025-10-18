import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  initializeAppCheck,
  CustomProvider,
  ReCaptchaV3Provider,
  getToken,
  type AppCheck,
} from "firebase/app-check";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { FUNCTIONS_BASE, getViteEnv } from "@/lib/env";

export type FirebaseBundle = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
  appCheck: AppCheck | null;
};

let bundle: FirebaseBundle | null = null;
let initPromise: Promise<FirebaseBundle> | null = null;
let appCheckReady = false;

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

async function activateAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  if (typeof window === "undefined") {
    appCheckReady = true;
    return null;
  }

  let instance: AppCheck | null = null;
  try {
    const siteKey =
      getViteEnv("VITE_RECAPTCHA_SITE_KEY") ?? getViteEnv("VITE_RECAPTCHA_V3_KEY") ?? "";

    let provider: CustomProvider | ReCaptchaV3Provider;
    let autoRefresh = false;

    if (siteKey) {
      provider = new ReCaptchaV3Provider(siteKey);
      autoRefresh = true;
    } else {
      (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      provider = new CustomProvider({
        getToken: async () => ({
          token: `debug-${Math.random().toString(36).slice(2)}.${Date.now()}`,
          expireTimeMillis: Date.now() + 60 * 60 * 1000,
        }),
      });
    }

    instance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: autoRefresh,
    });

    try {
      await getToken(instance, false);
    } catch (error) {
      console.warn("[app-check] Prefetch failed (soft mode)", error);
    }
  } catch (error) {
    console.warn("[app-check] initialization skipped", error);
    instance = null;
  } finally {
    appCheckReady = true;
  }

  return instance;
}

async function createBundle(): Promise<FirebaseBundle> {
  const firebaseApp = getApps().length ? getApp() : initializeApp(getFirebaseConfig());

  const appCheck = await activateAppCheck(firebaseApp);

  let authInstance: Auth;
  try {
    authInstance = getAuth(firebaseApp);
  } catch {
    authInstance = initializeAuth(firebaseApp, { persistence: browserLocalPersistence });
  }

  if (typeof window !== "undefined") {
    try {
      await setPersistence(authInstance, browserLocalPersistence);
    } catch (error) {
      console.warn("[firebase] Unable to set auth persistence", error);
    }
  }

  const firestore = getFirestore(firebaseApp);
  const functions = getFunctions(firebaseApp, "us-central1");
  if (FUNCTIONS_BASE) {
    try {
      (functions as Functions & { customDomain?: string }).customDomain = FUNCTIONS_BASE;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[firebase] Unable to assign functions custom domain", error);
      }
    }
  }
  const storage = getStorage(firebaseApp);

  return {
    app: firebaseApp,
    auth: authInstance,
    firestore,
    functions,
    storage,
    appCheck,
  };
}

export async function initFirebaseApp(): Promise<FirebaseBundle> {
  if (bundle) {
    return bundle;
  }
  if (!initPromise) {
    initPromise = createBundle()
      .then((result) => {
        bundle = result;
        return result;
      })
      .catch((error) => {
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

export function getFirebaseBundle(): FirebaseBundle | null {
  return bundle;
}

export function isAppCheckInitialized(): boolean {
  return appCheckReady;
}

export async function getAuthSafe(): Promise<Auth> {
  const { auth } = await initFirebaseApp();
  return auth;
}

export async function getFirestoreSafe(): Promise<Firestore> {
  const { firestore } = await initFirebaseApp();
  return firestore;
}

export async function getFunctionsSafe(): Promise<Functions> {
  const { functions } = await initFirebaseApp();
  return functions;
}

export async function getStorageSafe(): Promise<FirebaseStorage> {
  const { storage } = await initFirebaseApp();
  return storage;
}

export function getAppCheckInstance(): AppCheck | null {
  return bundle?.appCheck ?? null;
}

