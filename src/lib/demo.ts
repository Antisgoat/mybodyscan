import { auth } from "@/lib/firebase";

/** Returns true only for unauthenticated demo browsing. Signed-in users are never in demo. */
export function isDemoActive(): boolean {
  const flag = String((import.meta as any)?.env?.VITE_DEMO_MODE ?? "false").toLowerCase() === "true";
  const authed = !!auth.currentUser;
  return flag && !authed;
}

export class DemoWriteError extends Error {
  constructor(message = "Demo mode is read-only") { super(message); this.name = "DemoWriteError"; }
}

/** Optional toast/log hook; safe no-op by default. */
export function notifyDemoBlocked(_msg?: string): void { /* no-op */ }

/** Gate writes only if visitor is in unauthenticated demo mode. */
export function assertWritable(): void {
  if (isDemoActive()) {
    try { notifyDemoBlocked("Writes are disabled in Demo."); } catch {}
    throw new DemoWriteError();
  }
}
