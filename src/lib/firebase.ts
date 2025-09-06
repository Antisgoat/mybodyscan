// Firebase initialization - single source of truth
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAnalytics, isSupported } from "firebase/analytics";
import { assertEnv } from "./envGuard";

assertEnv();

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: env.VITE_FIREBASE_APP_ID as string,
  ...(env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string }
    : {}),
};

// Initialize Firebase only once
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

let warned = false;
const appCheckKey = env.VITE_APPCHECK_SITE_KEY as string | undefined;
if (typeof window !== "undefined") {
  if (appCheckKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (!warned) {
    warned = true;
    console.warn("App Check site key missing; requests are not protected. See README to enable.");
  }

  if (
    env.VITE_FIREBASE_MEASUREMENT_ID &&
    (location.protocol === "https:" || location.hostname === "localhost")
  ) {
    isSupported()
      .then((ok) => {
        if (ok) {
          try {
            getAnalytics(app);
          } catch (err) {
            console.warn("Analytics init failed", err);
          }
        }
      })
      .catch(() => {});
  }
}
