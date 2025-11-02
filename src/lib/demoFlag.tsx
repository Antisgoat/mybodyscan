import React from "react";
import { clearDemoFlag, isDemo as isDemoAuthFlag, setDemoFlag } from "./demo";

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
export const DEMO_SESSION_KEY = "mbs:demo";
export const DEMO_QUERY_PARAM = "demo";
export const DEMO_ALLOWED_PATHS = [
  "/",
  "/welcome",
  "/home",
  "/demo",
  "/meals",
  "/programs",
  "/coach",
  "/settings",
  "/history",
  "/scan",
  "/scan/new",
  "/scan/history",
  "/scan/tips",
  "/results",
  "/results/:scanId",
  "/results/:id",
  "/report",
  "/barcode",
  "/plans",
  "/system/check",
  "/dev/audit",
  "/diagnostics",
] as const;

export type DemoAllowedPath = (typeof DEMO_ALLOWED_PATHS)[number];

function hostIsLocalOrLovable(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname || "";
  return h.includes("localhost") || h.includes("127.0.0.1") || h.includes("lovable");
}

function persistSessionFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearSessionFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function hasSessionFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function queryEnablesDemo(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(DEMO_QUERY_PARAM);
  const enabled = value === "1" || value === "true";
  if (enabled) {
    persistSessionFlag();
  }
  return enabled;
}

/**
 * Single source of truth for demo mode.
 * True when:
 * - VITE_DEMO_MODE === 'true', or
 * - URL has ?demo=1, or
 * - Host includes localhost/127.0.0.1/lovable
 */
export function isDemo(): boolean {
  if (isDemoAuthFlag()) return true;
  if (DEMO_MODE) return true;
  if (queryEnablesDemo()) return true;
  if (hasSessionFlag()) return true;
  return hostIsLocalOrLovable();
}

// Back-compat for existing imports
export function isDemoActive(): boolean {
  if (isDemo()) return true;
  return hasSessionFlag();
}

export function enableDemo() {
  if (typeof window === "undefined") return;
  setDemoFlag();
  persistSessionFlag();
}

export function disableDemo() {
  if (typeof window === "undefined") return;
  clearSessionFlag();
  clearDemoFlag();
}

type LocationLike = { pathname: string; search: string };

export function isDemoMode(user: { uid?: string } | null | undefined, currentLocation: LocationLike): boolean {
  if (isDemo()) return true;
  if (!user && (isPathAllowedInDemo(currentLocation.pathname) || currentLocation.search.includes(`${DEMO_QUERY_PARAM}=`))) {
    return true;
  }
  return isDemoActive();
}

export function isPathAllowedInDemo(pathname: string): boolean {
  return DEMO_ALLOWED_PATHS.some((allowed) => {
    if (allowed === "/") {
      return pathname === "/";
    }
    if (allowed.includes(":")) {
      const pattern = new RegExp(`^${allowed.replace(/:[^/]+/g, "[^/]+")}$`);
      return pattern.test(pathname);
    }
    return pathname === allowed || pathname.startsWith(`${allowed}/`);
  });
}

/** Throws when in demo mode to block writes */
export function assertReadOnly(action: string): void {
  if (isDemo()) {
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
  if (!isDemo()) return <>{children}</>;
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
