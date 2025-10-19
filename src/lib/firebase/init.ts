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

  try {
    const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;

    // If no key provided, SKIP App Check in production rather than crash.
    // (We keep soft enforcement; revisit when we add a site key.)
    if (!siteKey) {
      console.warn("[appcheck] No VITE_APPCHECK_SITE_KEY; skipping App Check (soft).");
      // Ensure downstream Auth init isn’t blocked:
      queueMicrotask(() => {
        if (typeof appCheckReadyResolve === "function") appCheckReadyResolve();
      });
      return null;
    }

    const ac = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    (onTokenChanged as unknown as (
      appCheck: AppCheck,
      nextOrObserver: Parameters<typeof onTokenChanged>[1],
      onlyOnce?: boolean
    ) => void)(
      ac as any,
      () => {
        if (typeof appCheckReadyResolve === "function") appCheckReadyResolve();
      },
      true
    );

    // Safety: resolve even if token event lags
    queueMicrotask(() => {
      if (typeof appCheckReadyResolve === "function") appCheckReadyResolve();
    });

    return ac;
  } catch (e) {
    console.error("[appcheck] init failed; continuing without App Check (soft).", e);
    // Do not block app boot:
    if (typeof appCheckReadyResolve === "function") appCheckReadyResolve();
    return null;
  }
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
