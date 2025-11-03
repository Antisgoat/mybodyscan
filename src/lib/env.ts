const env = (import.meta as any)?.env ?? {};

const publishableKey: string =
  env.VITE_STRIPE_PK || env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const commitSha: string = env.VITE_COMMIT_SHA || env.COMMIT_SHA || "";
const fallbackVersion: string = env.VITE_APP_VERSION || "";
const buildTimeEnv: string = env.VITE_BUILD_TIME || env.BUILD_TIME || "";
const functionsOriginEnv: string = env.VITE_FUNCTIONS_ORIGIN || env.FUNCTIONS_ORIGIN || "";
const functionsBaseEnv: string = env.VITE_FUNCTIONS_BASE_URL || env.FUNCTIONS_BASE_URL || "";
const functionsRegion: string = env.VITE_FUNCTIONS_REGION || env.FUNCTIONS_REGION || "us-central1";
const projectId: string = env.VITE_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID || "";

export const isStripeTest = publishableKey.startsWith("pk_test_");
export const isStripeLive = publishableKey.startsWith("pk_live_");

export const publishableKeySuffix = publishableKey ? publishableKey.slice(-6) : "";

export const buildHash =
  commitSha && commitSha.length >= 7
    ? commitSha.slice(0, 7)
    : fallbackVersion && fallbackVersion.length >= 4
    ? fallbackVersion
    : "dev";

export const buildTimestamp = buildTimeEnv || "";

export function describeStripeEnvironment(): "test" | "live" | "custom" | "missing" {
  if (isStripeTest) return "test";
  if (isStripeLive) return "live";
  if (publishableKey) return "custom";
  return "missing";
}

export function fnUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = functionsOriginEnv.trim().replace(/\/?$/, "");
  if (origin) {
    return `${origin}${normalized}`;
  }
  const base = functionsBaseEnv.trim().replace(/\/?$/, "");
  if (base) {
    return `${base}${normalized}`;
  }
  if (projectId) {
    return `https://${functionsRegion}-${projectId}.cloudfunctions.net${normalized}`;
  }
  return normalized;
}
