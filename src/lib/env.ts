/**
 * Centralized environment variable handling with safe getters
 * Validates required keys and logs warnings for optional keys
 */

// Required environment variables
const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN', 
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
] as const;

// Optional environment variables
const OPTIONAL_KEYS = [
  'VITE_FIREBASE_MEASUREMENT_ID',
  'VITE_RECAPTCHA_V3_KEY',
  'VITE_FUNCTIONS_BASE_URL',
  'VITE_USDA_API_KEY'
] as const;

// Validate required keys on module load
const missingRequired = REQUIRED_KEYS.filter(key => !getViteString(key));
if (missingRequired.length > 0) {
  throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
}

// Log warnings for missing optional keys
OPTIONAL_KEYS.forEach(key => {
  if (!getViteString(key)) {
    console.warn(`[ENV] Optional environment variable ${key} is not set`);
  }
});

/**
 * Safe getter for Vite environment variables
 */
export function getViteString(name: string, def?: string): string {
  const raw = (import.meta as any)?.env?.[name];
  if (typeof raw !== 'string') return def ?? '';
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : (def ?? '');
}

// Legacy exports for backward compatibility
const raw = getViteString('VITE_FUNCTIONS_BASE_URL');
/** Cloud Functions base URL without trailing slash. */
export const FUNCTIONS_BASE: string = raw.replace(/\/+$/, '');

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
  const key = getViteString('VITE_USDA_API_KEY');
  return key || null;
}

// Firebase configuration getters
export function getFirebaseConfig() {
  return {
    apiKey: getViteString('VITE_FIREBASE_API_KEY'),
    authDomain: getViteString('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getViteString('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getViteString('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getViteString('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getViteString('VITE_FIREBASE_APP_ID'),
    measurementId: getViteString('VITE_FIREBASE_MEASUREMENT_ID'),
  };
}

export function getRecaptchaKey(): string {
  return getViteString('VITE_RECAPTCHA_V3_KEY', 'public-recaptcha-placeholder');
}

// Check if current host is authorized for Firebase Auth
export function isAuthorizedDomain(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  const authorizedDomains = [
    'mybodyscan-f3daf.web.app',
    'mybodyscanapp.com', 
    'www.mybodyscanapp.com',
    'localhost',
    '127.0.0.1'
  ];
  return authorizedDomains.some(domain => host === domain || host.endsWith(`.${domain}`));
}
