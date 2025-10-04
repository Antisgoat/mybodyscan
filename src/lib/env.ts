type EnvShape = {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
  VITE_FUNCTIONS_BASE_URL?: string;
  VITE_SCAN_MODE?: string;
  VITE_APPLE_ENABLED?: string;
  APPCHECK_SITE_KEY?: string;
  VITE_RECAPTCHA_V3_SITE_KEY?: string; // legacy fallback
};

function getEnv(): EnvShape {
  return ((import.meta as any)?.env || {}) as EnvShape;
}

function required(name: keyof EnvShape, defaultValue?: string): string {
  const value = getEnv()[name] ?? defaultValue ?? '';
  const asString = typeof value === 'string' ? value : String(value ?? '');
  if (!asString) {
    const message = `[ENV] Missing required key ${String(name)}. Set it in your Vite env.`;
    if (import.meta.env?.DEV) {
      throw new Error(message);
    } else {
      // In production, prefer a noisy console error but do not throw synchronously
      // to avoid blank screens; downstream code should handle empty strings.
      // eslint-disable-next-line no-console
      console.error(message);
    }
  }
  return asString;
}

function optional(name: keyof EnvShape, defaultValue?: string): string | undefined {
  const value = getEnv()[name] ?? defaultValue;
  const asString = value == null ? undefined : String(value);
  return asString && asString.trim() ? asString : undefined;
}

// Firebase public config
export const VITE_FIREBASE_API_KEY = required('VITE_FIREBASE_API_KEY');
export const VITE_FIREBASE_AUTH_DOMAIN = required('VITE_FIREBASE_AUTH_DOMAIN');
export const VITE_FIREBASE_PROJECT_ID = required('VITE_FIREBASE_PROJECT_ID');
export const VITE_FIREBASE_STORAGE_BUCKET = required('VITE_FIREBASE_STORAGE_BUCKET');
export const VITE_FIREBASE_MESSAGING_SENDER_ID = required('VITE_FIREBASE_MESSAGING_SENDER_ID');
export const VITE_FIREBASE_APP_ID = required('VITE_FIREBASE_APP_ID');
export const VITE_FIREBASE_MEASUREMENT_ID = optional('VITE_FIREBASE_MEASUREMENT_ID');

// Functions base
const rawBase = optional('VITE_FUNCTIONS_BASE_URL');
export const FUNCTIONS_BASE: string = rawBase ? rawBase.replace(/\/+$/, '') : '';

// AppCheck site key (supports new APPCHECK_SITE_KEY first, falls back to legacy VITE_RECAPTCHA_V3_SITE_KEY)
export const APPCHECK_SITE_KEY = optional('APPCHECK_SITE_KEY') ?? optional('VITE_RECAPTCHA_V3_SITE_KEY');

// Scan mode and Apple flag
export const VITE_SCAN_MODE: 'photos' | 'video' | 'both' = (optional('VITE_SCAN_MODE', 'photos') || 'photos') as any;
export const VITE_APPLE_ENABLED: boolean = String(optional('VITE_APPLE_ENABLED', 'false')).toLowerCase() === 'true';

/** Build a URL to a function path. Returns '' if base is missing. */
export function fnUrl(path: string): string {
  if (!FUNCTIONS_BASE) {
    console.warn('[ENV] VITE_FUNCTIONS_BASE_URL missing; skipping network call for', path);
    return '';
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FUNCTIONS_BASE}${p}`;
}
