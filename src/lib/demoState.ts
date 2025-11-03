import { isDemo as getDemoState, setDemo } from "@/state/demo";

export const DEMO_KEYS = ["mbs.demo", "mbs:demo", "mbs_demo", "demo"] as const;

export function isDemoLocal(): boolean {
  return getDemoState();
}

export function enableDemoLocal() {
  setDemo(true);
}

export function disableDemoEverywhere() {
  setDemo(false);
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("demo")) {
        url.searchParams.delete("demo");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // ignore URL cleanup failures
    }
  }
}

export function isDemoEffective(authed: boolean): boolean {
  if (authed) return false;
  return getDemoState();
}
