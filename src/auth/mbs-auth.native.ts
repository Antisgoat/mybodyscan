import { FirebaseAuthenticationNative } from "@/native/plugins/firebaseAuthenticationNative";
import type {
  NativeAuthResult,
  NativeAuthUser,
} from "@/native/plugins/firebaseAuthentication";
import type { MbsUser, MbsUserCredential, Unsubscribe } from "./mbs-auth.types";

const NATIVE_POLL_INTERVAL_MS = 3_000;

function toMbsUser(user?: NativeAuthUser | null): MbsUser | null {
  if (!user) return null;
  const photo =
    typeof user.photoURL === "string"
      ? user.photoURL
      : typeof user.photoUrl === "string"
        ? user.photoUrl
        : null;
  return {
    uid: String(user.uid ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    photoURL: photo,
    phoneNumber: typeof user.phoneNumber === "string" ? user.phoneNumber : null,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    providerId: typeof user.providerId === "string" ? user.providerId : null,
  };
}

let nativeCachedUser: MbsUser | null = null;
let nativeListenerAttached = false;

async function refreshNativeCurrentUser(): Promise<MbsUser | null> {
  try {
    const res: NativeAuthResult = await FirebaseAuthenticationNative.getCurrentUser();
    nativeCachedUser = toMbsUser(res?.user ?? null);
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
    if (typeof FirebaseAuthenticationNative?.addListener !== "function") return;
    await FirebaseAuthenticationNative.addListener("authStateChange", (change: any) => {
      nativeCachedUser = toMbsUser(change?.user);
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

export async function getCurrentUser(): Promise<MbsUser | null> {
  await attachNativeListenerIfAvailable();
  if (nativeCachedUser) return nativeCachedUser;
  return refreshNativeCurrentUser();
}

export async function getIdToken(
  forceRefresh?: boolean | { forceRefresh?: boolean }
): Promise<string | null> {
  await attachNativeListenerIfAvailable();
  const resolvedForceRefresh =
    typeof forceRefresh === "object"
      ? Boolean(forceRefresh?.forceRefresh)
      : forceRefresh;
  try {
    if (resolvedForceRefresh != null) {
      try {
        const res = await FirebaseAuthenticationNative.getIdToken({
          forceRefresh: Boolean(resolvedForceRefresh),
        });
        return typeof res?.token === "string" ? res.token : null;
      } catch {
        // fall through to no-args variant
      }
    }
    const res = await FirebaseAuthenticationNative.getIdToken();
    return typeof res?.token === "string" ? res.token : null;
  } catch {
    return null;
  }
}

export async function onAuthStateChanged(
  cb: (u: MbsUser | null) => void
): Promise<Unsubscribe> {
  await attachNativeListenerIfAvailable();
  void refreshNativeCurrentUser().then((u) => {
    try {
      cb(u);
    } catch {
      // ignore
    }
  });

  if (typeof FirebaseAuthenticationNative?.addListener !== "function") {
    return createNativePolling(refreshNativeCurrentUser, cb, NATIVE_POLL_INTERVAL_MS);
  }

  try {
    const handle = await FirebaseAuthenticationNative.addListener(
      "authStateChange",
      (change: any) => {
        nativeCachedUser = toMbsUser(change?.user);
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

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthenticationNative?.addListener !== "function") {
    return createNativePolling(
      async () => await getIdToken(),
      (token) => cb(typeof token === "string" ? token : null),
      NATIVE_POLL_INTERVAL_MS
    );
  }
  try {
    const handle = await FirebaseAuthenticationNative.addListener(
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

export async function signOut(): Promise<void> {
  await attachNativeListenerIfAvailable();
  try {
    await FirebaseAuthenticationNative.signOut();
  } finally {
    nativeCachedUser = null;
  }
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthenticationNative.signInWithEmailAndPassword !== "function") {
    const err: any = new Error("Email/password sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthenticationNative.signInWithEmailAndPassword({
    email,
    password,
  });
  nativeCachedUser = toMbsUser(res?.user ?? null);
  const user = nativeCachedUser ?? (await refreshNativeCurrentUser());
  if (!user || !user.uid) {
    const err: any = new Error("Native sign-in did not return a user");
    err.code = "auth/native-no-user";
    throw err;
  }
  return { user };
}

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthenticationNative.createUserWithEmailAndPassword !== "function") {
    const err: any = new Error("Create user not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthenticationNative.createUserWithEmailAndPassword({
    email,
    password,
  });
  nativeCachedUser = toMbsUser(res?.user ?? null);
  const user = nativeCachedUser ?? (await refreshNativeCurrentUser());
  if (!user || !user.uid) {
    const err: any = new Error("Native sign-up did not return a user");
    err.code = "auth/native-no-user";
    throw err;
  }
  return { user };
}

export async function createAccountEmail(
  email: string,
  password: string
): Promise<MbsUser> {
  const result = await createUserWithEmailAndPassword(email, password);
  return result.user;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (typeof FirebaseAuthenticationNative.sendPasswordResetEmail !== "function") {
    const err: any = new Error("sendPasswordResetEmail not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await FirebaseAuthenticationNative.sendPasswordResetEmail({ email });
}

export async function signInWithGoogle(): Promise<void> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthenticationNative.signInWithGoogle !== "function") {
    const err: any = new Error("Google sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthenticationNative.signInWithGoogle();
  nativeCachedUser = toMbsUser(res?.user ?? null);
}

export async function signInWithApple(): Promise<void> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthenticationNative.signInWithApple !== "function") {
    const err: any = new Error("Apple sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthenticationNative.signInWithApple();
  nativeCachedUser = toMbsUser(res?.user ?? null);
}

export async function webRequireAuth(): Promise<null> {
  return null;
}

export async function ensureWebAuthPersistence(): Promise<"native"> {
  return "native";
}

export async function finalizeRedirectResult(): Promise<null> {
  return null;
}
