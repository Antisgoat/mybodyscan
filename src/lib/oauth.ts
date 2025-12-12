import {
  getCanonicalOAuthReturnUrl,
  isCapacitor,
  isInAppBrowser,
  isWeb,
} from "./platform";

export function buildRedirectUri(): string {
  const fallback = getCanonicalOAuthReturnUrl();
  if (!isWeb()) {
    return fallback;
  }
  if (isCapacitor() || isInAppBrowser()) {
    return fallback;
  }
  try {
    const origin = window.location.origin.replace(/\/$/, "");
    if (!origin) return fallback;
    return `${origin}/oauth/return`;
  } catch {
    return fallback;
  }
}
