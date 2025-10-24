import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth as firebaseAuth, functions } from "@/lib/firebase";
import {
  Auth,
  UserCredential,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  updateProfile,
} from "firebase/auth";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";

async function ensureFirebaseAuth(): Promise<Auth> {
  return firebaseAuth;
}

export function getCachedAuth(): Auth | null {
  return firebaseAuth;
}

export async function initAuthPersistence() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<Auth["currentUser"] | null>(
    () => (typeof window !== "undefined" ? firebaseAuth.currentUser : null),
  );
  const [authReady, setAuthReady] = useState<boolean>(() => !!firebaseAuth.currentUser);
  const processedUidRef = useRef<string | null>(null);

  useEffect(() => {
    const auth = firebaseAuth;

    if (!authReady && auth.currentUser) {
      setUser(auth.currentUser);
      setAuthReady(true);
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
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
          await httpsCallable(functions, "refreshClaims")({});
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

const APPLE_PROVIDER_ID = "apple.com";

type AppleAdditionalProfile = {
  name?: { firstName?: string; lastName?: string };
  firstName?: string;
  lastName?: string;
};

async function applyAppleProfile(result: UserCredential | null) {
  if (!result) return;
  const info = getAdditionalUserInfo(result);
  if (info?.providerId !== APPLE_PROVIDER_ID) return;
  if (!info.isNewUser || !result.user || result.user.displayName) return;
  const profile = info.profile as AppleAdditionalProfile | undefined;
  const firstName = profile?.name?.firstName ?? profile?.firstName ?? "";
  const lastName = profile?.name?.lastName ?? profile?.lastName ?? "";
  const displayName = `${firstName} ${lastName}`.trim();
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
}

export async function resolveAuthRedirect(auth: Auth): Promise<UserCredential | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      await applyAppleProfile(result);
    }
    return result;
  } catch (error) {
    console.warn("[auth] Failed to resolve redirect result:", error);
    return null;
  }
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

