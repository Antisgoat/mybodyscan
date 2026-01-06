import { useSyncExternalStore } from "react";
import {
  auth as firebaseAuth,
  getFirebaseAuth,
  getFirebaseInitError,
  hasFirebaseConfig,
} from "@/lib/firebase";
import { reportError } from "@/lib/telemetry";
import type { Auth, Unsubscribe } from "firebase/auth";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";
import { call } from "@/lib/callable";
import { isNative } from "@/lib/platform";

type AuthSnapshot = {
  user: Auth["currentUser"] | null;
  authReady: boolean;
};

export type AuthPhase = "booting" | "signedOut" | "signedIn";

const shouldInitializeAuth =
  typeof window !== "undefined" && Boolean(hasFirebaseConfig) && !isNative();

// IMPORTANT: do not initialize Firebase Auth at module import time.
// Auth is lazily initialized when the first subscriber attaches.
let cachedUser: Auth["currentUser"] | null = null;
let authReadyFlag = !shouldInitializeAuth;
const authListeners = new Set<() => void>();
let unsubscribeAuthListener: (() => void) | null = null;
let processedUidKey: string | null = null;
let firstAuthEventResolve: (() => void) | null = null;
let firstAuthEventPromise: Promise<void> | null = null;
let cachedSnapshot: AuthSnapshot = {
  user: authReadyFlag ? cachedUser : null,
  authReady: authReadyFlag,
};
let authListenerInitStarted = false;

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
  void reportError({
    kind: "auth.state_changed",
    message: "auth.state_changed",
    extra: {
      signedIn: Boolean(nextUser),
      anonymous: Boolean(nextUser?.isAnonymous),
      providerCount: Array.isArray(nextUser?.providerData)
        ? nextUser?.providerData.length
        : 0,
    },
  });
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
  const statusKey = shouldRefreshClaims
    ? `${nextUser.uid}:claims`
    : `${nextUser.uid}:anon`;
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
  if (unsubscribeAuthListener || authListenerInitStarted) return;

  // Native builds: do not import/init Firebase Auth on boot.
  if (!shouldInitializeAuth) {
    authReadyFlag = true;
    updateAuthSnapshot();
    return;
  }

  authListenerInitStarted = true;
  if (!firstAuthEventPromise) {
    firstAuthEventPromise = new Promise<void>((resolve) => {
      firstAuthEventResolve = resolve;
    });
  }

  void (async () => {
    try {
      const auth = firebaseAuth ?? (hasFirebaseConfig ? await getFirebaseAuth() : null);
      if (!auth) return;
      const { onAuthStateChanged } = await import("firebase/auth");
      unsubscribeAuthListener = onAuthStateChanged(auth, (user) => {
        const snapshotChanged = handleUserChange(user);
        if (snapshotChanged) {
          notifyAuthSubscribers();
        }
        if (firstAuthEventResolve) {
          firstAuthEventResolve();
          firstAuthEventResolve = null;
        }
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[auth] failed to start auth listener", error);
      }
      authReadyFlag = true;
      updateAuthSnapshot();
      notifyAuthSubscribers();
      if (firstAuthEventResolve) {
        firstAuthEventResolve();
        firstAuthEventResolve = null;
      }
    } finally {
      authListenerInitStarted = false;
    }
  })();
}

/**
 * Ensures the auth state listener is attached and the first auth event has fired.
 * This is used by boot code to block routing decisions until auth is fully initialized.
 */
export async function startAuthListener(): Promise<void> {
  if (!hasFirebaseConfig) return;
  ensureAuthListener();
  await (firstAuthEventPromise ?? Promise.resolve());
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
  if (
    cachedSnapshot.user === nextUser &&
    cachedSnapshot.authReady === authReadyFlag
  ) {
    return false;
  }
  cachedSnapshot = {
    user: nextUser,
    authReady: authReadyFlag,
  };
  return true;
}

async function ensureFirebaseAuth(): Promise<Auth> {
  const auth = firebaseAuth ?? (hasFirebaseConfig ? await getFirebaseAuth() : null);
  if (!auth) {
    const reason =
      getFirebaseInitError() ||
      (hasFirebaseConfig
        ? "Authentication unavailable"
        : "Firebase not configured");
    throw new Error(reason);
  }
  return auth;
}

export function getCachedAuth(): Auth | null {
  return firebaseAuth;
}

export function useAuthUser() {
  const snapshot = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getServerAuthSnapshot
  );
  return {
    user: snapshot.authReady ? snapshot.user : null,
    loading: !snapshot.authReady,
    authReady: snapshot.authReady,
  } as const;
}

export function useAuthPhase(): AuthPhase {
  const { user, authReady } = useAuthUser();
  if (!authReady) return "booting";
  return user ? "signedIn" : "signedOut";
}

export async function signOutToAuth(): Promise<void> {
  const auth = await ensureFirebaseAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
  window.location.href = "/auth";
}

export async function createAccountEmail(
  email: string,
  password: string,
  displayName?: string
) {
  const auth = await ensureFirebaseAuth();
  const {
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    linkWithCredential,
    updateProfile,
  } = await import("firebase/auth");
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
  return ensureFirebaseAuth().then(async (auth) => {
    const { sendPasswordResetEmail } = await import("firebase/auth");
    return sendPasswordResetEmail(auth, email);
  });
}

export function signOutAll() {
  return ensureFirebaseAuth().then(async (auth) => {
    const { signOut } = await import("firebase/auth");
    return signOut(auth);
  });
}

export { isIOSSafari } from "@/lib/isIOSWeb";

type AuthTestInternals = {
  reset(): void;
  emit(
    user: Auth["currentUser"] | null,
    options?: { authReady?: boolean }
  ): void;
  snapshot(): AuthSnapshot;
};

function resetAuthStore(): void {
  cachedUser = typeof window !== "undefined" && firebaseAuth ? firebaseAuth.currentUser : null;
  authReadyFlag = !shouldInitializeAuth || !!cachedUser;
  processedUidKey = null;
  cachedSnapshot = {
    user: authReadyFlag ? cachedUser : null,
    authReady: authReadyFlag,
  };
  authListeners.clear();
}

export const __authTestInternals: AuthTestInternals = {
  reset() {
    resetAuthStore();
  },
  emit(user, options) {
    if (typeof options?.authReady === "boolean") {
      authReadyFlag = options.authReady;
    }
    handleUserChange(user);
    notifyAuthSubscribers();
  },
  snapshot() {
    return getAuthSnapshot();
  },
};
