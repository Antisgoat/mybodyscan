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

const DEFAULT_ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "mybodyscanapp.com",
  "www.mybodyscanapp.com",
  // Allow all Firebase Hosting subdomains by default
  "web.app",
  // Project default remains explicitly included
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

function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!h || !d) return false;
  if (h === d) return true;
  return h.endsWith(`.${d}`);
}

/**
 * Log a non-blocking warning when the current host is not included in
 * VITE_AUTH_ALLOWED_HOSTS (merged with sensible defaults).
 */
export function warnIfHostNotAllowedByEnv(): void {
  if (typeof window === "undefined") return;
  try {
    const host = window.location.hostname || "";
    if (!host) return;
    const isAllowed = ALLOWED_HOSTS.some((domain) => hostMatchesDomain(host, domain));
    if (!isAllowed) {
      console.warn(
        `[auth] Host '${host}' is not in VITE_AUTH_ALLOWED_HOSTS. ` +
          `Add it to your Vite env or include a matching parent domain.`,
      );
    }
  } catch {
    // no-op; debug-only signal
  }
}
