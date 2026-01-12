import { getCachedUser } from "@/auth/client";
import { get as getDemoState } from "@/state/demo";

export function isDemoActive(): boolean {
  // Demo mode only applies when signed out and the local demo flag is set.
  // Keep this logic simple and resilient (works in Safari/Capacitor without OAuth redirects).
  if (getCachedUser()) return false;
  return Boolean(getDemoState().demo);
}

export class DemoWriteError extends Error {
  constructor(message = "Demo mode is read-only") {
    super(message);
    this.name = "DemoWriteError";
  }
}

export function notifyDemoBlocked(_?: string): void {}

export function assertWritable(): void {
  if (isDemoActive()) {
    try {
      notifyDemoBlocked("Writes disabled in Demo.");
    } catch {
      // ignore notification failures
    }
    throw new DemoWriteError();
  }
}

// Backwards-compat alias for older callers (see demoGuard.ts).
export const isDemo = isDemoActive;
