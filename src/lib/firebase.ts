import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { envConfig, isValid, fetchHostingConfig, type FirebaseCfg } from "./firebaseConfig";
import { getEnv, missingEnvVars } from "./env";

// Initialize config synchronously first
let config: Partial<FirebaseCfg> | FirebaseCfg = envConfig();

export const isFirebaseConfigured = isValid(config);

if (!isFirebaseConfigured) {
  console.warn("Firebase config missing; using placeholder so UI can render.");
  config = {
    apiKey: "invalid",
    appId: "invalid",
    projectId: "mybodyscan-f3daf",
  } as any;
}

// Initialize Firebase with current config
export const app = initializeApp(config as FirebaseCfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const firebaseConfig = config as FirebaseCfg;

// Attempt to load hosting config asynchronously in background (non-blocking)
if (!isFirebaseConfigured && typeof window !== "undefined") {
  fetchHostingConfig().then((hostingConfig) => {
    if (hostingConfig && isValid(hostingConfig)) {
      console.log("Firebase hosting config found but app already initialized with placeholder");
    }
  }).catch(() => {
    // Silently ignore - placeholder config already in use
  });
}

let warned = false;
const appCheckKey = getEnv("VITE_APPCHECK_SITE_KEY");
if (typeof window !== "undefined") {
  if (appCheckKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (!warned && import.meta.env.DEV) {
    warned = true;
    console.warn("App Check site key missing; requests are not protected. See README to enable.");
  }
}

export { missingEnvVars };

const ready = Promise.resolve({ app, auth, db, storage });
export function getFirebase() {
  return ready;
}
