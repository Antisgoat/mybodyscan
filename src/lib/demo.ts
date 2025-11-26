import { auth } from "@/lib/firebase";
import { get as getDemoState } from "@/state/demo";

export function isDemoActive(): boolean {
  const flag = String((import.meta as any)?.env?.VITE_DEMO_MODE ?? "false").toLowerCase() === "true";
  if (!flag) return false;

  // Demo mode only applies when signed out and the local demo flag is set.
  if (auth.currentUser) return false;

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
