import { Capacitor } from "@capacitor/core";

import type { AuthUser } from "@/lib/auth/types";
import type { Unsubscribe, User } from "@/auth/types";
import {
  __authTestInternals,
  createAccountEmail,
  getCachedUser,
  getCurrentUser as getCurrentUserFacade,
  getIdToken as getIdTokenFacade,
  onAuthStateChanged as onAuthStateChangedFacade,
  onIdTokenChanged as onIdTokenChangedFacade,
  requireIdToken,
  sendReset,
  signInApple,
  signInEmailPassword,
  signInGoogle,
  signInWithApple as signInWithAppleFacade,
  signInWithGoogle as signInWithGoogleFacade,
  signOut as signOutFacade,
  signOutToAuth,
  startAuthListener,
  useAuthPhase,
  useAuthUser,
} from "./facade";

const isNativePlatform = (): boolean => {
  try {
    if (typeof Capacitor?.isNativePlatform === "function") {
      return Capacitor.isNativePlatform();
    }
  } catch {
    // ignore
  }
  return false;
};

const isNativeRuntime = (): boolean => {
  if (typeof __NATIVE__ !== "undefined" && __NATIVE__) return true;
  return isNativePlatform();
};

function normalizeUser(user: AuthUser | null): User | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: (user as any).photoURL ?? (user as any).photoUrl ?? null,
  };
}

function wrapNativeError(action: string, error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  const err = new Error(`Native auth ${action} failed: ${message}`);
  (err as any).cause = error;
  throw err;
}

async function withNativeError<T>(action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isNativeRuntime()) {
      wrapNativeError(action, error);
    }
    throw error;
  }
}

async function requireUserAfterSignIn(action: string): Promise<User> {
  const user = normalizeUser(await getCurrentUserFacade().catch(() => null));
  if (!user) {
    throw new Error(`Auth ${action} completed without a user.`);
  }
  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  return withNativeError("getCurrentUser", async () => {
    const user = await getCurrentUserFacade();
    return normalizeUser(user);
  });
}

export async function getIdToken(
  forceRefresh?: boolean | { forceRefresh?: boolean }
): Promise<string | null> {
  const resolvedForceRefresh =
    typeof forceRefresh === "object"
      ? Boolean(forceRefresh?.forceRefresh)
      : forceRefresh;
  return withNativeError("getIdToken", async () => {
    return getIdTokenFacade({ forceRefresh: resolvedForceRefresh });
  });
}

export async function signInWithGoogle(next?: string | null): Promise<User> {
  return withNativeError("signInWithGoogle", async () => {
    await signInWithGoogleFacade(next ?? undefined);
    return requireUserAfterSignIn("signInWithGoogle");
  });
}

export async function signInWithApple(next?: string | null): Promise<User> {
  return withNativeError("signInWithApple", async () => {
    await signInWithAppleFacade(next ?? undefined);
    return requireUserAfterSignIn("signInWithApple");
  });
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<User> {
  return withNativeError("signInWithEmailAndPassword", async () => {
    const user = await signInEmailPassword(email, password);
    return normalizeUser(user) ?? (await requireUserAfterSignIn("signInWithEmailAndPassword"));
  });
}

export async function signOut(): Promise<void> {
  return withNativeError("signOut", async () => {
    await signOutFacade();
  });
}

export async function onAuthStateChanged(
  cb: (user: User | null) => void
): Promise<Unsubscribe> {
  return withNativeError("onAuthStateChanged", async () => {
    const unsub = await onAuthStateChangedFacade((user) => cb(normalizeUser(user)));
    return () => unsub();
  });
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  return withNativeError("onIdTokenChanged", async () => {
    const unsub = await onIdTokenChangedFacade(cb);
    return () => unsub();
  });
}

export {
  __authTestInternals,
  createAccountEmail,
  getCachedUser,
  requireIdToken,
  sendReset,
  signInApple,
  signInEmailPassword,
  signInGoogle,
  signOutToAuth,
  startAuthListener,
  useAuthPhase,
  useAuthUser,
};
