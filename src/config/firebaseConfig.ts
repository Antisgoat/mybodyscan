import type { FirebaseOptions } from "firebase/app";

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
  internalBucket?: string | null;
};

const FALLBACK_CONFIG: FirebaseWebEnv = {
  apiKey: "AIzaSyDA90cwKTCQ9tGfUx66PDmfGwUoiTbhafE",
  authDomain: "mybodyscan-f3daf.firebaseapp.com",
  projectId: "mybodyscan-f3daf",
  storageBucket: "mybodyscan-f3daf.appspot.com",
  messagingSenderId: "157018993008",
  appId: "1:157018993008:web:8bed67e098ca04dc4b1fb5",
  measurementId: "G-TV8M3PY1X3",
};

type ResolvedFirebaseConfig = {
  config: FirebaseWebEnv;
  meta: FirebaseConfigMeta;
};

function readEnv(key: string): string | undefined {
  const raw = (import.meta.env as Record<string, unknown> | undefined)?.[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const REQUIRED_KEYS: (keyof FirebaseWebEnv)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

let cached: ResolvedFirebaseConfig | null = null;

function resolveConfig(): ResolvedFirebaseConfig {
  if (cached) {
    return cached;
  }

  const missingEnvKeys: string[] = [];
  const usedFallbackKeys: string[] = [];

  const entries: FirebaseWebEnv = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: undefined,
  };

  (Object.keys(entries) as (keyof FirebaseWebEnv)[]).forEach((key) => {
    const envKey =
      key === "measurementId" ? "VITE_FIREBASE_MEASUREMENT_ID" : `VITE_FIREBASE_${key.toString().toUpperCase()}`;
    const fromEnv = readEnv(envKey);
    if (!fromEnv) {
      missingEnvKeys.push(envKey);
      usedFallbackKeys.push(key as string);
    }
    const fallbackValue = FALLBACK_CONFIG[key as keyof FirebaseWebEnv];
    const value = fromEnv ?? fallbackValue ?? "";
    (entries as FirebaseOptions)[key] = value as any;
  });

  let storageBucketInput = String(entries.storageBucket || "");
  let storageBucketNormalized = storageBucketInput;
  let internalBucket: string | null = null;

  if (storageBucketNormalized.endsWith("firebasestorage.app")) {
    const projectId = entries.projectId || FALLBACK_CONFIG.projectId;
    if (projectId) {
      internalBucket = `${projectId}.appspot.com`;
      storageBucketNormalized = internalBucket;
    }
  }

  entries.storageBucket = storageBucketNormalized;

  const missingRequired = REQUIRED_KEYS.filter((key) => {
    const value = entries[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingRequired.length > 0) {
    const error: Error & {
      code?: string;
      missingKeys?: string[];
      missingEnvKeys?: string[];
    } = new Error(`Missing Firebase config keys: ${missingRequired.join(", ")}`);
    error.code = "config/missing-firebase-config";
    error.missingKeys = missingRequired;
    error.missingEnvKeys = missingEnvKeys;
    throw error;
  }

  cached = {
    config: {
      apiKey: entries.apiKey,
      authDomain: entries.authDomain,
      projectId: entries.projectId,
      storageBucket: entries.storageBucket,
      messagingSenderId: entries.messagingSenderId,
      appId: entries.appId,
      ...(entries.measurementId ? { measurementId: entries.measurementId } : {}),
    },
    meta: {
      missingEnvKeys,
      usedFallbackKeys,
      storageBucketInput,
      storageBucketNormalized,
      internalBucket,
    },
  };

  return cached;
}

export function getFirebaseConfig(): FirebaseWebEnv {
  return resolveConfig().config;
}

export function getFirebaseConfigMeta(): FirebaseConfigMeta {
  return resolveConfig().meta;
}

export function getFirebaseConfigMissingEnvKeys(): string[] {
  return [...resolveConfig().meta.missingEnvKeys];
}

export function describeFirebaseConfig() {
  const { config, meta } = resolveConfig();
  const host = typeof window !== "undefined" ? window.location.host : "ssr";
  return {
    host,
    projectId: config.projectId,
    appId: config.appId,
    authDomain: config.authDomain,
    storageBucket: config.storageBucket,
    storageBucketInput: meta.storageBucketInput,
    bucketNormalizedFrom: meta.internalBucket ? meta.storageBucketInput : null,
    missingEnvKeys: meta.missingEnvKeys,
    usingFallbackKeys: meta.usedFallbackKeys,
  } as const;
}

export const FIREBASE_FALLBACK_CONFIG = FALLBACK_CONFIG;
