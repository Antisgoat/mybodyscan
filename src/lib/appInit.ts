import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFirebaseConfig } from "@/config/firebaseConfig";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const readyDeferred = createDeferred<void>();

let appInstance: FirebaseApp | null = null;
let appCheckInstance: AppCheck | null = null;
let appCheckReady = false;
let initPromise: Promise<FirebaseApp> | null = null;

function finishReady() {
  if (!appCheckReady) {
    appCheckReady = true;
    readyDeferred.resolve();
  }
}

async function setupAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  if (typeof window === "undefined") {
    appCheckInstance = null;
    return null;
  }

  if (appCheckInstance) {
    return appCheckInstance;
  }

  try {
    if (import.meta.env.DEV) {
      try {
        const debugToken = window.localStorage?.getItem("firebaseAppCheckDebugToken");
        if (debugToken) {
          (window as typeof window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
            debugToken === "1" || debugToken === "true" ? true : debugToken;
        }
      } catch (error) {
        console.warn("[firebase] Unable to read App Check debug token", error);
      }
    }

    const siteKey = import.meta.env.VITE_RECAPTCHA_KEY || "dummy-recaptcha-key";
    const provider = new ReCaptchaV3Provider(siteKey);
    appCheckInstance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[firebase] App Check initialization failed (soft mode)", error);
    }
    appCheckInstance = null;
  }

  return appCheckInstance;
}

async function ensureAppInitialized(): Promise<FirebaseApp> {
  if (appInstance) {
    return appInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const config = getFirebaseConfig();
      const existing = getApps();
      const app = existing.length ? getApp() : initializeApp(config);
      appInstance = app;
      try {
        await setupAppCheck(app);
      } finally {
        finishReady();
      }
      return app;
    })().catch((error) => {
      finishReady();
      throw error;
    });
  }

  return initPromise;
}

export const readyPromise = readyDeferred.promise;

export async function ensureFirebaseReady(): Promise<FirebaseApp> {
  const app = await ensureAppInitialized();
  await readyPromise;
  return app;
}

export async function getFirebaseApp(): Promise<FirebaseApp> {
  return ensureFirebaseReady();
}

export async function getAuthSafe() {
  const app = await ensureFirebaseReady();
  return getAuth(app);
}

export async function getDbSafe() {
  const app = await ensureFirebaseReady();
  return getFirestore(app);
}

export function getAppCheckInstance(): AppCheck | null {
  return appCheckInstance;
}

export function isAppCheckReady(): boolean {
  return appCheckReady;
}
