import type { User } from "firebase/auth";
import { disableDemo as disableStoreDemo, enableDemo as enableStoreDemo, get } from "@/state/demo";

export function isDemoEnabledEnv(): boolean {
  const val = String(import.meta.env.VITE_DEMO_MODE ?? "").trim().toLowerCase();
  return val === "true" || val === "1" || val === "yes";
}

/**
 * Demo is considered "active" only if the environment enables it AND there is no signed-in user.
 * As soon as a user signs in, demo must be OFF (banner hidden).
 */
export function isDemoActive(user: User | null): boolean {
  return isDemoEnabledEnv() && !user;
}

export const DEMO_KEY = "mbs.demo";

function broadcastDemoChange(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mbs:demo-change", { detail: { enabled } }));
  } catch {
    // ignore
  }
}

export const isDemo = (): boolean => {
  return get().demo;
};

export const enableDemo = (): void => {
  enableStoreDemo();
  broadcastDemoChange(true);
};

export const disableDemo = (): void => {
  disableStoreDemo();
  broadcastDemoChange(false);
};
