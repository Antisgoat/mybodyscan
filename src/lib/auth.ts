import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, getSequencedAuth } from "@/lib/firebase";
import {
  Auth,
  OAuthProvider,
  UserCredential,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth";
import { isIOSSafari } from "@/lib/isIOSWeb";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";

let firebaseAuth: Auth | null = null;
const firebaseAuthPromise = getSequencedAuth().then((auth) => {
  firebaseAuth = auth;
  return auth;
});

async function ensureFirebaseAuth(): Promise<Auth> {
  return firebaseAuthPromise;
}

export function getCachedAuth(): Auth | null {
  return firebaseAuth;
}

function shouldForceRedirectAuth(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname?.toLowerCase() ?? "";
  if (!host) return false;
  if (host === "mybodyscanapp.com" || host === "www.mybodyscanapp.com") {
    return true;
  }
  return host.endsWith(".lovable.app");
}

export async function initAuthPersistence() {
  const auth = await ensureFirebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<Auth["currentUser"] | null>(
    () => (typeof window !== "undefined" && firebaseAuth ? firebaseAuth.currentUser : null),
  );
  const [authReady, setAuthReady] = useState<boolean>(() => !!firebaseAuth?.currentUser);
  const processedUidRef = useRef<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const auth = await ensureFirebaseAuth();
      if (cancelled) return;

      // If a user is already available synchronously, mark ready without waiting
      if (!authReady && auth.currentUser) {
        setUser(auth.currentUser);
        setAuthReady(true);
      }

      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
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
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
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

// New helpers
export async function signInWithGoogle() {
  const auth = await ensureFirebaseAuth();
  const provider = new GoogleAuthProvider();
  try {
    if (shouldForceRedirectAuth()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    return await signInWithPopup(auth, provider);
  } catch (err: any) {
    const code = String(err?.code || "");
    if (
      code.includes("popup-blocked") ||
      code.includes("popup-closed-by-user") ||
      code.includes("operation-not-supported-in-this-environment")
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
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

function logAppleFlow(flow: "popup" | "redirect", context?: string) {
  if (!import.meta.env.DEV) return;
  const extra = context ? ` ${context}` : "";
  console.info(`[auth] Apple sign-in via ${flow}${extra}`);
}

export async function signInWithApple(auth: Auth): Promise<UserCredential | void> {
  const provider = new OAuthProvider(APPLE_PROVIDER_ID);
  provider.addScope("email");
  provider.addScope("name");

  try {
    const iosSafari = isIOSSafari();
    const forceRedirect = shouldForceRedirectAuth();
    if (iosSafari || forceRedirect) {
      logAppleFlow("redirect", iosSafari ? "(iOS Safari)" : "(forced redirect)");
      return await signInWithRedirect(auth, provider);
    }

    logAppleFlow("popup");
    const result = await signInWithPopup(auth, provider);
    await applyAppleProfile(result);
    return result;
  } catch (err: any) {
    const msg = String(err?.code || "");
    if (
      msg.includes("popup-blocked") ||
      msg.includes("popup-closed-by-user") ||
      msg.includes("operation-not-supported-in-this-environment")
    ) {
      logAppleFlow("redirect", "(fallback)");
      return await signInWithRedirect(auth, provider);
    }
    throw err;
  }
}

export async function resolveAuthRedirect(auth: Auth): Promise<UserCredential | null> {
  const result = await getRedirectResult(auth);
  await applyAppleProfile(result);
  return result;
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

export function signInEmail(email: string, password: string) {
  return ensureFirebaseAuth().then((auth) => signInWithEmailAndPassword(auth, email, password));
}

export function sendReset(email: string) {
  return ensureFirebaseAuth().then((auth) => sendPasswordResetEmail(auth, email));
}

export function signOutAll() {
  return ensureFirebaseAuth().then((auth) => signOut(auth));
}

export { isIOSSafari } from "@/lib/isIOSWeb";

