import { isNative } from "@/lib/platform";
import type { Unsubscribe, UserLike } from "./types";

export type AuthImpl = {
  getCurrentUser(): Promise<UserLike | null>;
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  onAuthStateChanged(cb: (u: UserLike | null) => void): Promise<Unsubscribe>;
  onIdTokenChanged?(cb: (token: string | null) => void): Promise<Unsubscribe>;
  signOut(): Promise<void>;
  signInWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<UserLike>;
  createUserWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<UserLike>;
  sendPasswordResetEmail?(email: string): Promise<void>;
  signInWithGoogle?(next?: string | null): Promise<void>;
  signInWithApple?(next?: string | null): Promise<void>;
};

let implPromise: Promise<AuthImpl> | null = null;

function loadImpl(): Promise<AuthImpl> {
  if (!implPromise) {
    implPromise = isNative()
      ? import("./impl.native").then((m) => m.impl)
      : import("./impl.web").then((m) => m.impl);
  }
  return implPromise;
}

export async function getCurrentUser(): Promise<UserLike | null> {
  return (await loadImpl()).getCurrentUser();
}

export async function getIdToken(forceRefresh?: boolean): Promise<string | null> {
  return (await loadImpl()).getIdToken(forceRefresh);
}

export async function onAuthStateChanged(
  cb: (u: UserLike | null) => void
): Promise<Unsubscribe> {
  return (await loadImpl()).onAuthStateChanged(cb);
}

export async function signOut(): Promise<void> {
  return (await loadImpl()).signOut();
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  return (await loadImpl()).signInWithEmailAndPassword(email, password);
}

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  return (await loadImpl()).createUserWithEmailAndPassword(email, password);
}

// Optional helpers used by existing UI; safe no-ops if unavailable.
export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
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

export async function sendPasswordResetEmail(email: string): Promise<void> {
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

