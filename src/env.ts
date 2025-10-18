import { ALLOWED_HOSTS, getViteEnv } from "@app/lib/env.ts";

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

export const APPLE_OAUTH_ENABLED = normalizeBooleanEnv(
  getViteEnv("VITE_APPLE_OAUTH_ENABLED"),
  false,
);

const rawAuthorizedHosts = getViteEnv("VITE_OAUTH_AUTHORIZED_HOSTS") ?? "";

export const OAUTH_AUTHORIZED_HOSTS = rawAuthorizedHosts
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

export { ALLOWED_HOSTS };
