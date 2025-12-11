import { useSyncExternalStore } from "react";
import { auth as firebaseAuth, getFirebaseInitError, hasFirebaseConfig } from "@/lib/firebase";
import {
  Auth,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from "firebase/auth";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";
import { call } from "@/lib/callable";

type AuthSnapshot = {
  user: Auth["currentUser"] | null;
  authReady: boolean;
};

let cachedUser: Auth["currentUser"] | null =
  typeof window !== "undefined" && firebaseAuth ? firebaseAuth.currentUser : null;
let authReadyFlag = !firebaseAuth || !!cachedUser;
const authListeners = new Set<() => void>();
let unsubscribeAuthListener: (() => void) | null = null;
let processedUidKey: string | null = null;
let cachedSnapshot: AuthSnapshot = {
  user: authReadyFlag ? cachedUser : null,
  authReady: authReadyFlag,
};

function notifyAuthSubscribers() {
  authListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[auth] listener error", error);
      }
    }
  });
}

async function refreshClaimsFor(user: NonNullable<Auth["currentUser"]>) {
  try {
    await user.getIdToken(true);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] pre-claims token refresh failed", err);
    }
  }

  try {
    await call("refreshClaims", {});
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] refreshClaims callable failed", err);
    }
  }

  try {
    await user.getIdToken(true);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] post-claims token refresh failed", err);
    }
  }
}

function handleUserChange(nextUser: Auth["currentUser"] | null): boolean {
  cachedUser = nextUser;
  authReadyFlag = true;
  const snapshotChanged = updateAuthSnapshot();

  if (!nextUser) {
    processedUidKey = null;
    return snapshotChanged;
  }

  if (!nextUser.isAnonymous && typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch {
      // ignore storage errors
    }
  }

  const shouldRefreshClaims = !nextUser.isAnonymous;
  const statusKey = shouldRefreshClaims ? `${nextUser.uid}:claims` : `${nextUser.uid}:anon`;
  if (processedUidKey === statusKey) {
    return snapshotChanged;
  }

  processedUidKey = statusKey;

  if (!shouldRefreshClaims) {
    return snapshotChanged;
  }

  void refreshClaimsFor(nextUser);
  return snapshotChanged;
}

function ensureAuthListener() {
  if (!firebaseAuth || unsubscribeAuthListener) return;
  unsubscribeAuthListener = onAuthStateChanged(firebaseAuth, (user) => {
    const snapshotChanged = handleUserChange(user);
    if (snapshotChanged) {
      notifyAuthSubscribers();
    }
  });
}

function subscribeAuth(listener: () => void) {
  ensureAuthListener();
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function getAuthSnapshot(): AuthSnapshot {
  return cachedSnapshot;
}

function getServerAuthSnapshot(): AuthSnapshot {
  return { user: null, authReady: false };
}

function updateAuthSnapshot(): boolean {
  const nextUser = authReadyFlag ? cachedUser : null;
  if (cachedSnapshot.user === nextUser && cachedSnapshot.authReady === authReadyFlag) {
    return false;
  }
  cachedSnapshot = {
    user: nextUser,
    authReady: authReadyFlag,
  };
  return true;
}

async function ensureFirebaseAuth(): Promise<Auth> {
  if (!firebaseAuth) {
    const reason =
      getFirebaseInitError() || (hasFirebaseConfig ? "Authentication unavailable" : "Firebase not configured");
    throw new Error(reason);
  }
  return firebaseAuth;
}

export function getCachedAuth(): Auth | null {
  return firebaseAuth;
}

export function useAuthUser() {
  const snapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  return {
    user: snapshot.authReady ? snapshot.user : null,
    loading: !snapshot.authReady,
    authReady: snapshot.authReady,
  } as const;
}

const RETURN_PATH_STORAGE_KEY = "mybodyscan:auth:return";

export function rememberAuthRedirect(path: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, path);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] Unable to persist redirect target:", err);
    }
  }
}

export function consumeAuthRedirect(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(RETURN_PATH_STORAGE_KEY);
    if (stored) {
      sessionStorage.removeItem(RETURN_PATH_STORAGE_KEY);
      return stored;
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[auth] Unable to read redirect target:", err);
    }
  }
  return null;
}

export async function signOutToAuth(): Promise<void> {
  const auth = await ensureFirebaseAuth();
  await signOut(auth);
  window.location.href = "/auth";
}

export async function createAccountEmail(email: string, password: string, displayName?: string) {
  const auth = await ensureFirebaseAuth();
  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(email, password);
  if (user?.isAnonymous) {
    const res = await linkWithCredential(user, cred);
    if (displayName) await updateProfile(res.user, { displayName });
    return res.user;
  }
  const res = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(res.user, { displayName });
  return res.user;
}

export function sendReset(email: string) {
  return ensureFirebaseAuth().then((auth) => sendPasswordResetEmail(auth, email));
}

export function signOutAll() {
  return ensureFirebaseAuth().then((auth) => signOut(auth));
}

export { isIOSSafari } from "@/lib/isIOSWeb";

