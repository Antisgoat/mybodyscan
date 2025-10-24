import type { FirebaseOptions } from "firebase/app";

import { FIREBASE_PUBLIC_CONFIG } from "@/config/firebase.public";

function env(name: string): string | undefined {
  return (import.meta as any)?.env?.[name];
}

export function mergedFirebaseConfig(): FirebaseOptions {
  const envConfig = {
    apiKey: env("VITE_FIREBASE_API_KEY"),
    authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: env("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("VITE_FIREBASE_APP_ID"),
    measurementId: env("VITE_FIREBASE_MEASUREMENT_ID"),
  } as const;

  if (!envConfig.apiKey) return FIREBASE_PUBLIC_CONFIG;

  const cfg: FirebaseOptions = {
    apiKey: envConfig.apiKey!,
    authDomain: envConfig.authDomain!,
    projectId: envConfig.projectId!,
    storageBucket: envConfig.storageBucket!,
    messagingSenderId: envConfig.messagingSenderId!,
    appId: envConfig.appId!,
  };

  if (envConfig.measurementId) cfg.measurementId = envConfig.measurementId;

  return cfg;
}

export const firebaseConfig = mergedFirebaseConfig();
