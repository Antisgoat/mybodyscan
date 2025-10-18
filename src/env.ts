import { ALLOWED_HOSTS, getViteEnv } from "@/lib/env";

// Centralized environment variable parser with safe defaults
export const ENV = {
  USDA: getViteEnv("VITE_USDA_API_KEY") || "",
  HOSTS: (getViteEnv("VITE_AUTH_ALLOWED_HOSTS") || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
  SENTRY_DSN: getViteEnv("VITE_SENTRY_DSN") || "",
  APPLE: String(getViteEnv("APPLE_OAUTH_ENABLED") || getViteEnv("VITE_APPLE_OAUTH_ENABLED") || "false") === "true",
  DEMO: String(getViteEnv("VITE_DEMO_MODE") || "false") === "true",
  FORCE_APPLE: String(getViteEnv("VITE_FORCE_APPLE_BUTTON") || "false") === "true",
  DEBUG_PANEL: String(getViteEnv("VITE_DEBUG_PANEL") || "false") === "true",
  API_BASE: getViteEnv("VITE_API_BASE") || "",
  FUNCTIONS_BASE: getViteEnv("VITE_FUNCTIONS_BASE_URL") || "",
} as const;

// Legacy exports for backward compatibility
const DEMO_FLAG = (getViteEnv("VITE_DEMO_MODE") ?? "false").toLowerCase();
export const DEMO_MODE: boolean = DEMO_FLAG === "true";

const normalizeBooleanEnv = (value: unknown, defaultValue = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return defaultValue;
};

const rawAppleFlag =
  getViteEnv("APPLE_OAUTH_ENABLED") ?? getViteEnv("VITE_APPLE_OAUTH_ENABLED");

export const APPLE_OAUTH_ENABLED = normalizeBooleanEnv(rawAppleFlag, false);

const rawAuthorizedHosts = getViteEnv("VITE_OAUTH_AUTHORIZED_HOSTS") ?? "";

export const OAUTH_AUTHORIZED_HOSTS = rawAuthorizedHosts
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

export { ALLOWED_HOSTS };
