import { useSyncExternalStore } from "react";

import { isNative } from "@/lib/platform";
import type { AuthUser, Unsubscribe as AppUnsubscribe } from "@/lib/auth/types";
import type { Unsubscribe as CoreUnsubscribe, UserLike } from "./types";

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

export type AuthImpl = {
  getCurrentUser(): Promise<UserLike | null>;
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  onAuthStateChanged(cb: (u: UserLike | null) => void): Promise<CoreUnsubscribe>;
  onIdTokenChanged?(cb: (token: string | null) => void): Promise<CoreUnsubscribe>;
  signOut(): Promise<void>;
  signInWithEmailAndPassword(email: string, password: string): Promise<UserLike>;
  createUserWithEmailAndPassword(email: string, password: string): Promise<UserLike>;
  createAccountEmail?(
    email: string,
    password: string,
    displayName?: string
  ): Promise<UserLike>;
  sendPasswordResetEmail?(email: string): Promise<void>;
  signInWithGoogle?(next?: string | null): Promise<void>;
  signInWithApple?(next?: string | null): Promise<void>;
};

let implPromise: Promise<AuthImpl> | null = null;

function loadImpl(): Promise<AuthImpl> {
  if (!implPromise) {
    // CRITICAL:
    // - Native builds must NEVER bundle or execute Firebase JS Auth.
    // - Use Vite build mode (`vite build --mode native`) so the web impl
    //   (and firebase/auth) is excluded from native output.
    //
    // Facade selection:
    // - Native build mode is a compile-time guarantee (prevents bundling firebase/auth).
    // - isNative() is a runtime guarantee for dev/preview and defensive checks.
    const native = import.meta.env.MODE === "native" || isNative();
    if (native) {
      implPromise = import("./impl.native").then((m) => m.impl);
    } else {
      implPromise = import("./impl.web").then((m) => m.impl);
    }
  }
  return implPromise;
}

// ---- Low-level (UserLike) ops used by internal helpers ----
async function getCurrentUserLike(): Promise<UserLike | null> {
  return (await loadImpl()).getCurrentUser();
}
async function getIdTokenLike(forceRefresh?: boolean): Promise<string | null> {
  return (await loadImpl()).getIdToken(forceRefresh);
}
async function onAuthStateChangedLike(
  cb: (u: UserLike | null) => void
): Promise<CoreUnsubscribe> {
  return (await loadImpl()).onAuthStateChanged(cb);
}
async function onIdTokenChangedLike(
  cb: (token: string | null) => void
): Promise<CoreUnsubscribe> {
  const impl = await loadImpl();
  if (!impl.onIdTokenChanged) {
    try {
      queueMicrotask(() => cb(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  return impl.onIdTokenChanged(cb);
}

// ---- Public app API (AuthUser) ----
export async function getCurrentUser(): Promise<AuthUser | null> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) return null;
  return toAuthUser(await getCurrentUserLike());
}

export async function onAuthStateChanged(
  cb: (user: AuthUser | null) => void
): Promise<AppUnsubscribe> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    try {
      queueMicrotask(() => cb(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  const unsub = await onAuthStateChangedLike((u) => cb(toAuthUser(u)));
  return () => unsub();
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<AppUnsubscribe> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    try {
      queueMicrotask(() => cb(null));
    } catch {
      // ignore
    }
    return () => undefined;
  }
  const unsub = await onIdTokenChangedLike(cb);
  return () => unsub();
}

export async function getIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) return null;
  return getIdTokenLike(Boolean(options?.forceRefresh));
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

export async function signOut(): Promise<void> {
  await (await loadImpl()).signOut();
}

export async function signInEmailPassword(email: string, password: string) {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    nativeAuthEnabled = true;
  }
  return toAuthUser(
    await (await loadImpl()).signInWithEmailAndPassword(email, password)
  );
}

export async function signUpEmailPassword(email: string, password: string) {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    nativeAuthEnabled = true;
  }
  return toAuthUser(
    await (await loadImpl()).createUserWithEmailAndPassword(email, password)
  );
}

export async function sendReset(email: string) {
  const impl = await loadImpl();
  if (!impl.sendPasswordResetEmail) {
    const err: any = new Error("sendPasswordResetEmail not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.sendPasswordResetEmail(email);
}

export async function signInWithGoogle(next?: string | null): Promise<void> {
  const impl = await loadImpl();
  if (!impl.signInWithGoogle) {
    const err: any = new Error("Google sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.signInWithGoogle(next);
}

export async function signInWithApple(next?: string | null): Promise<void> {
  const impl = await loadImpl();
  if (!impl.signInWithApple) {
    const err: any = new Error("Apple sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await impl.signInWithApple(next);
}

// Back-compat aliases used by older UI modules.
export function signInGoogle(next?: string | null) {
  return signInWithGoogle(next);
}
export function signInApple(next?: string | null) {
  return signInWithApple(next);
}

// Back-compat wrapper used by existing UI (web uses anonymous-link semantics).
export async function createAccountEmail(
  email: string,
  password: string,
  displayName?: string
) {
  // Native boot firewall: do not import native auth plugin unless explicitly enabled.
  if (isNative() && !nativeAuthEnabled) {
    nativeAuthEnabled = true;
  }
  const impl = await loadImpl();
  if (impl.createAccountEmail) {
    return toAuthUser(await impl.createAccountEmail(email, password, displayName));
  }
  // Fallback: create user normally.
  const user = await impl.createUserWithEmailAndPassword(email, password);
  return toAuthUser(user);
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
let unsubscribe: AppUnsubscribe | null = null;
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
  const unsub = await onAuthStateChanged((u2) => {
    emit((u2 as any) ?? null);
  });
  unsubscribe = unsub;
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

