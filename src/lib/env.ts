function readRawEnv(name: string): unknown {
  const env = (import.meta.env as Record<string, unknown>) || {};
  return env?.[name];
}

export function getViteEnv(name: string): string | undefined {
  const raw = readRawEnv(name);
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
}

const rawFunctionsBase = getViteEnv("VITE_FUNCTIONS_BASE_URL") ?? "";

/** Cloud Functions base URL without trailing slash. */
export const FUNCTIONS_BASE: string = rawFunctionsBase.replace(/\/+$/, "");

/** Build a URL to a function path. Returns '' if base is missing. */
export function fnUrl(path: string): string {
  if (!FUNCTIONS_BASE) {
    console.warn("[ENV] VITE_FUNCTIONS_BASE_URL missing; skipping network call for", path);
    return "";
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${FUNCTIONS_BASE}${p}`;
}

export function getUsdaApiKey(): string | null {
  const value = getViteEnv("VITE_USDA_API_KEY");
  return value ?? null;
}

export const HAS_USDA = Boolean(getUsdaApiKey());

export const ALLOWED_HOSTS: string[] = (getViteEnv("VITE_AUTH_ALLOWED_HOSTS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
