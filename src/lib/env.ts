import { APP_CONFIG } from "@/generated/appConfig";
import {
  getFunctionsBaseUrl,
  getFunctionsOrigin,
  getFunctionsProjectId,
  getFunctionsRegion,
  urlJoin,
} from "@/lib/config/functionsOrigin";

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
  // Keep this list minimal: the app can still boot using the baked-in fallback
  // Firebase web config (or injected runtime config). These checks are for
  // catching misconfigured deployments, not blocking optional features.
  const missing: string[] = [];
  if (!String(APP_CONFIG.firebase.apiKey || "").trim()) {
    missing.push("VITE_FIREBASE_API_KEY");
  }
  if (!String(APP_CONFIG.firebase.authDomain || "").trim()) {
    missing.push("VITE_FIREBASE_AUTH_DOMAIN");
  }
  if (!String(APP_CONFIG.firebase.projectId || "").trim()) {
    missing.push("VITE_FIREBASE_PROJECT_ID");
  }
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
  return urlJoin(getFunctionsBaseUrl(), path);
}

export const functionsRegion = getFunctionsRegion();
function safeReadFunctions<T>(reader: () => T, fallback: T): T {
  try {
    return reader();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("functions_origin_resolution_failed", error);
    }
    return fallback;
  }
}

export const functionsOrigin = trim(
  safeReadFunctions(() => getFunctionsOrigin().origin, "")
);
export const functionsBaseUrl = trim(safeReadFunctions(() => getFunctionsBaseUrl(), ""));
export const functionsProjectId = trim(safeReadFunctions(() => getFunctionsProjectId(), ""));
