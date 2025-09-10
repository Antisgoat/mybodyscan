export function isDemoGuest(): boolean {
  if (typeof window === "undefined") return false;
  const flag = window.localStorage.getItem("mbs_demo_guest");
  if (flag === "1") return true;
  if (flag === "0") return false;
  return import.meta.env.VITE_DEMO_MODE === "true";
}

export function enableDemoGuest(): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("mbs_demo_guest", "1");
    import("./analytics").then(m => m.track("demo_enter")).catch(() => {});
  }
}

export function disableDemoGuest(): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("mbs_demo_guest", "0");
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
