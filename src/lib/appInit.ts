import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getToken,
  initializeAppCheck,
  onTokenChanged,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
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

async function setupAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  if (typeof window === "undefined") {
    appCheckInstance = null;
    appCheckInitialized = false;
    return appCheckInstance;
  }
  try {
    const key = (import.meta.env.VITE_RECAPTCHA_KEY || "").trim();
    const inst = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(key || "dummy-key"),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInstance = inst;
    appCheckInitialized = true;
    return inst;
  } catch (error) {
    appCheckInstance = null;
    appCheckInitialized = false;
    if (import.meta.env.DEV) {
      console.warn("[appInit] App Check init skipped (soft mode)", error);
    }
    return appCheckInstance;
  }
}

async function waitForAppCheckToken(
  appCheck: ReturnType<typeof initializeAppCheck>,
  { timeoutMs = 1500 } = {}
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    try {
      const unsub = onTokenChanged(appCheck, () => {
        unsub?.();
        done();
      });
      getToken(appCheck, /*forceRefresh=*/ true).finally(() => {});
    } catch {
      // no-op; keep timeout fallback
    }
    setTimeout(done, timeoutMs);
  });
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
    const appCheck = await setupAppCheck(app);
    if (appCheck) {
      // We wait briefly for an App Check token (or timeout) to avoid early Auth network calls causing
      // `auth/network-request-failed` on first load.
      await waitForAppCheckToken(appCheck);
    }
    await setupPersistence(app);
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
