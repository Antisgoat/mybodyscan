import { getFirebaseApp, getFirebaseConfig, hasFirebaseConfig } from "@/lib/firebase";
import { rememberAuthRedirect } from "@/lib/auth/redirectState";
import { popupThenRedirect } from "@/lib/popupThenRedirect";
import { reportError } from "@/lib/telemetry";
import { isCapacitorNative } from "@/lib/platform/isNative";
import * as firebaseAuth from "firebase/auth";
import type { MbsUser, MbsUserCredential, Unsubscribe } from "./mbs-auth.types";

type PersistenceMode = "indexeddb" | "local" | "memory" | "unknown";

type OAuthProviderId = "google.com" | "apple.com";

const PENDING_OAUTH_KEY = "mybodyscan:auth:oauth:pending";
const MAX_AUTH_WAIT_MS = 15_000;
const PERSISTENCE_TIMEOUT_MS = 4_000;
const APPLE_PROVIDER_ID = "apple.com";

function toMbsUser(user: any): MbsUser | null {
  if (!user) return null;
  return {
    uid: String(user.uid || ""),
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    photoURL: typeof user.photoURL === "string" ? user.photoURL : null,
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
    if (isCapacitorNative()) return true;
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

let authPromise: Promise<firebaseAuth.Auth> | null = null;
let persistencePromise: Promise<PersistenceMode> | null = null;

async function loadWebAuthModule() {
  return firebaseAuth;
}

async function getWebAuth() {
  if (!hasFirebaseConfig) {
    const reason = "Firebase not configured";
    throw new Error(reason);
  }
  if (!authPromise) {
    authPromise = (async () => {
      const mod = await loadWebAuthModule();
      return mod.getAuth(getFirebaseApp());
    })();
  }
  return authPromise;
}

export async function webRequireAuth(): Promise<firebaseAuth.Auth> {
  return getWebAuth();
}

export async function ensureWebAuthPersistence(): Promise<PersistenceMode> {
  if (persistencePromise) return persistencePromise;
  persistencePromise = (async () => {
    const auth = await getWebAuth();
    const mod = await loadWebAuthModule();
    const tryPersistence = async (
      persistence: firebaseAuth.Persistence,
      label: PersistenceMode
    ): Promise<PersistenceMode | null> => {
      try {
        await withTimeout(
          mod.setPersistence(auth, persistence),
          PERSISTENCE_TIMEOUT_MS,
          `auth/persistence/${label}`
        );
        return label;
      } catch {
        return null;
      }
    };
    const local = await tryPersistence(mod.browserLocalPersistence, "local");
    if (local) return local;
    const memory = await tryPersistence(mod.inMemoryPersistence, "memory");
    if (memory) return memory;
    return "unknown";
  })();
  return persistencePromise;
}

export async function finalizeRedirectResult(): Promise<any | null> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  try {
    authEvent("auth_redirect_result", { phase: "start" });
    const result = await mod.getRedirectResult(auth);
    if (result) {
      await maybeApplyAppleProfile(result);
    }
    const info = result ? mod.getAdditionalUserInfo(result) : null;
    authEvent("auth_redirect_result", {
      phase: "done",
      hasResult: Boolean(result),
      providerId: info?.providerId ?? null,
      isNewUser: info?.isNewUser ?? null,
    });
    clearPending();
    return result ?? null;
  } catch (error: any) {
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
    const mod = await loadWebAuthModule();
    const info = mod.getAdditionalUserInfo(result);
    if (info?.providerId !== APPLE_PROVIDER_ID) return;
    const user = result?.user;
    if (!info.isNewUser || !user || user.displayName) return;
    const profile = info.profile as AppleAdditionalProfile | undefined;
    const firstName = profile?.name?.firstName ?? profile?.firstName ?? "";
    const lastName = profile?.name?.lastName ?? profile?.lastName ?? "";
    const displayName = `${firstName} ${lastName}`.trim();
    if (!displayName) return;
    await mod.updateProfile(user, { displayName });
  } catch {
    // ignore
  }
}

async function signInWithOAuthProvider(options: {
  providerId: OAuthProviderId;
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
    const mod = await loadWebAuthModule();
    if (shouldPreferRedirect()) {
      authEvent("auth_redirect_start", { provider: options.providerId });
      await withTimeout(
        (async () => {
          await mod.getRedirectResult(auth).catch(() => undefined);
          await mod.signInWithRedirect(auth, options.provider);
        })(),
        MAX_AUTH_WAIT_MS,
        "auth/timeout"
      );
      return;
    }

    authEvent("auth_popup_start", { provider: options.providerId });
    const cred = await withTimeout(
      popupThenRedirect(auth, options.provider, {
        signInWithPopup: mod.signInWithPopup,
        signInWithRedirect: mod.signInWithRedirect,
      }) as any,
      MAX_AUTH_WAIT_MS,
      "auth/timeout"
    );
    if (!cred) {
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

export async function getCurrentUser(): Promise<MbsUser | null> {
  try {
    const auth = await getWebAuth();
    return toMbsUser(auth.currentUser);
  } catch {
    return null;
  }
}

export async function getIdToken(
  forceRefresh?: boolean | { forceRefresh?: boolean }
): Promise<string | null> {
  try {
    const auth = await getWebAuth();
    const user = auth.currentUser;
    if (!user) return null;
    const resolved =
      typeof forceRefresh === "object"
        ? Boolean(forceRefresh?.forceRefresh)
        : Boolean(forceRefresh);
    return await user.getIdToken(resolved);
  } catch {
    return null;
  }
}

export async function onAuthStateChanged(
  cb: (u: MbsUser | null) => void
): Promise<Unsubscribe> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const unsub = mod.onAuthStateChanged(auth, (u: any) => cb(toMbsUser(u)));
  return () => unsub();
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const unsub = mod.onIdTokenChanged(auth, async (u: any) => {
    try {
      const token = u ? await u.getIdToken() : null;
      cb(token);
    } catch {
      cb(null);
    }
  });
  return () => unsub();
}

export async function signOut(): Promise<void> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  await mod.signOut(auth);
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const res = await mod.signInWithEmailAndPassword(auth, email, password);
  return { user: toMbsUser(res.user)! };
}

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const res = await mod.createUserWithEmailAndPassword(auth, email, password);
  return { user: toMbsUser(res.user)! };
}

export async function createAccountEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<MbsUser> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const existing = auth.currentUser;
  const cred = mod.EmailAuthProvider.credential(email, password);
  if (existing?.isAnonymous) {
    const res = await mod.linkWithCredential(existing, cred);
    if (displayName) await mod.updateProfile(res.user, { displayName });
    return toMbsUser(res.user)!;
  }
  const res = await mod.createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await mod.updateProfile(res.user, { displayName });
  return toMbsUser(res.user)!;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  await mod.sendPasswordResetEmail(auth, email);
}

export async function signInWithGoogle(next?: string | null): Promise<void> {
  const mod = await loadWebAuthModule();
  const provider = new mod.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  await signInWithOAuthProvider({ providerId: "google.com", provider, next });
}

export async function signInWithApple(next?: string | null): Promise<void> {
  const mod = await loadWebAuthModule();
  const provider = new mod.OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  await signInWithOAuthProvider({ providerId: "apple.com", provider, next });
}
