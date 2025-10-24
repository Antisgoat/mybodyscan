import { Capacitor } from "@capacitor/core";

function detectNative(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (typeof Capacitor?.isNativePlatform === "function") {
      return Capacitor.isNativePlatform();
    }

    if (typeof Capacitor?.getPlatform === "function") {
      const platform = Capacitor.getPlatform();
      return platform !== "web";
    }

    const legacyCapacitor = (window as any)?.Capacitor;
    if (legacyCapacitor) {
      if (typeof legacyCapacitor.isNativePlatform === "function") {
        return legacyCapacitor.isNativePlatform();
      }
      if (typeof legacyCapacitor.getPlatform === "function") {
        const platform = legacyCapacitor.getPlatform();
        return platform && platform !== "web";
      }
    }
  } catch {
    // Ignore detection errors and assume web.
  }

  return false;
}

export const isNative = detectNative();
