import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { envConfig, isValid, fetchHostingConfig } from "./firebaseConfig";
import { getEnv, missingEnvVars } from "./env";

let config = envConfig();
if (!isValid(config)) {
  const hosting = await fetchHostingConfig();
  if (hosting && isValid(hosting)) {
    config = hosting;
  }
}

export const isFirebaseConfigured = isValid(config);

if (!isFirebaseConfigured) {
  console.warn("Firebase config missing; using placeholder so UI can render.");
  config = {
    apiKey: "invalid",
    appId: "invalid",
    projectId: "mybodyscan-f3daf",
  } as any;
}

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const firebaseConfig = config;

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
