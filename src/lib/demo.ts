export const DEMO_KEY = "mbs:demo";
const DEMO_FLAG_KEY = DEMO_KEY;

export type DemoResult = { ok: true } | { ok: false; code?: string; message?: string };

function setLocalStorageFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    /* empty */
  }
}

export function setDemoFlag(): void {
  setLocalStorageFlag();
}

function clearLocalStorageFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* empty */
  }
}

export function clearDemoFlag(): void {
  clearLocalStorageFlag();
}

function queryIndicatesDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("demo");
    return value === "1";
  } catch {
    return false;
  }
}

export function isDemo(): boolean {
  if (queryIndicatesDemo()) return true;
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem(DEMO_FLAG_KEY) === "1") {
      return true;
    }
  } catch {
    /* empty */
  }
  return false;
}

/** One-tap demo start: persist demo flag locally so routes unlock. */
export async function startDemo(): Promise<DemoResult> {
  if (isDemo()) return { ok: true };
  try {
    setLocalStorageFlag();
    return { ok: true };
  } catch (err: any) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
    return { ok: false, code, message: "Demo preview could not start. Please try again." };
  }
}

export function enterDemo(): void {
  setLocalStorageFlag();
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEMO_FLAG_KEY, "1");
      try {
        window.sessionStorage.setItem(DEMO_FLAG_KEY, "1");
      } catch {
        /* ignore */
      }
      window.location.assign("/home");
    }
  } catch {
    /* ignore */
  }
}

export function leaveDemo(): void {
  clearLocalStorageFlag();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(DEMO_FLAG_KEY);
    } catch {
      /* ignore */
    }
    window.location.assign("/auth");
  }
}

/** Error used to signal a demo write block. */
export class DemoWriteError extends Error {
  code = "demo/read-only";
  constructor(message = "Demo is read-only.") {
    super(message);
    this.name = "DemoWriteError";
  }
}

/** Throw if demo mode is active (to be called at the top of write helpers). */
export function assertWritableOrThrow(): void {
  if (isDemo()) throw new DemoWriteError();
}

export function assertWritable(action?: string): void {
  try {
    assertWritableOrThrow();
  } catch (error) {
    if (error instanceof DemoWriteError) {
      notifyDemoBlocked(action);
    }
    throw error;
  }
}

/** Convenience wrapper for write functions. */
export async function guardWrite<T>(fn: () => Promise<T>): Promise<T> {
  assertWritable();
  return await fn();
}

/** Optional: lightweight toast/event for host app to listen and show a banner. */
export function notifyDemoBlocked(action?: string): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mbs:toast", {
          detail: {
            level: "info",
            message: action ? `Demo is read-only. ${action} disabled.` : "Demo is read-only.",
          },
        }),
      );
    }
  } catch {
    /* empty */
  }
}

export { DEMO_FLAG_KEY };
