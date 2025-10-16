const raw = (import.meta as any)?.env?.VITE_FUNCTIONS_BASE_URL ?? '';
/** Cloud Functions base URL without trailing slash. */
export const FUNCTIONS_BASE: string = typeof raw === 'string' ? raw.replace(/\/+$/, '') : '';

/**
 * Safe getter for Vite env variables (exposed via import.meta.env).
 * - Returns the default when provided
 * - Logs a single warning for known optional keys if they are missing
 */
const warnedOptionalKeys = new Set<string>();
const OPTIONAL_KEYS = new Set([
  'VITE_RECAPTCHA_V3_KEY',
  'VITE_FIREBASE_MEASUREMENT_ID',
]);

export function getViteString(name: string, def?: string): string {
  const value = (import.meta as any)?.env?.[name];
  const stringVal = typeof value === 'string' ? value : undefined;
  if (stringVal == null || stringVal === '') {
    if (OPTIONAL_KEYS.has(name) && !warnedOptionalKeys.has(name)) {
      warnedOptionalKeys.add(name);
      console.warn(`[env] Optional key ${name} is missing; continuing without it.`);
    }
    return def ?? '';
  }
  return stringVal;
}

/** Build a URL to a function path. Returns '' if base is missing. */
export function fnUrl(path: string): string {
  if (!FUNCTIONS_BASE) {
    console.warn('[ENV] VITE_FUNCTIONS_BASE_URL missing; skipping network call for', path);
    return '';
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FUNCTIONS_BASE}${p}`;
}

export function getUsdaApiKey(): string | null {
  const apiKey = getViteString('VITE_USDA_API_KEY');
  const trimmed = apiKey.trim();
  return trimmed.length ? trimmed : null;
}
