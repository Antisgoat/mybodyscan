const USDA_KEY = import.meta.env.VITE_USDA_API_KEY ?? "";
const ALLOWED_HOSTS_RAW = import.meta.env.VITE_AUTH_ALLOWED_HOSTS ?? "";

function readRawEnv(name: string): unknown {
  if (name === "VITE_USDA_API_KEY") return USDA_KEY;
  if (name === "VITE_AUTH_ALLOWED_HOSTS") return ALLOWED_HOSTS_RAW;
  const env = import.meta.env as Record<string, unknown>;
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

const DEFAULT_ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "mybodyscanapp.com",
  "www.mybodyscanapp.com",
  "mybodyscan-f3daf.web.app",
];

const rawAuthHosts = getViteEnv("VITE_AUTH_ALLOWED_HOSTS") ?? "";

export const ALLOWED_HOSTS: string[] = Array.from(
  new Set(
    [
      ...DEFAULT_ALLOWED_HOSTS,
      ...rawAuthHosts
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ].map((host) => host.toLowerCase()),
  ),
);

export const DEFAULT_AUTH_HOSTS = DEFAULT_ALLOWED_HOSTS;
