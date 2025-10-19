export type Grecaptcha = typeof window.grecaptcha;
let _loadPromise: Promise<Grecaptcha | null> | null = null;

/** TEMPORARY KILL-SWITCH: always return null so recaptcha never loads. */
export function loadRecaptcha(): Promise<Grecaptcha | null> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = Promise.resolve(null);
  if (typeof window !== "undefined") {
    console.warn("[recaptcha] disabled (kill-switch) — no script will be loaded");
  }
  return _loadPromise;
}
