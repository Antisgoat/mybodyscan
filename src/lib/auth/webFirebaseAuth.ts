import type { AuthState, AuthUser, Unsubscribe } from "@/lib/auth/types";
import { getFirebaseApp, getFirebaseInitError, hasFirebaseConfig } from "@/lib/firebase";

function toAuthUser(user: any): AuthUser | null {
  if (!user) return null;
  return {
    uid: String(user.uid || ""),
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    photoUrl: typeof user.photoURL === "string" ? user.photoURL : null,
    phoneNumber: typeof user.phoneNumber === "string" ? user.phoneNumber : null,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    providerId: typeof user.providerId === "string" ? user.providerId : null,
  };
}

async function getWebAuth() {
  if (!hasFirebaseConfig) {
    const reason =
      getFirebaseInitError() ||
      (hasFirebaseConfig ? "Authentication unavailable" : "Firebase not configured");
    throw new Error(reason);
  }
  const { getAuth } = await import("firebase/auth");
  return getAuth(getFirebaseApp());
}

// Internal escape hatch for legacy web-only modules (OAuth helpers).
// Do not use this from native code.
export async function webRequireAuth(): Promise<any> {
  return getWebAuth();
}

export type AuthPersistenceMode =
  | "indexeddb"
  | "local"
  | "session"
  | "memory"
  | "unknown";

let authPersistenceMode: AuthPersistenceMode = "unknown";
let persistenceReady: Promise<AuthPersistenceMode> | null = null;

export function getAuthPersistenceMode(): AuthPersistenceMode {
  return authPersistenceMode;
}

export async function webEnsureAuthPersistence(): Promise<AuthPersistenceMode> {
  if (persistenceReady) return persistenceReady;
  // Prefer IndexedDB on iOS Safari (more reliable than localStorage with ITP).
  persistenceReady = (async () => {
    const auth = await getWebAuth();
    const {
      setPersistence,
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
    } = await import("firebase/auth");

    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      authPersistenceMode = "indexeddb";
      return authPersistenceMode;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[auth] indexedDBLocalPersistence failed; retrying", err);
      }
    }

    try {
      await setPersistence(auth, browserLocalPersistence);
      authPersistenceMode = "local";
      return authPersistenceMode;
    } catch (err2) {
      if (import.meta.env.DEV) {
        console.warn("[auth] browserLocalPersistence failed; retrying", err2);
      }
    }

    await setPersistence(auth, browserSessionPersistence).catch(() => undefined);
    authPersistenceMode = "session";
    return authPersistenceMode;
  })();

  return persistenceReady;
}

export async function webGetCurrentUser(): Promise<AuthUser | null> {
  try {
    const auth = await getWebAuth();
    return toAuthUser(auth.currentUser);
  } catch {
    return null;
  }
}

export async function webOnAuthStateChanged(
  cb: (state: AuthState) => void
): Promise<Unsubscribe> {
  const auth = await getWebAuth();
  const { onAuthStateChanged } = await import("firebase/auth");
  const unsub = onAuthStateChanged(auth, (user) => cb({ user: toAuthUser(user) }));
  return () => unsub();
}

export async function webOnIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  const auth = await getWebAuth();
  const { onIdTokenChanged } = await import("firebase/auth");
  const unsub = onIdTokenChanged(auth, async (user) => {
    try {
      const token = user ? await user.getIdToken() : null;
      cb(token);
    } catch {
      cb(null);
    }
  });
  return () => unsub();
}

export async function webGetIdToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const auth = await getWebAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(Boolean(options?.forceRefresh));
}

export async function webSignInEmail(email: string, password: string) {
  const auth = await getWebAuth();
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const res = await signInWithEmailAndPassword(auth, email, password);
  return { user: toAuthUser(res.user) };
}

export async function webCreateAccountEmail(
  email: string,
  password: string,
  displayName?: string
) {
  const auth = await getWebAuth();
  const {
    EmailAuthProvider,
    linkWithCredential,
    createUserWithEmailAndPassword,
    updateProfile,
  } = await import("firebase/auth");

  const existing = auth.currentUser;
  const cred = EmailAuthProvider.credential(email, password);
  if (existing?.isAnonymous) {
    const res = await linkWithCredential(existing, cred);
    if (displayName) await updateProfile(res.user, { displayName });
    return { user: toAuthUser(res.user) };
  }

  const res = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(res.user, { displayName });
  return { user: toAuthUser(res.user) };
}

export async function webSendPasswordResetEmail(email: string): Promise<void> {
  const auth = await getWebAuth();
  const { sendPasswordResetEmail } = await import("firebase/auth");
  await sendPasswordResetEmail(auth, email);
}

export async function webSignOut(): Promise<void> {
  const auth = await getWebAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

// OAuth helpers are web-only and must never be imported/executed on native.
export async function webSignInGoogle(next?: string | null): Promise<void> {
  const { signInWithOAuthProvider } = await import("@/lib/auth/oauth");
  const { GoogleAuthProvider } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  await signInWithOAuthProvider({ providerId: "google.com", provider, next });
}

export async function webSignInApple(next?: string | null): Promise<void> {
  const { signInWithOAuthProvider } = await import("@/lib/auth/oauth");
  const { OAuthProvider } = await import("firebase/auth");
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  await signInWithOAuthProvider({ providerId: "apple.com", provider, next });
}

export async function webHandleAuthRedirectResult(): Promise<any | null> {
  try {
    const auth = await getWebAuth();
    const { getRedirectResult } = await import("firebase/auth");
    return await getRedirectResult(auth);
  } catch {
    return null;
  }
}

