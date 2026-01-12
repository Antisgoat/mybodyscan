import { useSyncExternalStore } from "react";

import { isNative } from "@/lib/platform";
import * as impl from "@mbs-auth-impl";
import type { MbsUser, Unsubscribe } from "./mbs-auth.types";

export * from "./mbs-auth.types";
export * from "@mbs-auth-impl";

// ---- Public app API ----
async function getIdTokenSafe(options?: { forceRefresh?: boolean }) {
  try {
    return await impl.getIdToken(options);
  } catch {
    return null;
  }
}

export async function requireIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string> {
  const token = await getIdTokenSafe(options);
  if (!token) {
    const err: any = new Error("auth_required");
    err.code = "auth_required";
    throw err;
  }
  return token;
}

export async function signInEmailPassword(email: string, password: string) {
  const result = await impl.signInWithEmailAndPassword(email, password);
  if (!result?.user) {
    throw new Error("Auth sign-in did not return a user.");
  }
  return result.user;
}

export async function signInGoogle(next?: string | null): Promise<void> {
  if (typeof impl.signInWithGoogle !== "function") {
    const err: any = new Error("Google sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.signInWithGoogle(next);
}

export async function signInApple(next?: string | null): Promise<void> {
  if (typeof impl.signInWithApple !== "function") {
    const err: any = new Error("Apple sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.signInWithApple(next);
}

export async function sendReset(email: string) {
  if (typeof impl.sendPasswordResetEmail !== "function") {
    const err: any = new Error("sendPasswordResetEmail not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.sendPasswordResetEmail(email);
}

export async function signOutToAuth(): Promise<void> {
  await impl.signOut().catch(() => undefined);
  if (typeof window !== "undefined") {
    window.location.href = "/auth";
  }
}

// ---- App auth store (single source of truth for user+boot gating) ----

type AuthSnapshot = {
  user: MbsUser | null;
  authReady: boolean;
};

let cachedUser: MbsUser | null = null;
let authReadyFlag = isNative();
let cachedSnapshot: AuthSnapshot = { user: null, authReady: authReadyFlag };
const listeners = new Set<() => void>();
let unsubscribe: Unsubscribe | null = null;
let firstAuthEventResolve: (() => void) | null = null;
let firstAuthEventPromise: Promise<void> | null = null;

function emit(nextUser: MbsUser | null) {
  cachedUser = nextUser;
  authReadyFlag = true;
  cachedSnapshot = { user: cachedUser, authReady: authReadyFlag };
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore subscriber errors
    }
  }
  if (firstAuthEventResolve) {
    firstAuthEventResolve();
    firstAuthEventResolve = null;
  }
}

async function ensureListener(): Promise<void> {
  if (unsubscribe) return;
  if (!firstAuthEventPromise) {
    firstAuthEventPromise = new Promise<void>((resolve) => {
      firstAuthEventResolve = resolve;
    });
  }
  try {
    const unsub = await impl.onAuthStateChanged((u2) => {
      emit(u2 ?? null);
    });
    unsubscribe = unsub;
  } catch {
    emit(null);
  }
}

export async function startAuthListener(): Promise<void> {
  await ensureListener();
  await (firstAuthEventPromise ?? Promise.resolve());
}

function subscribe(listener: () => void) {
  void ensureListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthSnapshot {
  return cachedSnapshot;
}

function getServerSnapshot(): AuthSnapshot {
  return { user: null, authReady: false };
}

export function useAuthUser() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    user: snapshot.authReady ? snapshot.user : null,
    loading: !snapshot.authReady,
    authReady: snapshot.authReady,
  } as const;
}

export type AuthPhase = "booting" | "signedOut" | "signedIn";
export function useAuthPhase(): AuthPhase {
  const { user, authReady } = useAuthUser();
  if (!authReady) return "booting";
  return user ? "signedIn" : "signedOut";
}

/** Synchronous best-effort cached user (for non-React helpers like telemetry). */
export function getCachedUser(): MbsUser | null {
  return cachedUser;
}

// ---- Test helpers (not part of the public app API) ----
export const __authTestInternals = {
  reset() {
    try {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
      }
      unsubscribe = null;
      cachedUser = null;
      authReadyFlag = isNative();
      cachedSnapshot = { user: null, authReady: authReadyFlag };
      listeners.clear();
      firstAuthEventResolve = null;
      firstAuthEventPromise = null;
    } catch {
      // ignore
    }
  },
  emit(user: any, options?: { authReady?: boolean }) {
    try {
      if (options && typeof options.authReady === "boolean") {
        authReadyFlag = options.authReady;
      } else {
        authReadyFlag = true;
      }
      cachedUser = user ?? null;
      cachedSnapshot = { user: cachedUser, authReady: authReadyFlag };
      for (const l of listeners) {
        try {
          l();
        } catch {
          // ignore
        }
      }
      if (firstAuthEventResolve && authReadyFlag) {
        firstAuthEventResolve();
        firstAuthEventResolve = null;
      }
    } catch {
      // ignore
    }
  },
  snapshot() {
    return { ...cachedSnapshot };
  },
};
