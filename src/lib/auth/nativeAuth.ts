import type { AuthState, AuthUser, Unsubscribe } from "@/lib/auth/types";
import { Capacitor } from "@capacitor/core";

function toAuthUser(
  user: import("@capacitor-firebase/authentication").User | null
): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoUrl: user.photoUrl ?? null,
    phoneNumber: user.phoneNumber ?? null,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    providerId: user.providerId ?? null,
  };
}

function plugin(): any {
  // IMPORTANT:
  // - Do NOT import from `@capacitor-firebase/authentication` at runtime.
  //   Any ESM import (even dynamic) can cause Vite/Rollup to emit a separate
  //   chunk that may get pulled into the native boot graph.
  // - Access the plugin through Capacitor's runtime registry instead.
  const p =
    (Capacitor as any)?.Plugins?.FirebaseAuthentication ??
    (Capacitor as any)?.FirebaseAuthentication ??
    (globalThis as any)?.Capacitor?.Plugins?.FirebaseAuthentication;
  if (!p) {
    const err = new Error("FirebaseAuthentication plugin not available");
    (err as any).code = "native_auth/plugin_unavailable";
    throw err;
  }
  return p;
}

export async function nativeSignInEmail(email: string, password: string) {
  const p = plugin();
  const res = await p.signInWithEmailAndPassword({ email, password });
  return { user: toAuthUser(res.user) };
}

export async function nativeCreateUserEmail(email: string, password: string) {
  const p = plugin();
  const res = await p.createUserWithEmailAndPassword({ email, password });
  return { user: toAuthUser(res.user) };
}

export async function nativeSignOut(): Promise<void> {
  const p = plugin();
  await p.signOut();
}

export async function nativeGetCurrentUser(): Promise<AuthUser | null> {
  const p = plugin();
  const res = await p.getCurrentUser();
  return toAuthUser(res.user);
}

export async function nativeGetIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const p = plugin();
  const res = await p.getIdToken({
    forceRefresh: Boolean(options?.forceRefresh),
  });
  return res?.token || null;
}

export async function nativeSendPasswordResetEmail(email: string): Promise<void> {
  const p = plugin();
  await p.sendPasswordResetEmail({ email });
}

export async function nativeAuthStateListener(
  cb: (state: AuthState) => void
): Promise<Unsubscribe> {
  const p = plugin();

  // Emit initial state ASAP.
  try {
    const initial = await p.getCurrentUser();
    cb({ user: toAuthUser(initial.user) });
  } catch {
    cb({ user: null });
  }

  const handle = await p.addListener("authStateChange", (change) => {
    cb({ user: toAuthUser(change.user) });
  });

  return () => {
    void handle.remove();
  };
}

export async function nativeIdTokenListener(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  const p = plugin();
  const handle = await p.addListener("idTokenChange", (change) => {
    cb(change?.token || null);
  });
  return () => {
    void handle.remove();
  };
}

