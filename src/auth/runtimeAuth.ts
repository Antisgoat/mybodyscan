import {
  getCurrentUser,
  getIdTokenSafe as authGetIdTokenSafe,
  onAuthStateChangedSafe as authOnAuthStateChangedSafe,
} from "@/lib/auth/authService";

import type { Unsubscribe } from "@/lib/auth/types";

type Listener = (user: any | null) => void;

/**
 * Runtime-safe auth access.
 *
 * Goals:
 * - Web + Native: share a single auth facade so routing stays consistent.
 * - Ensure token fetches are guarded when no user is signed in.
 */
export async function onAuthStateChangedSafe(
  listener: Listener
): Promise<Unsubscribe> {
  try {
    const unsub = await authOnAuthStateChangedSafe((u) => listener(u ?? null));
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
  try {
    return (await getCurrentUser()) ?? null;
  } catch {
    return null;
  }
}

export async function getIdTokenSafe(
  forceRefresh?: boolean
): Promise<string | null> {
  try {
    return await authGetIdTokenSafe({ forceRefresh });
  } catch {
    return null;
  }
}
