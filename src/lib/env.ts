const raw = (import.meta as any)?.env?.VITE_FUNCTIONS_BASE_URL;
/** Cloud Functions base URL without trailing slash. */
export const FUNCTIONS_BASE: string = typeof raw === 'string' ? raw.replace(/\/+$/, '') : '';

/** Build a URL to a function path. Returns '' if base is missing. */
export function fnUrl(path: string): string {
  if (!FUNCTIONS_BASE) {
    console.warn('[ENV] VITE_FUNCTIONS_BASE_URL missing; skipping network call for', path);
    return '';
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FUNCTIONS_BASE}${p}`;
}
