import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { envConfig, isValid, fetchHostingConfig } from "./firebaseConfig";
import { missingEnvVars } from "./env";

let appPromise: Promise<import("firebase/app").FirebaseApp>;

async function init() {
  const env = envConfig();
  if (isValid(env)) return getApps()[0] ?? initializeApp(env);
  const hosting = await fetchHostingConfig();
  if (hosting && isValid(hosting)) return getApps()[0] ?? initializeApp(hosting);
  console.warn("Firebase config missing/invalid; UI will run with disabled auth.");
  return getApps()[0] ?? initializeApp({ apiKey: "invalid", appId: "invalid", projectId: "mybodyscan-f3daf" } as any);
}

appPromise = init();

export async function getFirebase() {
  const app = await appPromise;
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app)
  };
}

const app = await appPromise;
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export { missingEnvVars };
