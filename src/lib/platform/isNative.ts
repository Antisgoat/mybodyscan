const CAPACITOR_ORIGIN_PREFIX = "capacitor://";

export function originIsCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.location.origin.startsWith(CAPACITOR_ORIGIN_PREFIX);
  } catch {
    return false;
  }
}

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() === true) return true;
    if (typeof cap?.getPlatform === "function") {
      const platform = cap.getPlatform();
      return platform !== "web";
    }
  } catch {
    // ignore
  }
  return originIsCapacitor();
}
