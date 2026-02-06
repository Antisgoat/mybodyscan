import { APP_CONFIG, BUILD_META } from "@/generated/appConfig";
import { ENV } from "@/lib/env";

type FirebaseRuntimeConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
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

const firebaseConfig: FirebaseRuntimeConfig = {
  ...(APP_CONFIG.firebase as FirebaseRuntimeConfig),
};

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return String(value).trim() === "";
}

const runtimeEnvConfig: FirebaseRuntimeConfig = {
  apiKey: ENV.VITE_FIREBASE_API_KEY,
  authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.VITE_FIREBASE_APP_ID,
  measurementId: ENV.VITE_FIREBASE_MEASUREMENT_ID,
};

for (const [key, value] of Object.entries(runtimeEnvConfig)) {
  const typedKey = key as keyof FirebaseRuntimeConfig;
  if (isMissing(firebaseConfig[typedKey]) && !isMissing(value)) {
    firebaseConfig[typedKey] = value;
  }
}

const runtimeAuthDomain = resolveRuntimeAuthDomain();
const configuredAuthDomain = firebaseConfig.authDomain;

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

export function setFirebaseInitError(error: string | null): void {
  firebaseInitError = error;
}

export function getFirebaseInitError(): string | null {
  return (
    firebaseInitError ||
    (hasFirebaseConfig
      ? null
      : `Missing Firebase config keys: ${firebaseConfigMissingKeys.join(", ")}`)
  );
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
    const keys = [
      "apiKey",
      "authDomain",
      "projectId",
      "storageBucket",
      "messagingSenderId",
      "appId",
      "measurementId",
    ] as const;
    const present = keys.filter((key) => !isMissing((firebaseConfig as any)?.[key]));
    const missing = keys.filter((key) => isMissing((firebaseConfig as any)?.[key]));
    console.info("[firebase] config keys", { present, missing });
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

let loggedInfo = false;
export function logFirebaseRuntimeInfo(): void {
  if (!import.meta.env?.DEV || loggedInfo) return;
  const { projectId: pid, authDomain } = firebaseConfig;
  console.info(`[firebase] project=${pid} authDomain=${authDomain}`);
  loggedInfo = true;
}

export function getFirebaseConfig() {
  return firebaseConfig;
}

export const firebaseApiKey = firebaseConfig.apiKey;

let loggedBuildInfo = false;
export function logBuildMetaOnce(): void {
  if (loggedBuildInfo) return;
  loggedBuildInfo = true;
  try {
    console.info(
      `[MBS] build mode=${BUILD_META.mode} native=${BUILD_META.isNative}`
    );
    console.info(
      `[MBS] firebase config apiKey=${Boolean(
        firebaseConfig.apiKey
      )} projectId=${firebaseConfig.projectId || ""}`
    );
  } catch {
    // ignore
  }
}

export { firebaseConfig };
