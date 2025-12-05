import { useEffect, useRef, useState } from "react";
import {
  Auth,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from "firebase/auth";

import { auth as firebaseAuth, getFirebaseInitError, onAuthStateChangedSafe } from "@/lib/firebase";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";
import { call } from "@/lib/callable";

async function ensureFirebaseAuth(): Promise<Auth> {
  if (!firebaseAuth) {
    const reason = getFirebaseInitError() ?? "Firebase Auth is not available.";
    throw new Error(reason);
  }
  return firebaseAuth;
}

export function getCachedAuth(): Auth | null {
  return firebaseAuth ?? null;
}

export function useAuthUser() {
  const [user, setUser] = useState<Auth["currentUser"] | null>(() =>
    typeof window !== "undefined" ? firebaseAuth?.currentUser ?? null : null,
  );
  const [authReady, setAuthReady] = useState<boolean>(() => !!firebaseAuth?.currentUser);
  const processedUidRef = useRef<string | null>(null);

  useEffect(() => {
    const current = firebaseAuth?.currentUser ?? null;
    if (!authReady && current) {
      setUser(current);
      setAuthReady(true);
    }

    const unsubscribe = onAuthStateChangedSafe((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        processedUidRef.current = null;
        return;
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
      if (processedUidRef.current === statusKey) {
        return;
      }

      processedUidRef.current = statusKey;

      if (!shouldRefreshClaims) {
        return;
      }

      void (async () => {
        try {
          await nextUser.getIdToken(true);
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
          await nextUser.getIdToken(true);
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("[auth] post-claims token refresh failed", err);
          }
        }
      })();
    });

    return () => {
      unsubscribe();
    };
  }, [authReady]);

  return { user: authReady ? user : null, loading: !authReady, authReady } as const;
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
  const instance = await ensureFirebaseAuth();
  const user = instance.currentUser;
  const cred = EmailAuthProvider.credential(email, password);
  if (user?.isAnonymous) {
    const res = await linkWithCredential(user, cred);
    if (displayName) await updateProfile(res.user, { displayName });
    return res.user;
  }
  const res = await createUserWithEmailAndPassword(instance, email, password);
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

