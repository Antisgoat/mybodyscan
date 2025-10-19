import { initializeApp, getApps } from "firebase/app";
import {
  initializeAppCheck,
  onTokenChanged,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
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

  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
  const provider = siteKey ? new ReCaptchaV3Provider(siteKey) : undefined;

  const ac = initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  // Resolve once we see any token event (initial/refresh)
  let unsubscribe: (() => void) | undefined;
  unsubscribe = onTokenChanged(ac as any, () => {
    if (appCheckReadyResolve) appCheckReadyResolve();
    if (unsubscribe) unsubscribe();
  });

  // Soft safety: resolve on next microtask so Auth is never blocked
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

// Optional: one-time breadcrumb so QA can see build-time env
if (typeof window !== "undefined") {
  console.log("[init] Build env:", {
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  });
}
