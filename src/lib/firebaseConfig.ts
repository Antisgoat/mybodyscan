import type { FirebaseOptions } from "firebase/app";

export function envConfig(): FirebaseOptions {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  } as FirebaseOptions;
}

export function isValid(cfg: FirebaseOptions | null | undefined): boolean {
  return !!cfg?.apiKey && !!cfg?.appId && !!cfg?.projectId;
}

export async function fetchHostingConfig(): Promise<FirebaseOptions | null> {
  try {
    const res = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      apiKey: data.apiKey,
      authDomain: data.authDomain,
      projectId: data.projectId,
      storageBucket: data.storageBucket,
      messagingSenderId: data.messagingSenderId,
      appId: data.appId,
    } as FirebaseOptions;
  } catch {
    return null;
  }
}

