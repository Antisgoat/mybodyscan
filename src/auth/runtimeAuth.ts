import { isNative } from "@/lib/platform";
import { getCurrentUser, getIdToken, onAuthStateChanged } from "@/auth/client";

import type { Unsubscribe } from "@/lib/auth/types";

type Listener = (user: any | null) => void;

/**
 * Runtime-safe auth access.
 *
 * Goals:
 * - Web: load the Firebase Auth module only when needed.
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
    const unsub = await onAuthStateChanged((u) => listener(u ?? null));
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
    return (await getCurrentUser()) ?? null;
  } catch {
    return null;
  }
}

export async function getIdTokenSafe(
  forceRefresh?: boolean
): Promise<string | null> {
  if (isNative()) return null;
  try {
    return await getIdToken(forceRefresh);
  } catch {
    return null;
  }
}
