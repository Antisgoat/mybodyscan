export const DEMO_MODE: boolean =
  String(import.meta.env.VITE_DEMO_MODE ?? "false").toLowerCase() === "true";

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
  import.meta.env.VITE_APPLE_OAUTH_ENABLED,
  false,
);

const rawAuthorizedHosts = (import.meta.env.VITE_OAUTH_AUTHORIZED_HOSTS as string | undefined) ?? "";

export const OAUTH_AUTHORIZED_HOSTS = rawAuthorizedHosts
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
