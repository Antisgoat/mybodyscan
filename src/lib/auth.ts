import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { auth as firebaseAuth, functions, onReady, getAuthObjects } from "@/lib/firebase";
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
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { clearDemoFlags, persistDemoFlags } from "@/lib/demoFlag";
import type { FirebaseError } from "firebase/app";

const DEMO_FLAG_KEY = "mbs:demo";
const DEMO_LOCAL_KEY = "mbs_demo";

export function getAuthDomainWhitelist(): string[] {
  return [
    "mybodyscanapp.com",
    "mybodyscan-f3daf.web.app",
    "mybodyscan-f3daf.firebaseapp.com",
  ];
}

function hostMatches(domain: string, host: string): boolean {
  if (!domain) return false;
  if (host === domain) return true;
  return host.endsWith(`.${domain}`);
}

function isPopupFriendlyDomain(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname?.toLowerCase() ?? "";
  if (!host) return false;
  if (host === "localhost" || host.startsWith("127.") || host.endsWith(".localhost")) {
    return true;
  }
  return getAuthDomainWhitelist().some((domain) => hostMatches(domain, host));
}

export function shouldUsePopupAuth(): boolean {
  return isPopupFriendlyDomain();
}

async function requireAuthInstance(): Promise<Auth> {
  await onReady();
  const { auth } = getAuthObjects();
  if (!auth) {
    throw new Error("auth/unavailable");
  }
  return auth;
}

function persistDemoMarker(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(DEMO_FLAG_KEY, "1");
    window.localStorage?.setItem(DEMO_LOCAL_KEY, "1");
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[auth] unable to persist demo marker", error);
    }
  }
  try {
    persistDemoFlags();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[auth] unable to persist demo flags", error);
    }
  }
}

export async function ensureDemoUser(): Promise<void> {
  const auth = await requireAuthInstance();
  if (!auth.currentUser?.isAnonymous) {
    await signInAnonymously(auth);
  }
  persistDemoMarker();
}

export async function startDemo(options?: {
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  skipEnsure?: boolean;
}): Promise<void> {
  if (options?.skipEnsure) {
    persistDemoMarker();
  } else {
    await ensureDemoUser();
  }

  const navigate = options?.navigate;
  if (navigate) {
    navigate("/today", { replace: true });
  } else if (typeof window !== "undefined") {
    window.history.replaceState({}, "", "/today");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function isDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const marker = window.localStorage?.getItem(DEMO_FLAG_KEY) === "1";
    const localMarker = window.localStorage?.getItem(DEMO_LOCAL_KEY) === "1";
    return (marker || localMarker) && firebaseAuth.currentUser?.isAnonymous === true;
  } catch {
    return firebaseAuth.currentUser?.isAnonymous === true;
  }
}

export function isDemoUser(
  currentUser: { isAnonymous?: boolean } | null | undefined,
): boolean {
  if (!currentUser) return false;
  if (currentUser.isAnonymous) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(DEMO_LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}

export async function initAuthPersistence() {
  const auth = await requireAuthInstance();
  await setPersistence(auth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<typeof firebaseAuth.currentUser | null>(
    () => (typeof window !== "undefined" ? firebaseAuth.currentUser : null),
  );
  const [authReady, setAuthReady] = useState<boolean>(() => !!firebaseAuth.currentUser);
  const processedUidRef = useRef<string | null>(null);

  useEffect(() => {
    // If a user is already available synchronously, mark ready without waiting
    if (!authReady && firebaseAuth.currentUser) {
      setUser(firebaseAuth.currentUser);
      setAuthReady(true);
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        processedUidRef.current = null;
        return;
      }

      if (!nextUser.isAnonymous) {
        try {
          clearDemoFlags();
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("[auth] unable to clear demo flags", err);
          }
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
            console.warn("[auth] token refresh failed", err);
          }
        }
      })();
    });
    return () => unsubscribe();
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
  await signOut(firebaseAuth);
  window.location.href = "/auth";
}

// New helpers
const APPLE_PROVIDER_ID = "apple.com";

type AppleAdditionalProfile = {
  name?: { firstName?: string; lastName?: string };
  firstName?: string;
  lastName?: string;
};

export async function finalizeAppleProfile(result: UserCredential | null) {
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
  const result = await getRedirectResult(auth);
  await finalizeAppleProfile(result);
  return result;
}

export async function createAccountEmail(email: string, password: string, displayName?: string) {
  const auth = await requireAuthInstance();
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

export async function signInEmail(email: string, password: string) {
  const auth = await requireAuthInstance();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function sendReset(email: string) {
  const auth = await requireAuthInstance();
  return sendPasswordResetEmail(auth, email);
}

export async function signOutAll() {
  const auth = await requireAuthInstance();
  return signOut(auth);
}

function extractFirebaseError(error: unknown): FirebaseError | null {
  if (error && typeof error === "object" && "code" in (error as any)) {
    const code = (error as any).code;
    if (typeof code === "string") {
      return error as FirebaseError;
    }
  }
  return null;
}

function getErrorCode(error: unknown): string | null {
  const firebaseError = extractFirebaseError(error);
  if (firebaseError?.code) return firebaseError.code;
  if (error && typeof error === "object" && typeof (error as any).code === "string") {
    return (error as any).code;
  }
  return null;
}

function getErrorMessage(error: unknown): string | null {
  const firebaseError = extractFirebaseError(error);
  if (firebaseError?.message) return firebaseError.message;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof (error as any).message === "string") {
    return (error as any).message;
  }
  return null;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/network-request-failed": "We couldn’t reach the server. Check your internet connection and try again.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Please allow popups or continue with redirect.",
  "auth/popup-closed-by-user": "It looks like the sign-in window was closed before completing. Please try again.",
  "auth/cancelled-popup-request": "A sign-in window is already open. Close it or finish that flow before trying again.",
  "auth/operation-not-supported-in-this-environment": "This browser can’t open a sign-in popup. We’ll retry with a redirect.",
  "auth/unauthorized-domain": "This domain isn’t authorized for sign-in. Contact support if you need access.",
  "auth/internal-error": "Something went wrong while signing in. Please try again.",
  "auth/account-exists-with-different-credential": "That email is already linked to another sign-in method. Use the original provider instead.",
  "auth/invalid-credential": "The sign-in link is no longer valid. Please try again.",
  "auth/user-disabled": "This account has been disabled. Contact support if this seems wrong.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/wrong-password": "That password doesn’t match. Try again or reset your password.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/invalid-oauth-client-id": "The provider configuration needs attention. Please try again later or contact support.",
  "auth/invalid-redirect-uri": "The redirect URL isn’t allowed for this sign-in method. Refresh and try again.",
  "auth/invalid-provider-id": "The sign-in provider is misconfigured. Contact support if the issue persists.",
  "auth/missing-or-invalid-nonce": "We couldn’t verify the sign-in request. Please try again.",
  "auth/unavailable": "Sign-in is temporarily unavailable. Refresh the page and try again.",
};

export function formatAuthError(providerLabel: string, error: unknown): string {
  const code = getErrorCode(error);
  const baseMessage = (code && AUTH_ERROR_MESSAGES[code]) || null;
  const fallbackMessage = getErrorMessage(error) || "Please try again.";
  const message = baseMessage ?? fallbackMessage;
  const prefix = providerLabel ? `${providerLabel}: ` : "";
  return `${prefix}${message}`;
}

export { isIOSSafari } from "@/lib/isIOSWeb";

