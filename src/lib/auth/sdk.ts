import { getFirebaseApp, getFirebaseConfig, hasFirebaseConfig } from "@/lib/firebase";
import { rememberAuthRedirect } from "@/lib/auth/redirectState";
import { popupThenRedirect } from "@/lib/popupThenRedirect";
import { reportError } from "@/lib/telemetry";

export type UserLike = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string | null;
};

export type Unsubscribe = () => void;

type PersistenceMode = "indexeddb" | "local" | "session" | "unknown";

type NativeAuthUser = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string | null;
};

type NativeAuthResult = { user?: NativeAuthUser | null };

type OAuthProviderId = "google.com" | "apple.com";

const isNativeBuild = __MBS_NATIVE__;

const PENDING_OAUTH_KEY = "mybodyscan:auth:oauth:pending";
const MAX_AUTH_WAIT_MS = 15_000;
const APPLE_PROVIDER_ID = "apple.com";
const NATIVE_POLL_INTERVAL_MS = 3_000;

function toWebUserLike(user: any): UserLike | null {
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

function toNativeUserLike(user: NativeAuthUser | null | undefined): UserLike | null {
  if (!user) return null;
  return {
    uid: String(user.uid ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    photoUrl: typeof user.photoUrl === "string" ? user.photoUrl : null,
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

let authPromise: Promise<any> | null = null;
let webAuthModulePromise: Promise<any> | null = null;
let persistencePromise: Promise<PersistenceMode> | null = null;

async function loadWebAuthModule() {
  if (!webAuthModulePromise) {
    webAuthModulePromise = import("firebase/auth");
  }
  return webAuthModulePromise;
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

async function getNativeAuthPlugin() {
  const mod = await import("@/lib/native/firebaseAuthentication");
  return mod.FirebaseAuthentication;
}

export async function webRequireAuth(): Promise<any> {
  if (isNativeBuild) return null;
  return getWebAuth();
}

export async function ensureWebAuthPersistence(): Promise<PersistenceMode> {
  if (isNativeBuild) return "unknown";
  if (persistencePromise) return persistencePromise;
  persistencePromise = (async () => {
    const auth = await getWebAuth();
    const mod = await loadWebAuthModule();
    try {
      await mod.setPersistence(auth, mod.indexedDBLocalPersistence);
      return "indexeddb";
    } catch {
      // ignore
    }
    try {
      await mod.setPersistence(auth, mod.browserLocalPersistence);
      return "local";
    } catch {
      // ignore
    }
    try {
      await mod.setPersistence(auth, mod.browserSessionPersistence);
      return "session";
    } catch {
      return "unknown";
    }
  })();
  return persistencePromise;
}

export async function finalizeRedirectResult(): Promise<any | null> {
  if (isNativeBuild) return null;
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

let nativeCachedUser: UserLike | null = null;
let nativeListenerAttached = false;

async function refreshNativeCurrentUser(): Promise<UserLike | null> {
  try {
    const FirebaseAuthentication = await getNativeAuthPlugin();
    const res: NativeAuthResult = await FirebaseAuthentication.getCurrentUser();
    nativeCachedUser = toNativeUserLike(res?.user ?? null);
    return nativeCachedUser;
  } catch {
    nativeCachedUser = null;
    return null;
  }
}

async function attachNativeListenerIfAvailable(): Promise<void> {
  if (nativeListenerAttached) return;
  nativeListenerAttached = true;
  try {
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication?.addListener !== "function") return;
    await FirebaseAuthentication.addListener("authStateChange", (change: any) => {
      nativeCachedUser = toNativeUserLike(change?.user);
    });
  } catch {
    // ignore
  }
}

function createNativePolling<T>(
  poll: () => Promise<T | null>,
  onChange: (value: T | null) => void,
  intervalMs: number
): Unsubscribe {
  let stopped = false;
  let lastSerialized = "";
  const tick = async () => {
    if (stopped) return;
    try {
      const value = await poll();
      const serialized = JSON.stringify(value ?? null);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        onChange(value ?? null);
      }
    } catch {
      // ignore
    }
  };
  void tick();
  const handle = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

export async function getCurrentUser(): Promise<UserLike | null> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    if (nativeCachedUser) return nativeCachedUser;
    return refreshNativeCurrentUser();
  }
  try {
    const auth = await getWebAuth();
    return toWebUserLike(auth.currentUser);
  } catch {
    return null;
  }
}

export async function getIdToken(forceRefresh?: boolean): Promise<string | null> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    try {
      const FirebaseAuthentication = await getNativeAuthPlugin();
      if (forceRefresh != null) {
        try {
          const res = await FirebaseAuthentication.getIdToken({
            forceRefresh: Boolean(forceRefresh),
          });
          return typeof res?.token === "string" ? res.token : null;
        } catch {
          // fall through to no-args variant
        }
      }
      const res = await FirebaseAuthentication.getIdToken();
      return typeof res?.token === "string" ? res.token : null;
    } catch {
      return null;
    }
  }
  try {
    const auth = await getWebAuth();
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken(Boolean(forceRefresh));
  } catch {
    return null;
  }
}

export async function onAuthStateChanged(
  cb: (u: UserLike | null) => void
): Promise<Unsubscribe> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    void refreshNativeCurrentUser().then((u) => {
      try {
        cb(u);
      } catch {
        // ignore
      }
    });

    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication?.addListener !== "function") {
      return createNativePolling(refreshNativeCurrentUser, cb, NATIVE_POLL_INTERVAL_MS);
    }

    try {
      const handle = await FirebaseAuthentication.addListener(
        "authStateChange",
        (change: any) => {
          nativeCachedUser = toNativeUserLike(change?.user);
          try {
            cb(nativeCachedUser);
          } catch {
            // ignore
          }
        }
      );
      return () => {
        try {
          void handle?.remove?.();
        } catch {
          // ignore
        }
      };
    } catch {
      return () => undefined;
    }
  }

  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const unsub = mod.onAuthStateChanged(auth, (u: any) => cb(toWebUserLike(u)));
  return () => unsub();
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication?.addListener !== "function") {
      return createNativePolling(
        async () => await getIdToken(),
        (token) => cb(typeof token === "string" ? token : null),
        NATIVE_POLL_INTERVAL_MS
      );
    }
    try {
      const handle = await FirebaseAuthentication.addListener(
        "idTokenChange",
        (change: any) => {
          const token = typeof change?.token === "string" ? change.token : null;
          try {
            cb(token);
          } catch {
            // ignore
          }
        }
      );
      return () => {
        try {
          void handle?.remove?.();
        } catch {
          // ignore
        }
      };
    } catch {
      return () => undefined;
    }
  }

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
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    const FirebaseAuthentication = await getNativeAuthPlugin();
    await FirebaseAuthentication.signOut();
    nativeCachedUser = null;
    return;
  }
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  await mod.signOut(auth);
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication.signInWithEmailAndPassword !== "function") {
      const err: any = new Error("Email/password sign-in not supported");
      err.code = "auth/unsupported";
      throw err;
    }
    const res: NativeAuthResult = await FirebaseAuthentication.signInWithEmailAndPassword({
      email,
      password,
    });
    nativeCachedUser = toNativeUserLike(res?.user ?? null);
    const u = nativeCachedUser ?? (await refreshNativeCurrentUser());
    if (!u || !u.uid) {
      const err: any = new Error("Native sign-in did not return a user");
      err.code = "auth/native-no-user";
      throw err;
    }
    return u;
  }
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const res = await mod.signInWithEmailAndPassword(auth, email, password);
  return toWebUserLike(res.user)!;
}

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication.createUserWithEmailAndPassword !== "function") {
      const err: any = new Error("Create user not supported");
      err.code = "auth/unsupported";
      throw err;
    }
    const res: NativeAuthResult = await FirebaseAuthentication.createUserWithEmailAndPassword({
      email,
      password,
    });
    nativeCachedUser = toNativeUserLike(res?.user ?? null);
    const u = nativeCachedUser ?? (await refreshNativeCurrentUser());
    if (!u || !u.uid) {
      const err: any = new Error("Native sign-up did not return a user");
      err.code = "auth/native-no-user";
      throw err;
    }
    return u;
  }
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const res = await mod.createUserWithEmailAndPassword(auth, email, password);
  return toWebUserLike(res.user)!;
}

