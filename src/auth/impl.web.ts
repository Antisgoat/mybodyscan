import type { AuthImpl } from "./facade";
import type { Unsubscribe, UserLike } from "./types";

import { getFirebaseApp, getFirebaseConfig, hasFirebaseConfig } from "@/lib/firebase";
import { rememberAuthRedirect } from "@/lib/auth/redirectState";
import { popupThenRedirect } from "@/lib/popupThenRedirect";
import { reportError } from "@/lib/telemetry";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getAuth,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged as fbOnAuthStateChanged,
  onIdTokenChanged as fbOnIdTokenChanged,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";

type PersistenceMode = "indexeddb" | "local" | "session" | "unknown";

const PENDING_OAUTH_KEY = "mybodyscan:auth:oauth:pending";
const MAX_AUTH_WAIT_MS = 15_000;
const APPLE_PROVIDER_ID = "apple.com";

function toUserLike(user: any): UserLike | null {
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

function authEvent(kind: string, extra?: Record<string, unknown>) {
  const stamp = Date.now();
  void reportError({
    kind,
    message: kind,
    extra: { at: stamp, ...(extra ?? {}) },
  });
}

function storePending(next: { providerId: string; startedAt: number }) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function clearPending() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_OAUTH_KEY);
  } catch {
    // ignore
  }
}

function isMobileLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod|Android|Mobile|IEMobile|Opera Mini/i.test(ua);
}

