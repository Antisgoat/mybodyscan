import { isCapacitor, isInAppBrowser } from "./platform";

export function openExternal(url: string): void {
  if (!url || typeof window === "undefined") return;

  try {
    if (isCapacitor() || isInAppBrowser()) {
      window.location.assign(url);
      return;
    }
    window.location.assign(url);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[links] Failed to open external URL", error);
    }
  }
}
