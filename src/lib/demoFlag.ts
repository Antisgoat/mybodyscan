import { auth } from "@/lib/firebase";
import { isDemoMode } from "./demo";

function currentDemo(): boolean {
  if (typeof window === "undefined") return false;
  return isDemoMode(auth.currentUser, window.location);
}

export function isDemoGuest(): boolean {
  if (typeof window === "undefined") return false;
  return currentDemo();
}

export function enableDemoGuest(): void {
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.pathname = "/welcome";
    url.searchParams.set("demo", "1");
    window.location.href = `${url.pathname}${url.search}${url.hash}`;
  }
}

export function disableDemoGuest(): void {
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

export async function demoGuard<T>(action: () => Promise<T> | T, onBlocked?: () => void): Promise<T | undefined> {
  if (isDemoGuest()) {
    onBlocked?.();
    return undefined;
  }
  return await action();
}
