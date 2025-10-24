export const isWeb = typeof window !== "undefined" && typeof document !== "undefined";

// Hard-disable SW registration in this PR; can be flipped via flag in later PRs.
export const ENABLE_SW = false;

export const isNative =
  typeof window !== "undefined" &&
  (window as any).Capacitor &&
  typeof (window as any).Capacitor.isNativePlatform === "function" &&
  (window as any).Capacitor.isNativePlatform();
