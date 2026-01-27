import type { FirebaseApp } from "firebase/app";
import { getApp, getApps, initializeApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

import { firebaseConfig, logBuildMetaOnce, setFirebaseInitError } from "./config";

function assertFirestoreInstance(instance: Firestore): void {
  const hasApp = Boolean((instance as any)?.app);
  if (!hasApp) {
    throw new Error("[MBS] Firestore instance invalid (missing app)");
  }
}

let app: FirebaseApp;
try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  setFirebaseInitError(message);
  if (getApps().length) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

assertFirestoreInstance(db);
logBuildMetaOnce();

if (import.meta.env.DEV && typeof console !== "undefined") {
  console.info(
    `[MBS] web firebase init ok projectId=${firebaseConfig.projectId} hasApiKey=${Boolean(
      firebaseConfig.apiKey
    )}`
  );
}

export { app, auth, db };
