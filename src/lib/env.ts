export type Env = {
  VITE_FIREBASE_API_KEY: string;
  VITE_FIREBASE_AUTH_DOMAIN: string;
  VITE_FIREBASE_PROJECT_ID: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  VITE_DEMO_MODE?: string;
  VITE_ENABLE_GOOGLE?: string;
  VITE_ENABLE_APPLE?: string;
  VITE_RECAPTCHA_SITE_KEY?: string;
  VITE_APPCHECK_DEBUG_TOKEN?: string;
};

const e = ((import.meta as any)?.env ?? {}) as Record<string, unknown>;

export const ENV = new Proxy(e, {
  get(_, key: string) {
    const value = e[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    return "";
  },
}) as unknown as Env;

function readEnv(key: string): string {
  const fromImport = e[key];
  if (typeof fromImport === "string") return fromImport;
  if (typeof fromImport === "number" || typeof fromImport === "boolean")
    return String(fromImport);
  if (
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env[key] === "string"
  ) {
    return process.env[key] as string;
  }
  return "";
}

export function assertEnv(): void {
  const required = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ];
  const missing = required.filter((key) => !readEnv(key).trim());
  const isProd = Boolean((import.meta as any)?.env?.PROD);
  if (missing.length && isProd) {
    console.error("Missing required env:", missing.join(", "));
  }
}

const publishableKey =
  readEnv("VITE_STRIPE_PK") || readEnv("VITE_STRIPE_PUBLISHABLE_KEY");
const commitSha =
  readEnv("VITE_BUILD_SHA") ||
  readEnv("VITE_COMMIT_SHA") ||
  readEnv("COMMIT_SHA");
const fallbackVersion = readEnv("VITE_APP_VERSION");
const buildTimeEnv = readEnv("VITE_BUILD_TIME") || readEnv("BUILD_TIME");
const functionsUrlEnv =
  readEnv("VITE_FUNCTIONS_URL") || readEnv("FUNCTIONS_URL");
const functionsOriginEnv =
  readEnv("VITE_FUNCTIONS_ORIGIN") || readEnv("FUNCTIONS_ORIGIN");
const functionsBaseEnv =
  readEnv("VITE_FUNCTIONS_BASE_URL") || readEnv("FUNCTIONS_BASE_URL");
const functionsRegionEnv =
  readEnv("VITE_FUNCTIONS_REGION") ||
  readEnv("FUNCTIONS_REGION") ||
  "us-central1";
const projectIdEnv = (
  ENV.VITE_FIREBASE_PROJECT_ID || readEnv("FIREBASE_PROJECT_ID")
).trim();

const trim = (value: string) => value.trim();

export const isStripeTest = publishableKey.startsWith("pk_test_");
export const isStripeLive = publishableKey.startsWith("pk_live_");
export const publishableKeySuffix = publishableKey
  ? publishableKey.slice(-6)
  : "";

export const buildHash =
  commitSha && commitSha.length >= 7
    ? commitSha.slice(0, 7)
    : fallbackVersion && fallbackVersion.length >= 4
      ? fallbackVersion
      : "dev";

export const buildTimestamp = buildTimeEnv || "";

export function describeStripeEnvironment():
  | "test"
  | "live"
  | "custom"
  | "missing" {
  if (isStripeTest) return "test";
  if (isStripeLive) return "live";
  if (publishableKey) return "custom";
  return "missing";
}

export function fnUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const directUrl = trim(functionsUrlEnv).replace(/\/?$/, "");
  if (directUrl) {
    // FIX: Honor VITE_FUNCTIONS_URL overrides so workouts & other APIs hit the deployed backend instead of localhost defaults.
    return `${directUrl}${normalized}`;
  }
  const origin = trim(functionsOriginEnv).replace(/\/?$/, "");
  if (origin) {
    return `${origin}${normalized}`;
  }
  const base = trim(functionsBaseEnv).replace(/\/?$/, "");
  if (base) {
    return `${base}${normalized}`;
  }
  if (projectIdEnv) {
    return `https://${functionsRegionEnv}-${projectIdEnv}.cloudfunctions.net${normalized}`;
  }
  return normalized;
}

export const functionsRegion = functionsRegionEnv;
export const functionsOrigin = trim(functionsOriginEnv);
export const functionsBaseUrl = trim(functionsBaseEnv);
