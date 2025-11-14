import React from "react";
import { disableDemo as disableStoreDemo, enableDemo as enableStoreDemo, get } from "@/state/demo";
import { isDemoActive as envDemoActive } from "./demo";

export const DEMO_SESSION_KEY = "mbs_demo";
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
  "/report/:scanId",
  "/plans",
  "/system/check",
  "/dev/audit",
  "/diagnostics",
] as const;

export type DemoAllowedPath = (typeof DEMO_ALLOWED_PATHS)[number];

export function isDemo(): boolean {
  return get().demo;
}

export function isDemoActive(): boolean {
  return isDemo() && envDemoActive();
}

export function enableDemo(): void {
  enableStoreDemo();
}

export function disableDemo(): void {
  disableStoreDemo();
}

type LocationLike = { pathname: string; search: string };

export function isDemoMode(_user: { uid?: string } | null | undefined, _currentLocation: LocationLike): boolean {
  return isDemo();
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

export function assertReadOnly(action: string): void {
  if (isDemo()) {
    throw new Error(`Read-only demo: ${action} disabled`);
  }
}

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

export function notifyDemoChange(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mbs:demo", { detail: { enabled } }));
  } catch {
    // ignore
  }
}

export { DEMO_SESSION_KEY as DEMO_KEY };
