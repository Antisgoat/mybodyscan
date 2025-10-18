export type FirebaseWebEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

type FirebaseConfigMeta = {
  missingEnvKeys: string[];
  usedFallbackKeys: string[];
  storageBucketInput: string;
  storageBucketNormalized: string;
  normalizedFrom?: string | null;
};

const DEFAULTS: FirebaseWebEnv = {
  apiKey: "AIzaSyDA90cwKTCQ9tGfUx66PDmfGwUoiTbhafE",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
};

const REQUIRED_KEYS: (keyof FirebaseWebEnv)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

function readEnv(key: string): string | undefined {
  const raw = (import.meta.env as Record<string, unknown> | undefined)?.[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const FALLBACK: FirebaseWebEnv = {
  apiKey: readEnv("VITE_FIREBASE_API_KEY") || DEFAULTS.apiKey,
  authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN") || DEFAULTS.authDomain,
  projectId: readEnv("VITE_FIREBASE_PROJECT_ID") || DEFAULTS.projectId,
  storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET") || DEFAULTS.storageBucket,
  messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") || DEFAULTS.messagingSenderId,
  appId: readEnv("VITE_FIREBASE_APP_ID") || DEFAULTS.appId,
  measurementId: readEnv("VITE_FIREBASE_MEASUREMENT_ID") || DEFAULTS.measurementId,
};

function requiredMissing(cfg: FirebaseWebEnv) {
  return (REQUIRED_KEYS as readonly (keyof FirebaseWebEnv)[]).filter((key) => {
    const value = cfg[key];
    return !value || String(value).trim() === "";
  });
}

let cached: { config: FirebaseWebEnv; meta: FirebaseConfigMeta } | null = null;

function resolveFirebaseConfig(): { config: FirebaseWebEnv; meta: FirebaseConfigMeta } {
  if (cached) return cached;

  const rawEntries: FirebaseWebEnv = { ...FALLBACK };
  const missingEnvKeys: string[] = [];
  const usedFallbackKeys: string[] = [];

  (REQUIRED_KEYS as readonly (keyof FirebaseWebEnv)[]).forEach((key) => {
    const envKey = `VITE_FIREBASE_${key.toString().toUpperCase()}`;
    const envValue = readEnv(envKey);
    if (!envValue) {
      missingEnvKeys.push(envKey);
      usedFallbackKeys.push(String(key));
    }
  });
  const measurementEnv = readEnv("VITE_FIREBASE_MEASUREMENT_ID");
  if (!measurementEnv && FALLBACK.measurementId) {
    usedFallbackKeys.push("measurementId");
    missingEnvKeys.push("VITE_FIREBASE_MEASUREMENT_ID");
  }

  const config: FirebaseWebEnv = { ...rawEntries };
  const meta: FirebaseConfigMeta = {
    missingEnvKeys,
    usedFallbackKeys,
    storageBucketInput: rawEntries.storageBucket,
    storageBucketNormalized: rawEntries.storageBucket,
    normalizedFrom: null,
  };

  if (config.storageBucket.endsWith("firebasestorage.app")) {
    meta.normalizedFrom = config.storageBucket;
    config.storageBucket = `${config.projectId}.appspot.com`;
    meta.storageBucketNormalized = config.storageBucket;
  }

  const miss = requiredMissing(config);
  if (miss.length) {
    const missingKeys = miss.map((key) => String(key));
    const err: Error & { code?: string; details?: { missing: string[] } } = new Error(
      "config/missing-firebase-config",
    );
    err.code = "config/missing-firebase-config";
    err.details = { missing: missingKeys };
    throw err;
  }

  cached = { config, meta };
  return cached;
}

export function getFirebaseConfig(): FirebaseWebEnv {
  return { ...resolveFirebaseConfig().config };
}

export function getFirebaseConfigMissingEnvKeys(): string[] {
  return Array.from(new Set(resolveFirebaseConfig().meta.missingEnvKeys));
}

export function describeFirebaseConfig() {
  const snapshot = resolveFirebaseConfig();
  const host = typeof window !== "undefined" ? window.location.host : "ssr";
  return {
    host,
    projectId: snapshot.config.projectId,
    appId: snapshot.config.appId,
    authDomain: snapshot.config.authDomain,
    storageBucket: snapshot.config.storageBucket,
    storageBucketInput: snapshot.meta.storageBucketInput,
    normalizedFrom: snapshot.meta.normalizedFrom,
    missingEnvKeys: snapshot.meta.missingEnvKeys,
    usingFallbackKeys: snapshot.meta.usedFallbackKeys,
  } as const;
}

export const FIREBASE_FALLBACK_CONFIG = { ...FALLBACK };
