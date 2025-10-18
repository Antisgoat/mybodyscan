import { getApp, type FirebaseApp } from "firebase/app";
import { signInWithEmailAndPassword, type Auth } from "firebase/auth";
import { type AppCheck } from "firebase/app-check";
import { type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { FUNCTIONS_BASE } from "@/lib/env";
import {
  getAppCheckInstance as getInitAppCheckInstance,
  getAuthSafe,
  getDbSafe,
  getFirebaseAppInstance,
  initFirebaseApp,
  isAppCheckInitialized,
} from "@/lib/appInit";

type FirebaseBundle = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
  appCheck: AppCheck | null;
};

const GLOBAL_KEY = "__MBS_FIREBASE__";

let firebaseBundle: FirebaseBundle | null = null;
let firebaseBundlePromise: Promise<FirebaseBundle> | null = null;

export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let functions: Functions;
export let storage: FirebaseStorage;

async function createFirebaseBundle(): Promise<FirebaseBundle> {
  await initFirebaseApp();
  const firebaseApp = getFirebaseAppInstance() ?? getApp();

  const authInstance = await getAuthSafe();
  const firestore = await getDbSafe();
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
    appCheck: getInitAppCheckInstance(),
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
  return getInitAppCheckInstance();
}

export function isFirebaseAppCheckReady(): boolean {
  return isAppCheckInitialized();
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
