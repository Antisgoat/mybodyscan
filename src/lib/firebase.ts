import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

function requiredEnv(name: string): string {
  const val = (import.meta as any).env?.[name];
  if (!val || String(val).trim() === "") {
    throw new Error(
      `Missing Firebase env configuration: ${name}. ` +
      `Add VITE_FIREBASE_* keys to your environment (see .env.example).`
    );
  }
  return val;
}

export const firebaseConfig: FirebaseOptions = {
  apiKey: requiredEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requiredEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requiredEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requiredEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requiredEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requiredEnv("VITE_FIREBASE_APP_ID"),
  // measurementId is optional
  ...((import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID
      ? { measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID }
      : {}),
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");
