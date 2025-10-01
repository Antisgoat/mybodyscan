const DEMO_KEY = "mbs_demo_guest";
const DEMO_EXPIRY_KEY = "mbs_demo_guest_exp";
const DEMO_DURATION_MS = 60 * 60 * 1000; // 1 hour sessions

function getNow(): number {
  return Date.now();
}

function getExpiry(): number | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(DEMO_EXPIRY_KEY);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clearDemoFlags(): void {
  window.localStorage.removeItem(DEMO_KEY);
  window.localStorage.removeItem(DEMO_EXPIRY_KEY);
}

export function isDemoGuest(): boolean {
  if (typeof window === "undefined") return false;
  const expiry = getExpiry();
  if (expiry && expiry < getNow()) {
    clearDemoFlags();
    return false;
  }
  const flag = window.localStorage.getItem(DEMO_KEY);
  if (flag === "1") return true;
  if (flag === "0") return false;
  return import.meta.env.VITE_DEMO_MODE === "true";
}

export function enableDemoGuest(): void {
  if (typeof window !== "undefined") {
    if (import.meta.env.VITE_DEMO_MODE !== "true") {
      return;
    }
    window.localStorage.setItem(DEMO_KEY, "1");
    window.localStorage.setItem(DEMO_EXPIRY_KEY, String(getNow() + DEMO_DURATION_MS));
    import("./analytics")
      .then((m) => m.track("demo_enter"))
      .catch(() => {});
  }
}

export function disableDemoGuest(): void {
  if (typeof window !== "undefined") {
    clearDemoFlags();
  }
}

export async function demoGuard<T>(
  action: () => Promise<T> | T,
  onBlocked?: () => void
): Promise<T | undefined> {
  if (isDemoGuest()) {
    onBlocked?.();
    return undefined;
  }
  return await action();
}
