import { env } from "@/env";

type FirebaseRuntimeConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

type FirebaseApp = {
  options: FirebaseRuntimeConfig;
};

type Firestore = Record<string, never>;

type Functions = Record<string, never>;

type FirebaseStorage = {
  app?: FirebaseApp;
};

type Analytics = Record<string, never>;

const FALLBACK_FIREBASE_CONFIG: FirebaseRuntimeConfig = {
  apiKey: "AIzaSyCmtvkIuKNP-NRzH_yFUt4PyWdWCCeO0k8",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
};

const pickConfigValue = (
  ...candidates: Array<string | undefined | null | number | boolean>
): string | undefined => {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const asString = String(candidate).trim();
    if (asString) return asString;
  }
  return undefined;
};

const normalizeStorageBucket = (value?: string): string | undefined => {
  if (value == null) return value;
  let bucket = String(value).trim();
  if (!bucket) return undefined;
  if (bucket.startsWith("gs://")) bucket = bucket.slice(5);
  if (bucket.includes("://")) {
    try {
      const url = new URL(bucket);
      const path = url.pathname || "";
      const match =
        path.match(/\/v0\/b\/([^/]+)/) ||
        path.match(/\/upload\/storage\/v1\/b\/([^/]+)/) ||
        path.match(/\/b\/([^/]+)/);
      if (match?.[1]) {
        bucket = decodeURIComponent(match[1]);
      } else if (url.hostname) {
        bucket = url.hostname;
      }
    } catch {
      // ignore malformed URL
    }
  }
  if (bucket.endsWith(".firebasestorage.app")) {
    bucket = bucket.replace(/\.firebasestorage\.app$/, ".appspot.com");
  }
  return bucket;
};

const envConfig: Partial<FirebaseRuntimeConfig> = {
  apiKey: pickConfigValue(
    env.VITE_FIREBASE_API_KEY,
    import.meta.env.VITE_FIREBASE_API_KEY
  ),
  authDomain: pickConfigValue(
    env.VITE_FIREBASE_AUTH_DOMAIN,
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  ),
  projectId: pickConfigValue(
    env.VITE_FIREBASE_PROJECT_ID,
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  ),
  storageBucket: pickConfigValue(
    env.VITE_FIREBASE_STORAGE_BUCKET,
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: pickConfigValue(
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: pickConfigValue(
    env.VITE_FIREBASE_APP_ID,
    import.meta.env.VITE_FIREBASE_APP_ID
  ),
  measurementId: pickConfigValue(
    env.VITE_FIREBASE_MEASUREMENT_ID,
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  ),
};

const injectedConfig: Partial<FirebaseRuntimeConfig> | undefined =
  typeof globalThis !== "undefined"
    ? (((globalThis as any).__FIREBASE_CONFIG__ ||
        (globalThis as any).__FIREBASE_RUNTIME_CONFIG__) as
        | Partial<FirebaseRuntimeConfig>
        | undefined)
    : undefined;

function resolveRuntimeAuthDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname?.trim();
  if (!host) return undefined;
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1") return undefined;
  if (lower.endsWith(".local")) return undefined;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return undefined;
  return host;
}

const runtimeAuthDomain = resolveRuntimeAuthDomain();
const configuredAuthDomain = pickConfigValue(
  envConfig.authDomain,
  injectedConfig?.authDomain
);

const firebaseConfig: FirebaseRuntimeConfig = {
  ...(FALLBACK_FIREBASE_CONFIG as FirebaseRuntimeConfig),
  ...envConfig,
  ...(injectedConfig ?? {}),
};

if (runtimeAuthDomain) {
  if (
    configuredAuthDomain &&
    configuredAuthDomain.toLowerCase() !== runtimeAuthDomain.toLowerCase() &&
    typeof console !== "undefined"
  ) {
    console.warn("[firebase] authDomain overridden to same-origin", {
      configured: configuredAuthDomain,
      runtime: runtimeAuthDomain,
    });
  }
  firebaseConfig.authDomain = runtimeAuthDomain;
}

const normalizedStorageBucket = normalizeStorageBucket(firebaseConfig.storageBucket);
if (normalizedStorageBucket) {
  firebaseConfig.storageBucket = normalizedStorageBucket;
}

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return String(value).trim() === "";
}

