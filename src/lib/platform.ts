export const isNative =
  typeof window !== "undefined" &&
  (window as any).Capacitor &&
  typeof (window as any).Capacitor.isNativePlatform === "function" &&
  (window as any).Capacitor.isNativePlatform();
