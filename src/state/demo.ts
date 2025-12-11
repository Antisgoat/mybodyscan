import type { User } from "firebase/auth";

type Listener = (value: boolean) => void;

const SESSION_KEY = "mbs_demo";
const QUERY_PARAM = "demo";

let explicit: boolean | null = null;
let current = resolveDemo();
const listeners = new Set<Listener>();
let loggedListenerError = false;

function readSessionDemo(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    if (value == null) return null;
    return value === "1" || value === "true";
  } catch {
    return null;
  }
}

function readQueryDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get(QUERY_PARAM) === "1";
  } catch {
    return false;
  }
}

function resolveDemo(): boolean {
  if (explicit !== null) return explicit;
  const sessionValue = readSessionDemo();
  if (sessionValue !== null) return sessionValue;
  return readQueryDemo();
}

function update(next: boolean) {
  if (current === next) return;
  current = next;
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch (error) {
      if (!loggedListenerError) {
        console.error("demo_state_listener_error", error);
        loggedListenerError = true;
      }
    }
  });
}

function persistSession(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function get(): { demo: boolean } {
  const next = resolveDemo();
  if (next !== current) {
    current = next;
  }
  return { demo: current };
}

export function enableDemo(): void {
  explicit = true;
  persistSession(true);
  update(true);
}

export function disableDemo(): void {
  explicit = false;
  persistSession(false);
  update(false);
}

export function disableDemoEverywhere(
  navigate?: (to: { pathname?: string; search?: string }, options?: { replace?: boolean }) => void,
): void {
  disableDemo();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem("mbs.demo");
      window.sessionStorage.removeItem("mbs:demo");
    } catch {
      // ignore
    }
  }

  if (navigate) {
    navigate({ search: "" }, { replace: true });
    return;
  }

  if (typeof window !== "undefined" && typeof window.history?.replaceState === "function") {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(QUERY_PARAM)) {
        url.searchParams.delete(QUERY_PARAM);
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // ignore URL cleanup failures
    }
  }
}

export function subscribeDemo(listener: Listener): () => void {
  listeners.add(listener);
  // Do not invoke listener immediately; useSyncExternalStore already reads the current snapshot,
  // and firing here would trigger an infinite update loop (React error #185).
  return () => {
    listeners.delete(listener);
  };
}

export function isDemo(): boolean {
  return get().demo;
}

export function setDemo(value: boolean): void {
  if (value) {
    enableDemo();
  } else {
    disableDemo();
  }
}

export function isDemoAllowed(user: User | null): boolean {
  if (user) return false;
  return get().demo;
}

