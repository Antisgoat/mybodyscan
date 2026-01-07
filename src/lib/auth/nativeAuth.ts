import type { AuthState, AuthUser, Unsubscribe } from "@/lib/auth/types";

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

async function plugin() {
  const { FirebaseAuthentication } = await import(
    "@capacitor-firebase/authentication"
  );
  return FirebaseAuthentication;
}

export async function nativeSignInEmail(email: string, password: string) {
  const p = await plugin();
  const res = await p.signInWithEmailAndPassword({ email, password });
  return { user: toAuthUser(res.user) };
}

export async function nativeCreateUserEmail(email: string, password: string) {
  const p = await plugin();
  const res = await p.createUserWithEmailAndPassword({ email, password });
  return { user: toAuthUser(res.user) };
}

export async function nativeSignOut(): Promise<void> {
  const p = await plugin();
  await p.signOut();
}

export async function nativeGetCurrentUser(): Promise<AuthUser | null> {
  const p = await plugin();
  const res = await p.getCurrentUser();
  return toAuthUser(res.user);
}

export async function nativeGetIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const p = await plugin();
  const res = await p.getIdToken({
    forceRefresh: Boolean(options?.forceRefresh),
  });
  return res?.token || null;
}

export async function nativeSendPasswordResetEmail(email: string): Promise<void> {
  const p = await plugin();
  await p.sendPasswordResetEmail({ email });
}

export async function nativeAuthStateListener(
  cb: (state: AuthState) => void
): Promise<Unsubscribe> {
  const p = await plugin();

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
  const p = await plugin();
  const handle = await p.addListener("idTokenChange", (change) => {
    cb(change?.token || null);
  });
  return () => {
    void handle.remove();
  };
}

