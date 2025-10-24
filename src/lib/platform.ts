import { SW_ENABLED } from "./flags";

export const isWeb =
  typeof window !== "undefined" && typeof document !== "undefined";

export const ENABLE_SW = SW_ENABLED;

export const isNative =
  typeof window !== "undefined" &&
  (window as any).Capacitor &&
  typeof (window as any).Capacitor.isNativePlatform === "function" &&
  (window as any).Capacitor.isNativePlatform();
