import { useSyncExternalStore } from "react";
import { isNative } from "@/lib/platform";
import type { AuthState, AuthUser, Unsubscribe } from "@/lib/auth/types";
import type { AuthFacade } from "@/lib/auth/facadeTypes";

let cachedImpl: Promise<AuthFacade> | null = null;
async function impl(): Promise<AuthFacade> {
  // `isNative()` uses URL scheme (capacitor://) so it is safe during early boot.
  if (cachedImpl) return cachedImpl;
  cachedImpl = isNative()
    ? import("@/lib/auth/nativeFacadeImpl").then((m) => m.nativeAuthImpl)
    : import("@/lib/auth/webFacadeImpl").then((m) => m.webAuthImpl);
  return cachedImpl;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await impl()).getCurrentUser();
}

export async function onAuthStateChanged(
  cb: (user: AuthUser | null) => void
): Promise<Unsubscribe> {
  return (await impl()).onAuthStateChanged((state) => cb(state.user ?? null));
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  return (await impl()).onIdTokenChanged(cb);
}

export async function getIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  return (await impl()).getIdToken(options);
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
  return impl().then((i) => i.signInGoogle(next));
}

export function signInApple(next?: string | null) {
  return impl().then((i) => i.signInApple(next));
}

export async function signInEmailPassword(email: string, password: string) {
  return (await impl()).signInEmail(email, password);
}

export async function signUpEmailPassword(email: string, password: string) {
  return (await impl()).createUserEmail(email, password);
}

export function signOut() {
  return impl().then((i) => i.signOut());
}

export function sendReset(email: string) {
  return impl().then((i) => i.sendPasswordResetEmail(email));
}

// ---- App auth store (single source of truth for user+boot gating) ----
type AuthSnapshot = {
  user: AuthUser | null;
  authReady: boolean;
};

let cachedUser: AuthUser | null = null;
let authReadyFlag = false;
let cachedSnapshot: AuthSnapshot = { user: null, authReady: false };
const listeners = new Set<() => void>();
let unsubscribe: Unsubscribe | null = null;
let firstAuthEventResolve: (() => void) | null = null;
let firstAuthEventPromise: Promise<void> | null = null;

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
  if (!firstAuthEventPromise) {
    firstAuthEventPromise = new Promise<void>((resolve) => {
      firstAuthEventResolve = resolve;
    });
  }
  const u = await (await impl()).onAuthStateChanged((state) => {
    emit(state.user ?? null);
  });
  unsubscribe = u;
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
    const { webCreateAccountEmail } = await import("@/lib/auth/webFirebaseAuth");
    const res = await webCreateAccountEmail(email, password, displayName);
    return res.user;
  }
  const user = await signUpEmailPassword(email, password);
  return user;
}


