import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseConfig } from "../config/firebaseConfig";

let appInstance: FirebaseApp | null = null;
let appCheckInstance: AppCheck | null = null;
let appCheckInitialized = false;
let ready: Promise<void> | null = null;

function resolveApp(): FirebaseApp {
  if (appInstance) {
    return appInstance;
  }
  const existing = getApps();
  appInstance = existing.length ? getApp() : initializeApp(getFirebaseConfig());
  return appInstance;
}

async function setupAppCheck(app: FirebaseApp) {
  if (typeof window === "undefined") {
    appCheckInstance = null;
    appCheckInitialized = false;
    return;
  }
  try {
    const key = (import.meta.env.VITE_RECAPTCHA_KEY || "").trim();
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(key || "dummy-key"),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    appCheckInstance = null;
    appCheckInitialized = false;
    if (import.meta.env.DEV) {
      console.warn("[appInit] App Check init skipped (soft mode)", error);
    }
  }
}

async function setupPersistence(app: FirebaseApp) {
  try {
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[appInit] Unable to enforce local persistence", error);
    }
  }
}

export function initFirebaseApp(): Promise<void> {
  if (ready) {
    return ready;
  }
  ready = (async () => {
    const app = resolveApp();
    await Promise.all([setupAppCheck(app), setupPersistence(app)]);
  })();
  return ready;
}

export async function getAuthSafe(): Promise<Auth> {
  await initFirebaseApp();
  return getAuth(resolveApp());
}

export async function getDbSafe(): Promise<Firestore> {
  await initFirebaseApp();
  return getFirestore(resolveApp());
}

export function getFirebaseAppInstance(): FirebaseApp | null {
  return appInstance;
}

export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}

export function isAppCheckInitialized(): boolean {
  return appCheckInitialized;
}

export async function waitForFirebaseReady(): Promise<void> {
  await initFirebaseApp();
  await ready;
}
