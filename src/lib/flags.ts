/* Centralized, typed flags with safe defaults. No secrets required to run. */
import { MBS_FLAGS as CONFIG_FLAGS } from "../mbs.config";

const env = (import.meta as any)?.env ?? {};

function bool(v: unknown, def = false): boolean {
  if (v == null) return def;
  const s = String(v).toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export const APPCHECK_SITE_KEY: string | undefined = env.VITE_APPCHECK_SITE_KEY || undefined;
export const DEMO_ENABLED: boolean = bool(env.VITE_DEMO_ENABLED, false);
export const SHOW_APPLE_WEB: boolean = bool(env.VITE_SHOW_APPLE_WEB, false);

export const USDA_API_KEY: string | undefined = env.VITE_USDA_API_KEY || undefined;
export const OFF_ENABLED: boolean = bool(env.VITE_OFF_ENABLED, true); // default ON for fallback

export const STRIPE_PUBLISHABLE_KEY: string | undefined = env.VITE_STRIPE_PUBLISHABLE_KEY || undefined;

/* Platform/service-worker */
export const SW_ENABLED: boolean = bool(env.VITE_SW_ENABLED, false); // stays disabled by default

/* Marketing/public experience */
export const MBS_FLAGS = {
  ...CONFIG_FLAGS,
  ENABLE_PUBLIC_MARKETING_PAGE: bool(env.VITE_ENABLE_PUBLIC_MARKETING_PAGE, false),
} as const;

/* Scan polling defaults (safe, overridable later) */
export const SCAN_POLL_MIN_MS = 2000;
export const SCAN_POLL_MAX_MS = 4000;
export const SCAN_POLL_TIMEOUT_MS = 5 * 60 * 1000;
