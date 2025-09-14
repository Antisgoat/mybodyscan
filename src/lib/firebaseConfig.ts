export type FirebaseCfg = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

export function envConfig(): Partial<FirebaseCfg> {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export function isValid(c: any): c is FirebaseCfg {
  return !!c?.apiKey && !!c?.appId && !!c?.projectId;
}

export async function fetchHostingConfig(): Promise<FirebaseCfg | null> {
  try {
    const r = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      apiKey: j.apiKey,
      authDomain: j.authDomain,
      projectId: j.projectId,
      storageBucket: j.storageBucket,
      messagingSenderId: j.messagingSenderId,
      appId: j.appId,
    };
  } catch {
    return null;
  }
}

