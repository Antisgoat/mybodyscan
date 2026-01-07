import { useSyncExternalStore } from "react";
import { isNative } from "@/lib/platform";
import type { AuthUser, Unsubscribe } from "@/lib/auth/types";
import type { UserLike } from "@/auth/types";
import {
  createUserWithEmailAndPassword as facadeCreateUser,
  getCurrentUser as facadeGetCurrentUser,
  getIdToken as facadeGetIdToken,
  onAuthStateChanged as facadeOnAuthStateChanged,
  onIdTokenChanged as facadeOnIdTokenChanged,
  sendPasswordResetEmail as facadeSendPasswordResetEmail,
  signInWithApple as facadeSignInApple,
  signInWithEmailAndPassword as facadeSignInEmail,
  signInWithGoogle as facadeSignInGoogle,
  signOut as facadeSignOut,
} from "@/auth/facade";

function toAuthUser(u: UserLike | null): AuthUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoUrl: u.photoUrl,
    phoneNumber: u.phoneNumber,
    emailVerified: u.emailVerified,
    isAnonymous: u.isAnonymous,
    providerId: u.providerId,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) return null;
  return toAuthUser(await facadeGetCurrentUser());
}

export async function onAuthStateChanged(
  cb: (user: AuthUser | null) => void
): Promise<Unsubscribe> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    try {
      queueMicrotask(() => cb(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  return facadeOnAuthStateChanged((u) => cb(toAuthUser(u)));
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    try {
      queueMicrotask(() => cb(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  return facadeOnIdTokenChanged(cb);
}

export async function getIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) return null;
  return facadeGetIdToken(Boolean(options?.forceRefresh));
}

export async function requireIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string> {
  const token = await getIdToken(options);
  if (!token) {
    const err: any = new Error("auth_required");
    err.code = "auth_required";
    throw err;
  }
  return token;
}

export function signInGoogle(next?: string | null) {
  // Web-only. Native builds should not attempt web OAuth.
  return facadeSignInGoogle(next);
}

export function signInApple(next?: string | null) {
  // Web-only. Native builds should not attempt web OAuth.
  return facadeSignInApple(next);
}

export async function signInEmailPassword(email: string, password: string) {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    nativeAuthEnabled = true;
  }
  return toAuthUser(await facadeSignInEmail(email, password));
}

export async function signUpEmailPassword(email: string, password: string) {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    nativeAuthEnabled = true;
  }
  return toAuthUser(await facadeCreateUser(email, password));
}

export function signOut() {
  return facadeSignOut();
}

export function sendReset(email: string) {
  return facadeSendPasswordResetEmail(email);
}

// ---- App auth store (single source of truth for user+boot gating) ----
type AuthSnapshot = {
  user: AuthUser | null;
  authReady: boolean;
};

let cachedUser: AuthUser | null = null;
// On native boot, do NOT initialize auth; treat as "ready but signed out" so the UI can render.
let authReadyFlag = isNative();
let cachedSnapshot: AuthSnapshot = { user: null, authReady: false };
const listeners = new Set<() => void>();
let unsubscribe: Unsubscribe | null = null;
let firstAuthEventResolve: (() => void) | null = null;
let firstAuthEventPromise: Promise<void> | null = null;
let nativeAuthEnabled = false;

function emit(nextUser: AuthUser | null) {
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
  if (isNative() && !nativeAuthEnabled) {
    // Native boot firewall: do not import/execute native auth plugin unless enabled.
    // Ensure consumers don't hang forever waiting for authReady.
    if (!authReadyFlag) {
      authReadyFlag = true;
      cachedSnapshot = { user: cachedUser, authReady: true };
    }
    return;
  }
  if (!firstAuthEventPromise) {
    firstAuthEventPromise = new Promise<void>((resolve) => {
      firstAuthEventResolve = resolve;
    });
  }
  const u = await facadeOnAuthStateChanged((u2) => {
    emit((u2 as any) ?? null);
  });
  unsubscribe = u;
}

export async function startAuthListener(): Promise<void> {
  if (isNative()) {
    // Explicit opt-in: importing the native auth plugin can indirectly pull in Firebase JS auth
    // (via plugin web fallbacks). Never do this during native boot.
    nativeAuthEnabled = true;
  }
  await ensureListener();
  await (firstAuthEventPromise ?? Promise.resolve());
}

function subscribe(listener: () => void) {
  // Native boot firewall: avoid importing native auth plugin on first render.
  if (!isNative() || nativeAuthEnabled) {
    void ensureListener();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthSnapshot {
  // Keep snapshot consistent with native boot behavior.
  if (isNative() && !nativeAuthEnabled) {
    return { user: cachedUser, authReady: true };
  }
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
export function getCachedUser(): AuthUser | null {
  return cachedUser;
}

export async function signOutToAuth(): Promise<void> {
  await signOut().catch(() => undefined);
  if (typeof window !== "undefined") {
    window.location.href = "/auth";
  }
}

// Back-compat wrapper used by existing UI (web uses anonymous-link semantics).
export async function createAccountEmail(
  email: string,
  password: string,
  displayName?: string
) {
  if (!isNative()) {
    const { createAccountEmail: webCreate } = await import("@/auth/impl.web");
    const user = await webCreate(email, password, displayName);
    return toAuthUser(user);
  }
  const user = await signUpEmailPassword(email, password);
  return user;
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
      nativeAuthEnabled = false;
      cachedUser = null;
      authReadyFlag = false;
      cachedSnapshot = { user: null, authReady: false };
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


