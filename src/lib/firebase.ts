import type { FirebaseApp } from "firebase/app";
import { signInWithEmailAndPassword, type Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import type { FirebaseStorage } from "firebase/storage";
import {
  getAppCheckInstance as getAppCheckInstanceInternal,
  getAuthSafe,
  getFirebaseBundle,
  getFirestoreSafe,
  getFunctionsSafe,
  getStorageSafe,
  initFirebaseApp,
  isAppCheckInitialized,
} from "@/lib/appInit";

export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let functions: Functions;
export let storage: FirebaseStorage;

void initFirebaseApp()
  .then((bundle) => {
    app = bundle.app;
    auth = bundle.auth;
    db = bundle.firestore;
    functions = bundle.functions;
    storage = bundle.storage;
  })
  .catch((error) => {
    if (import.meta.env.DEV) {
      console.error("[firebase] initialization failed", error);
    }
  });

export { initFirebaseApp };
export { getAuthSafe, getFirestoreSafe, getFunctionsSafe, getStorageSafe };

export function getAppCheckInstance() {
  return getAppCheckInstanceInternal();
}

export function isFirebaseAppCheckReady(): boolean {
  return isAppCheckInitialized();
}

export function getFirebaseBundleSafe() {
  return getFirebaseBundle();
}

export async function safeEmailSignIn(email: string, password: string) {
  const authInstance = await getAuthSafe();
  try {
    return await signInWithEmailAndPassword(authInstance, email, password);
  } catch (err: any) {
    if (err?.code === "auth/network-request-failed") {
      await new Promise((r) => setTimeout(r, 1000));
      return await signInWithEmailAndPassword(authInstance, email, password);
    }
    throw err;
  }
}