for (const [key, fallbackValue] of Object.entries(FALLBACK_FIREBASE_CONFIG)) {
  const currentValue = (firebaseConfig as any)[key];
  if (isMissing(currentValue) && !isMissing(fallbackValue)) {
    (firebaseConfig as any)[key] = fallbackValue;
  }
}

const requiredKeys = ["apiKey", "authDomain", "projectId"] as const;
const warningKeys = [
  "storageBucket",
  "messagingSenderId",
  "appId",
  "measurementId",
] as const;

export const firebaseConfigMissingKeys: string[] = requiredKeys.filter((key) => {
  const value = (firebaseConfig as any)?.[key];
  return isMissing(value);
});

export const firebaseConfigWarningKeys: string[] = warningKeys.filter((key) => {
  const value = (firebaseConfig as any)?.[key];
  return isMissing(value);
});

export const hasFirebaseConfig: boolean =
  firebaseConfigMissingKeys.length === 0;

let firebaseInitError: string | null = null;

export function getFirebaseInitError(): string | null {
  return (
    firebaseInitError ||
    (hasFirebaseConfig
      ? null
      : `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`)
  );
}

export const app: FirebaseApp = { options: firebaseConfig };
export const firebaseApp: FirebaseApp = app;

export const db: Firestore = {} as Firestore;
export const functions: Functions = {} as Functions;
export const storage: FirebaseStorage = { app } as FirebaseStorage;

export async function getAnalyticsInstance(): Promise<Analytics | null> {
  return null;
}

let loggedConfigSummary = false;
function buildFirebaseConfigSummary(): Record<string, string> {
  const summary: Record<string, string> = {
    projectId: String(firebaseConfig.projectId || "").trim(),
    authDomain: String(firebaseConfig.authDomain || "").trim(),
  };
  const optional: Array<keyof FirebaseRuntimeConfig> = [
    "storageBucket",
    "messagingSenderId",
    "appId",
    "measurementId",
  ];
  for (const key of optional) {
    const value = String((firebaseConfig as any)?.[key] || "").trim();
    if (value) summary[key] = value;
  }
  return summary;
}

export function logFirebaseConfigSummary(): void {
  if (loggedConfigSummary) return;
  loggedConfigSummary = true;
  try {
    console.info("[firebase] config", buildFirebaseConfigSummary());
    if (firebaseConfigWarningKeys.length) {
      console.warn(
        "[firebase] Optional config keys missing; some features may be unavailable",
        firebaseConfigWarningKeys
      );
    }
  } catch {
    // ignore
  }
}

export async function firebaseReady(): Promise<void> {
  return;
}

export function getFirebaseApp(): FirebaseApp {
  return app;
}

export function getFirebaseFirestore(): Firestore {
  return db;
}

export function getFirebaseFunctions(): Functions {
  return functions;
}

export function getFirebaseStorage(): FirebaseStorage {
  return storage;
}

export function getFirebaseConfig() {
  return firebaseConfig;
}

export const firebaseApiKey = firebaseConfig.apiKey;

let loggedInfo = false;
export function logFirebaseRuntimeInfo(): void {
  if (!import.meta.env?.DEV || loggedInfo) return;
  const { projectId: pid, authDomain } = firebaseConfig;
  console.info(`[firebase] project=${pid} authDomain=${authDomain}`);
  loggedInfo = true;
}

const parseFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return fallback;
  if (["false", "0", "off", "no"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
};

export const providerFlags = {
  google: parseFlag(
    import.meta.env.VITE_ENABLE_GOOGLE ?? env.VITE_ENABLE_GOOGLE,
    true
  ),
  apple: parseFlag(
    import.meta.env.VITE_ENABLE_APPLE ?? env.VITE_ENABLE_APPLE,
    true
  ),
  email: parseFlag(
    import.meta.env.VITE_ENABLE_EMAIL ?? env.VITE_ENABLE_EMAIL,
    true
  ),
  demo: parseFlag(
    import.meta.env.VITE_ENABLE_DEMO ?? env.VITE_ENABLE_DEMO,
    true
  ),
};

export const envFlags = providerFlags;

export async function signInWithEmail(email: string, password: string) {
  void email;
  void password;
  throw new Error("signInWithEmail moved to the auth facade");
}

export function initFirebase() {
  return {
    app,
    db,
    storage,
    functions,
    analytics: null,
  };
}