export async function createAccountEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserLike> {
  if (isNativeBuild) {
    return createUserWithEmailAndPassword(email, password);
  }
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  const existing = auth.currentUser;
  const cred = mod.EmailAuthProvider.credential(email, password);
  if (existing?.isAnonymous) {
    const res = await mod.linkWithCredential(existing, cred);
    if (displayName) await mod.updateProfile(res.user, { displayName });
    return toWebUserLike(res.user)!;
  }
  const res = await mod.createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await mod.updateProfile(res.user, { displayName });
  return toWebUserLike(res.user)!;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (isNativeBuild) {
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication.sendPasswordResetEmail !== "function") {
      const err: any = new Error("sendPasswordResetEmail not supported");
      err.code = "auth/unsupported";
      throw err;
    }
    await FirebaseAuthentication.sendPasswordResetEmail({ email });
    return;
  }
  const auth = await getWebAuth();
  const mod = await loadWebAuthModule();
  await mod.sendPasswordResetEmail(auth, email);
}

export async function signInWithGoogle(next?: string | null): Promise<void> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication.signInWithGoogle !== "function") {
      const err: any = new Error("Google sign-in not supported");
      err.code = "auth/unsupported";
      throw err;
    }
    const res: NativeAuthResult = await FirebaseAuthentication.signInWithGoogle();
    nativeCachedUser = toNativeUserLike(res?.user ?? null);
    return;
  }
  const mod = await loadWebAuthModule();
  const provider = new mod.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  await signInWithOAuthProvider({ providerId: "google.com", provider, next });
}

export async function signInWithApple(next?: string | null): Promise<void> {
  if (isNativeBuild) {
    await attachNativeListenerIfAvailable();
    const FirebaseAuthentication = await getNativeAuthPlugin();
    if (typeof FirebaseAuthentication.signInWithApple !== "function") {
      const err: any = new Error("Apple sign-in not supported");
      err.code = "auth/unsupported";
      throw err;
    }
    const res: NativeAuthResult = await FirebaseAuthentication.signInWithApple();
    nativeCachedUser = toNativeUserLike(res?.user ?? null);
    return;
  }
  const mod = await loadWebAuthModule();
  const provider = new mod.OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  await signInWithOAuthProvider({ providerId: "apple.com", provider, next });
}
