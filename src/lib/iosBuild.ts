function readFlag(value: unknown): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * iOS App Store compliance gate:
 * When enabled, disables Stripe purchase UX in the in-app (Capacitor iOS) build.
 *
 * NOTE: Vite only exposes VITE_* variables to the web bundle, so the recommended
 * build-time toggle is VITE_IOS_BUILD=true.
 */
export function isIOSBuild(): boolean {
  // Build-time (recommended for Capacitor bundles)
  const vite = (import.meta as any)?.env?.VITE_IOS_BUILD;
  if (readFlag(vite)) return true;

  // Optional: allow an injected runtime flag for custom shells/tests.
  const injected = (globalThis as any)?.IOS_BUILD ?? (globalThis as any)?.__IOS_BUILD__;
  if (readFlag(injected)) return true;

  return false;
}

