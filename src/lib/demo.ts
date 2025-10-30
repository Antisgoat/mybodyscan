import { signInAnonymously } from "firebase/auth";
import { firebaseReady, getFirebaseAuth } from "./firebase";

const DEMO_FLAG_KEY = "mbs_demo";

export type DemoResult = { ok: true } | { ok: false; code?: string; message?: string };

export function setDemoFlag(): void {
  try {
    localStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    /* empty */
  }
}

export function clearDemoFlag(): void {
  try {
    localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* empty */
  }
}

function currentAuthUser() {
  try {
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
}

export function isDemo(): boolean {
  try {
    if (typeof window !== "undefined" && localStorage.getItem(DEMO_FLAG_KEY) === "1") return true;
  } catch {
    /* empty */
  }
  const u = currentAuthUser();
  return Boolean(u?.isAnonymous);
}

/** One-tap demo start: anonymous sign-in with a single retry. */
export async function startDemo(): Promise<DemoResult> {
  if (isDemo()) return { ok: true };
  await firebaseReady();
  const auth = getFirebaseAuth();
  try {
    await signInAnonymously(auth);
    setDemoFlag();
    return { ok: true };
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    try {
      await signInAnonymously(auth);
      setDemoFlag();
      return { ok: true };
    } catch (err: any) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : undefined;
      return { ok: false, code, message: "Demo sign-in failed. Please reload and try again." };
    }
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
