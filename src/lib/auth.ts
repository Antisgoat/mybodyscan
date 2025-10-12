import { useEffect, useState } from "react";
import { auth as firebaseAuth } from "@/lib/firebase";
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
  await setPersistence(firebaseAuth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<typeof firebaseAuth.currentUser | null>(
    () => (typeof window !== "undefined" ? firebaseAuth.currentUser : null),
  );
  const [authReady, setAuthReady] = useState<boolean>(() => !!firebaseAuth.currentUser);

  useEffect(() => {
    // If a user is already available synchronously, mark ready without waiting
    if (!authReady && firebaseAuth.currentUser) {
      setUser(firebaseAuth.currentUser);
      setAuthReady(true);
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
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
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    if (shouldForceRedirectAuth()) {
      await signInWithRedirect(firebaseAuth, provider);
      return;
    }
    return await signInWithPopup(firebaseAuth, provider);
  } catch (err: any) {
    const code = String(err?.code || "");
    if (
      code.includes("popup-blocked") ||
      code.includes("popup-closed-by-user") ||
      code.includes("operation-not-supported-in-this-environment")
    ) {
      await signInWithRedirect(firebaseAuth, provider);
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
  const user = firebaseAuth.currentUser;
  const cred = EmailAuthProvider.credential(email, password);
  if (user?.isAnonymous) {
    const res = await linkWithCredential(user, cred);
    if (displayName) await updateProfile(res.user, { displayName });
    return res.user;
  }
  const res = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (displayName) await updateProfile(res.user, { displayName });
  return res.user;
}

export function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

export function sendReset(email: string) {
  return sendPasswordResetEmail(firebaseAuth, email);
}

export function signOutAll() {
  return signOut(firebaseAuth);
}

export { isIOSSafari } from "@/lib/isIOSWeb";

