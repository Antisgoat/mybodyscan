import { isNative } from "@/lib/platform";
import { getFirebaseApp } from "@/lib/firebase";

import type { Unsubscribe } from "@/lib/auth/types";

type Listener = (user: any | null) => void;

/**
 * Runtime-safe auth access.
 *
 * Goals:
 * - Web: dynamically import `firebase/auth` only when needed.
 * - Native (Capacitor/WKWebView): NEVER import/execute `firebase/auth` at runtime.
 *   Return safe fallbacks so UI can boot and remain stable.
 */
export async function onAuthStateChangedSafe(
  listener: Listener
): Promise<Unsubscribe> {
  if (isNative()) {
    try {
      queueMicrotask(() => listener(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  try {
    const { getAuth, onAuthStateChanged } = await import("firebase/auth");
    const auth = getAuth(getFirebaseApp());
    const unsub = onAuthStateChanged(auth, (u) => listener(u ?? null));
    return () => unsub();
  } catch {
    try {
      queueMicrotask(() => listener(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
}

export async function getCurrentUserSafe(): Promise<any | null> {
  if (isNative()) return null;
  try {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth(getFirebaseApp());
    return auth.currentUser ?? null;
  } catch {
    return null;
  }
}

export async function getIdTokenSafe(
  forceRefresh?: boolean
): Promise<string | null> {
  if (isNative()) return null;
  try {
    const user = await getCurrentUserSafe();
    if (!user) return null;
    return await user.getIdToken(Boolean(forceRefresh));
  } catch {
    return null;
  }
}