function shouldPreferRedirect(): boolean {
  if (typeof window === "undefined") return true;
  if (isMobileLike()) return true;
  try {
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
  } catch {
    // ignore
  }
  try {
    if ((window as any).flutter_inappwebview != null) return true;
  } catch {
    // ignore
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error("Sign-in timed out.");
      err.code = code;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

let authPromise: ReturnType<typeof getAuth> | null = null;
let persistencePromise: Promise<PersistenceMode> | null = null;

async function getWebAuth() {
  if (!hasFirebaseConfig) {
    const reason = "Firebase not configured";
    throw new Error(reason);
  }
  if (!authPromise) {
    authPromise = getAuth(getFirebaseApp());
  }
  return authPromise;
}

// Legacy escape hatch used by error normalization and some web-only helpers.
// Do not import/execute this module on native.
export async function webRequireAuth(): Promise<any> {
  return getWebAuth();
}

export async function ensureWebAuthPersistence(): Promise<PersistenceMode> {
  if (persistencePromise) return persistencePromise;
  persistencePromise = (async () => {
    const auth = await getWebAuth();
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      return "indexeddb";
    } catch {
      // ignore
    }
    try {
      await setPersistence(auth, browserLocalPersistence);
      return "local";
    } catch {
      // ignore
    }
    try {
      await setPersistence(auth, browserSessionPersistence);
      return "session";
    } catch {
      return "unknown";
    }
  })();
  return persistencePromise;
}

export async function finalizeRedirectResult(): Promise<any | null> {
  const auth = await getWebAuth();
  try {
    authEvent("auth_redirect_result", { phase: "start" });
    const result = await getRedirectResult(auth);
    if (result) {
      await maybeApplyAppleProfile(result);
    }
    const info = result ? getAdditionalUserInfo(result) : null;
    authEvent("auth_redirect_result", {
      phase: "done",
      hasResult: Boolean(result),
      providerId: info?.providerId ?? null,
      isNewUser: info?.isNewUser ?? null,
    });
    clearPending();
    return result ?? null;
  } catch (error: any) {
    // Keep existing UI flow: never crash boot; surface via authRedirect error consumer.
    authEvent("auth_error", {
      phase: "redirect_result",
      code: typeof error?.code === "string" ? error.code : null,
      message: typeof error?.message === "string" ? error.message : null,
    });
    clearPending();
    throw error;
  }
}

type AppleAdditionalProfile = {
  name?: { firstName?: string; lastName?: string };
  firstName?: string;
  lastName?: string;
};

async function maybeApplyAppleProfile(result: any) {
  try {
    const info = getAdditionalUserInfo(result);
    if (info?.providerId !== APPLE_PROVIDER_ID) return;
    const user = result?.user;
    if (!info.isNewUser || !user || user.displayName) return;
    const profile = info.profile as AppleAdditionalProfile | undefined;
    const firstName = profile?.name?.firstName ?? profile?.firstName ?? "";
    const lastName = profile?.name?.lastName ?? profile?.lastName ?? "";
    const displayName = `${firstName} ${lastName}`.trim();
    if (!displayName) return;
    await updateProfile(user, { displayName });
  } catch {
    // ignore
  }
}

async function signInWithOAuthProvider(options: {
  providerId: "google.com" | "apple.com";
  provider: any;
  next?: string | null;
}): Promise<void> {
  const startedAt = Date.now();
  authEvent("auth_start", {
    provider: options.providerId,
    next: options.next ?? null,
    startedAt,
    preferRedirect: shouldPreferRedirect(),
  });
  if (options.next) rememberAuthRedirect(options.next);
  storePending({ providerId: options.providerId, startedAt });

  const auth = await getWebAuth();
  const cfg = getFirebaseConfig();
  const origin =
    typeof window !== "undefined" ? window.location.origin : "(unknown)";
  void reportError({
    kind: "auth_origin_check",
    message: "auth_origin_check",
    extra: {
      origin,
      authDomain: cfg?.authDomain ?? null,
      projectId: cfg?.projectId ?? null,
      provider: options.providerId,
    },
  });

  try {
    if (shouldPreferRedirect()) {
      authEvent("auth_redirect_start", { provider: options.providerId });
      await withTimeout(
        (async () => {
          await getRedirectResult(auth).catch(() => undefined);
          await signInWithRedirect(auth, options.provider);
        })(),
        MAX_AUTH_WAIT_MS,
        "auth/timeout"
      );
      return;
    }

    authEvent("auth_popup_start", { provider: options.providerId });
    const cred = await withTimeout(
      popupThenRedirect(auth, options.provider, {
        // These are the real Firebase SDK functions
        signInWithPopup,
        signInWithRedirect,
      }) as any,
      MAX_AUTH_WAIT_MS,
      "auth/timeout"
    );
    if (!cred) {
      // Redirect was initiated
      return;
    }
    authEvent("auth_success", { provider: options.providerId, method: "popup" });
    clearPending();
  } catch (error) {
    authEvent("auth_error", {
      provider: options.providerId,
      code: typeof (error as any)?.code === "string" ? (error as any).code : null,
      message:
        typeof (error as any)?.message === "string" ? (error as any).message : null,
    });
    clearPending();
    throw error;
  }
}

export async function createAccountEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserLike> {
  const auth = await getWebAuth();
  const existing = auth.currentUser;
  const cred = EmailAuthProvider.credential(email, password);
  if (existing?.isAnonymous) {
    const res = await linkWithCredential(existing, cred);
    if (displayName) await updateProfile(res.user, { displayName });
    return toUserLike(res.user)!;
  }
  const res = await fbCreateUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(res.user, { displayName });
  return toUserLike(res.user)!;
}

export const impl: AuthImpl = {
  async getCurrentUser() {
    try {
      const auth = await getWebAuth();
      return toUserLike(auth.currentUser);
    } catch {
      return null;
    }
  },

  async getIdToken(forceRefresh?: boolean) {
    try {
      const auth = await getWebAuth();
      const user = auth.currentUser;
      if (!user) return null;
      return await user.getIdToken(Boolean(forceRefresh));
    } catch {
      return null;
    }
  },

  async onAuthStateChanged(cb: (u: UserLike | null) => void): Promise<Unsubscribe> {
    const auth = await getWebAuth();
    const unsub = fbOnAuthStateChanged(auth, (u) => cb(toUserLike(u)));
    return () => unsub();
  },

  async onIdTokenChanged(cb: (token: string | null) => void): Promise<Unsubscribe> {
    const auth = await getWebAuth();
    const unsub = fbOnIdTokenChanged(auth, async (u) => {
      try {
        const token = u ? await u.getIdToken() : null;
        cb(token);
      } catch {
        cb(null);
      }
    });
    return () => unsub();
  },

  async signOut() {
    const auth = await getWebAuth();
    await fbSignOut(auth);
  },

  async signInWithEmailAndPassword(email: string, password: string) {
    const auth = await getWebAuth();
    const res = await fbSignInWithEmailAndPassword(auth, email, password);
    return toUserLike(res.user)!;
  },

  async createUserWithEmailAndPassword(email: string, password: string) {
    const auth = await getWebAuth();
    const res = await fbCreateUserWithEmailAndPassword(auth, email, password);
    return toUserLike(res.user)!;
  },

  async sendPasswordResetEmail(email: string) {
    const auth = await getWebAuth();
    await fbSendPasswordResetEmail(auth, email);
  },

  async signInWithGoogle(next?: string | null) {
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    await signInWithOAuthProvider({ providerId: "google.com", provider, next });
  },

  async signInWithApple(next?: string | null) {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    await signInWithOAuthProvider({ providerId: "apple.com", provider, next });
  },
};

