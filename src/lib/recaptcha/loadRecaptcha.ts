declare global {
  interface Window {
    grecaptcha?: {
      ready: () => Promise<void>;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
      render?: (...args: unknown[]) => unknown;
      reset?: (...args: unknown[]) => unknown;
    };
  }
}

let _loadPromise: Promise<typeof window.grecaptcha | null> | null = null;

export function loadRecaptcha(): Promise<typeof window.grecaptcha | null> {
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);

    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";
    if (!siteKey) {
      console.warn("[recaptcha] no site key; skipping script load");
      return resolve(null);
    }

    if (window.grecaptcha) return resolve(window.grecaptcha);

    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.grecaptcha || null);
    s.onerror = () => {
      console.warn("[recaptcha] script failed to load");
      resolve(null);
    };
    document.head.appendChild(s);
  });

  return _loadPromise;
}
