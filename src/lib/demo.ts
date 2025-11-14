import { auth } from "@/lib/firebase";

export function isDemoActive(): boolean {
  const flag = String((import.meta as any)?.env?.VITE_DEMO_MODE ?? "false").toLowerCase() === "true";
  const u = auth.currentUser;
  // Demo browsing ONLY when not signed in. Signed-in (including admin) is never demo.
  return flag && !u;
}

export class DemoWriteError extends Error {
  constructor(message = "Demo mode is read-only") { super(message); this.name = "DemoWriteError"; }
}
export function notifyDemoBlocked(_msg?: string): void { /* optional toast hook */ }

/** Call before any write; throws only for unauthenticated demo visitors. */
export function assertWritable(): void {
  if (isDemoActive()) { try { notifyDemoBlocked("Writes disabled in Demo."); } catch {} throw new DemoWriteError(); }
}
