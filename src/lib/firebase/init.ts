import { initializeApp, getApps } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const appCheckReady = Promise.resolve();

let _auth: Auth | null = null;
export const getSequencedAuth = async (): Promise<Auth> => {
  await appCheckReady;
  if (!_auth) {
    _auth = getAuth(app);
    await setPersistence(_auth, browserLocalPersistence);
    if (typeof window !== "undefined") console.log("[init] Auth ready (after AppCheck: disabled)");
  }
  return _auth!;
};

// Optional: one-time breadcrumb so QA can see build-time env
if (typeof window !== "undefined") {
  console.log("[init] Build env:", {
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  });
  (async () => {
    try {
      const r = await fetch("/__/firebase/init.json", { cache: "no-store" });
      const j = await r.json();
      console.log("[firebase] runtime init.json:", { projectId: j?.projectId, authDomain: j?.authDomain, apiKey: j?.apiKey });
      if (import.meta.env.VITE_FIREBASE_PROJECT_ID && j?.projectId && import.meta.env.VITE_FIREBASE_PROJECT_ID !== j?.projectId) {
        console.warn("[firebase] MISMATCH: build projectId =", import.meta.env.VITE_FIREBASE_PROJECT_ID, "runtime projectId =", j?.projectId);
      }
    } catch (e) {
      console.warn("[firebase] failed to fetch runtime init.json", e);
    }
  })();
  console.log("[build] version:", (typeof (globalThis as any).__APP_VERSION__ !== "undefined" ? (globalThis as any).__APP_VERSION__ : "dev"));
}
