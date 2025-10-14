import React from "react";

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export const DEMO_STORAGE_KEY = "mbs.demo";
export const DEMO_AUTH_FLAG_KEY = "mbs:demo";
// Back-compat alias for modules that previously referenced session storage.
export const DEMO_SESSION_KEY = DEMO_STORAGE_KEY;
export const DEMO_READONLY_KEY = "mbs.readonly";
export const DEMO_QUERY_PARAM = "demo";
export const DEMO_ALLOWED_PATHS = [
  "/welcome",
  "/home",
  "/demo",
  "/meals",
  "/programs",
  "/coach",
  "/settings",
] as const;

export type DemoAllowedPath = (typeof DEMO_ALLOWED_PATHS)[number];

type LocationLike = { pathname: string; search: string };

function safeRead(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // ignore storage failures
  }
}

function hasDemoQueryParam(location?: LocationLike): boolean {
  if (typeof window === "undefined") return false;
  const target = location ?? window.location;
  const params = new URLSearchParams(target.search ?? "");
  return params.get(DEMO_QUERY_PARAM) === "1";
}

function readStoredFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  const value = safeRead(window.localStorage, key);
  return value === "1";
}

function setStoredFlag(key: string): void {
  if (typeof window === "undefined") return;
  safeWrite(window.localStorage, key, "1");
}

function clearStoredFlag(key: string): void {
  if (typeof window === "undefined") return;
  safeWrite(window.localStorage, key, null);
}

export function persistDemoFlags(): void {
  setStoredFlag(DEMO_STORAGE_KEY);
  setStoredFlag(DEMO_READONLY_KEY);
  if (typeof window !== "undefined") {
    safeWrite(window.localStorage, DEMO_AUTH_FLAG_KEY, "1");
  }
}

export function clearDemoFlags(): void {
  clearStoredFlag(DEMO_STORAGE_KEY);
  clearStoredFlag(DEMO_READONLY_KEY);
  if (typeof window !== "undefined") {
    safeWrite(window.localStorage, DEMO_AUTH_FLAG_KEY, null);
  }
  if (typeof window !== "undefined") {
    safeWrite(window.sessionStorage, DEMO_STORAGE_KEY, null);
  }
}

export function isStoredDemo(): boolean {
  return readStoredFlag(DEMO_STORAGE_KEY);
}

export function isStoredReadOnly(): boolean {
  return readStoredFlag(DEMO_READONLY_KEY);
}

/**
 * Single source of truth for demo mode.
 * True when:
 * - VITE_DEMO_MODE === 'true', or
 * - URL has ?demo=1, or
 * - localStorage persisted demo flag exists
 */
export function isDemo(): boolean {
  if (DEMO_MODE) return true;
  if (hasDemoQueryParam()) return true;
  return isStoredDemo();
}

export function isReadOnly(): boolean {
  if (DEMO_MODE) return true;
  if (hasDemoQueryParam()) return true;
  return isStoredReadOnly();
}

// Back-compat for existing imports
export function isDemoActive(): boolean {
  return isDemo();
}

export function enableDemo(): void {
  persistDemoFlags();
}

export function disableDemo(): void {
  clearDemoFlags();
}

export function isDemoMode(user: { uid?: string; isAnonymous?: boolean } | null | undefined, currentLocation: LocationLike): boolean {
  if (isDemo()) return true;
  const fromQuery = hasDemoQueryParam(currentLocation);
  const stored = isStoredDemo();
  const inDemoPath = isPathAllowedInDemo(currentLocation.pathname);

  if (!user) {
    return fromQuery || stored || inDemoPath;
  }

  if (user.isAnonymous) {
    return fromQuery || stored || inDemoPath;
  }

  return false;
}

export function isPathAllowedInDemo(pathname: string): boolean {
  return DEMO_ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

/** Throws when in demo mode to block writes */
export function assertReadOnly(action: string): void {
  if (isReadOnly()) {
    throw new Error(`Read-only demo: ${action} disabled`);
  }
}

/**
 * DemoGuard: disables/hints write buttons in demo.
 * - If not demo, renders children unchanged
 * - If demo and a single React element child is provided, clones it with disabled+title
 * - Otherwise wraps children in a <div> with a subtle notice
 */
export const DemoGuard: React.FC<{ children: React.ReactNode; note?: string }> = ({ children, note }) => {
  if (!isReadOnly()) return <>{children}</>;
  const notice = note || "Read-only demo";
  if (React.isValidElement(children)) {
    const props: any = { disabled: true };
    if (typeof (children as any)?.props?.title !== "string") {
      props.title = notice;
    }
    return React.cloneElement(children as any, props);
  }
  return (
    <div title={notice} aria-disabled>
      {children}
      <div className="mt-1 text-xs text-muted-foreground">{notice}</div>
    </div>
  );
};
