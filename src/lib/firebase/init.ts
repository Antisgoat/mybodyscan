/* src/lib/firebase/init.ts */
import { initializeApp, getApps } from "firebase/app";
import { initializeAppCheck, onTokenChanged, type AppCheck } from "firebase/app-check";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

let appCheckReadyResolve!: () => void;
export const appCheckReady = new Promise<void>((res) => (appCheckReadyResolve = res));

function initAppCheckSoft(): AppCheck | null {
  if (typeof window === "undefined") return null;

  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY; // optional for now
  const ac = initializeAppCheck(app, {
    provider: siteKey ? new (window as any).RecaptchaV3Provider(siteKey) : undefined,
    isTokenAutoRefreshEnabled: true,
  });

  // Resolve when we observe an App Check token event (initial or refresh)
  onTokenChanged(ac as any, () => {
    if (appCheckReadyResolve) appCheckReadyResolve();
  }, true);

  // Also resolve on next microtask to avoid hanging if token event doesn’t fire (soft)
  queueMicrotask(() => {
    if (appCheckReadyResolve) appCheckReadyResolve();
  });

  return ac;
}

const _ac = initAppCheckSoft();

let _auth: Auth | null = null;
export const getSequencedAuth = async (): Promise<Auth> => {
  await appCheckReady;
  if (!_auth) {
    _auth = getAuth(app);
    await setPersistence(_auth, browserLocalPersistence);
    if (typeof window !== "undefined") console.log("[init] Auth ready (after AppCheck)");
  }
  return _auth!;
};
