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
  getToken,
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
};

const GLOBAL_KEY = "__MBS_FIREBASE__";

let appCheckReady = false;
let firebaseBundle: FirebaseBundle | null = null;
let firebaseBundlePromise: Promise<FirebaseBundle> | null = null;

export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let functions: Functions;
export let storage: FirebaseStorage;

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

async function setupAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
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
      console.warn("[firebase] Unable to prefetch App Check token (soft mode)", error);
    }
  } catch (error) {
    console.warn("[firebase] App Check initialization skipped", error);
    instance = null;
  } finally {
    appCheckReady = true;
  }

  return instance;
}

async function createFirebaseBundle(): Promise<FirebaseBundle> {
  const config = getFirebaseConfig();
  const firebaseApp = getApps().length ? getApp() : initializeApp(config);

  const appCheck = await setupAppCheck(firebaseApp);

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
  const functionsInstance = getFunctions(firebaseApp, "us-central1");
  if (FUNCTIONS_BASE) {
    try {
      (functionsInstance as Functions & { customDomain?: string }).customDomain = FUNCTIONS_BASE;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[firebase] unable to set functions custom domain", error);
      }
    }
  }

  const storageInstance = getStorage(firebaseApp);

  return {
    app: firebaseApp,
    auth: authInstance,
    firestore,
    functions: functionsInstance,
    storage: storageInstance,
    appCheck,
  };
}

function ensureFirebaseBundlePromise(): Promise<FirebaseBundle> {
  if (firebaseBundlePromise) {
    return firebaseBundlePromise;
  }

  const globalScope = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Promise<FirebaseBundle> };

  if (!globalScope[GLOBAL_KEY]) {
    globalScope[GLOBAL_KEY] = createFirebaseBundle()
      .then((bundle) => {
        firebaseBundle = bundle;
        app = bundle.app;
        auth = bundle.auth;
        db = bundle.firestore;
        functions = bundle.functions;
        storage = bundle.storage;
        return bundle;
      })
      .catch((error) => {
        firebaseBundlePromise = null;
        firebaseBundle = null;
        delete globalScope[GLOBAL_KEY];
        throw error;
      });
  }

  firebaseBundlePromise = globalScope[GLOBAL_KEY]!;
  return firebaseBundlePromise;
}

export const initApp = () => ensureFirebaseBundlePromise();

export function getAppCheckInstance() {
  return firebaseBundle?.appCheck ?? null;
}

export function isFirebaseAppCheckReady(): boolean {
  return appCheckReady;
}

export async function safeEmailSignIn(email: string, password: string) {
  await initApp();
  if (!firebaseBundle) {
    throw new Error("auth/uninitialized");
  }
  const authInstance = firebaseBundle.auth;
  try {
    return await signInWithEmailAndPassword(authInstance, email, password);
  } catch (err: any) {
    if (err?.code === "auth/network-request-failed") {
      await new Promise((r) => setTimeout(r, 1000));
      return await signInWithEmailAndPassword(authInstance, email, password);
    }
    throw err;
  }
}
