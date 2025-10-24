import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

import { isWeb, isNative } from "./platform";
import { APPCHECK_SITE_KEY } from "./flags";
import { firebaseConfig } from "./firebaseConfig";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let appCheckInstance: AppCheck | null = null;
let appCheckInitAttempted = false;
let appCheckReady = false;
let appCheckError: unknown = null;
const appCheckWaiters: Array<() => void> = [];

function resolveAppCheckReady() {
  if (appCheckReady) return;
  appCheckReady = true;
  while (appCheckWaiters.length) {
    const resolve = appCheckWaiters.shift();
    resolve?.();
  }
}

function initApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

function initAppCheckSoft(appInstance: FirebaseApp): AppCheck | null {
  if (appCheckInitAttempted) {
    return appCheckInstance;
  }
  appCheckInitAttempted = true;

  if (!isWeb || !APPCHECK_SITE_KEY) {
    resolveAppCheckReady();
    return null;
  }

  try {
    appCheckInstance = initializeAppCheck(appInstance, {
      provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    appCheckError = error;
    // eslint-disable-next-line no-console
    console.warn("[boot] AppCheck init failed (soft):", error);
  } finally {
    resolveAppCheckReady();
  }

  return appCheckInstance;
}

function initAuth(appInstance: FirebaseApp): Auth {
  if (!auth) {
    const instance = getAuth(appInstance);
    void setPersistence(instance, browserLocalPersistence).catch(() => {
      // Persistence failures are non-fatal; Firebase will fall back automatically.
    });
    auth = instance;
  }
  return auth;
}

const firebaseApp = initApp();
const firebaseAppCheck = initAppCheckSoft(firebaseApp);
const firebaseAuth = initAuth(firebaseApp);

if (isNative && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log("[Native] Skipping web-only Firebase setup (service workers, App Check)");
}

const firestore = getFirestore(firebaseApp);
const storageBucket = getStorage(firebaseApp);
const cloudFunctions = getFunctions(firebaseApp, "us-central1");

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  if (isNative) {
    return signInWithRedirect(firebaseAuth, googleProvider);
  }
  return signInWithPopup(firebaseAuth, googleProvider);
}

export function ensureAppCheckInit(): void {
  initAppCheckSoft(firebaseApp);
}

export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}

export function getAppCheckError(): unknown {
  return appCheckError;
}

export function isAppCheckActive(): boolean {
  return appCheckInstance !== null;
}

export function isAppCheckReady(): boolean {
  return appCheckReady;
}

export function waitForAppCheckReady(): Promise<void> {
  if (appCheckReady) return Promise.resolve();
  return new Promise<void>((resolve) => {
    appCheckWaiters.push(resolve);
  });
}

export { firebaseConfig };
export { firebaseApp as app, firebaseAuth as auth, firestore as db, storageBucket as storage, cloudFunctions as functions };
export { firebaseAppCheck as appCheckInstance };
