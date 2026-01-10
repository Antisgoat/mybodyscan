import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import type { AuthImpl } from "./facade";
import type { Unsubscribe, UserLike } from "./types";

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
type IdTokenResult = { token?: string | null };

type FirebaseAuthenticationPlugin = {
  getCurrentUser(): Promise<NativeAuthResult>;
  getIdToken(options?: { forceRefresh?: boolean }): Promise<IdTokenResult>;
  signOut(): Promise<void>;
  signInWithEmailAndPassword(options: {
    email: string;
    password: string;
  }): Promise<NativeAuthResult>;
  createUserWithEmailAndPassword(options: {
    email: string;
    password: string;
  }): Promise<NativeAuthResult>;
  sendPasswordResetEmail?(options: { email: string }): Promise<void>;
  signInWithGoogle?(): Promise<NativeAuthResult>;
  signInWithApple?(): Promise<NativeAuthResult>;
  addListener?(
    eventName: "authStateChange" | "idTokenChange",
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
};

const FirebaseAuthentication =
  registerPlugin<FirebaseAuthenticationPlugin>("FirebaseAuthentication");

const NATIVE_POLL_INTERVAL_MS = 3_000;

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

let nativeCachedUser: UserLike | null = null;
let nativeListenerAttached = false;

async function refreshNativeCurrentUser(): Promise<UserLike | null> {
  try {
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
  await attachNativeListenerIfAvailable();
  if (nativeCachedUser) return nativeCachedUser;
  return refreshNativeCurrentUser();
}

export async function getIdToken(forceRefresh?: boolean): Promise<string | null> {
  await attachNativeListenerIfAvailable();
  try {
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

export async function onAuthStateChanged(
  cb: (u: UserLike | null) => void
): Promise<Unsubscribe> {
  await attachNativeListenerIfAvailable();
  void refreshNativeCurrentUser().then((u) => {
    try {
      cb(u);
    } catch {
      // ignore
    }
  });

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

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  await attachNativeListenerIfAvailable();
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

export async function signOut(): Promise<void> {
  await attachNativeListenerIfAvailable();
  await FirebaseAuthentication.signOut();
  nativeCachedUser = null;
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  await attachNativeListenerIfAvailable();
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

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<UserLike> {
  await attachNativeListenerIfAvailable();
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

export async function createAccountEmail(
  email: string,
  password: string
): Promise<UserLike> {
  return createUserWithEmailAndPassword(email, password);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (typeof FirebaseAuthentication.sendPasswordResetEmail !== "function") {
    const err: any = new Error("sendPasswordResetEmail not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  await FirebaseAuthentication.sendPasswordResetEmail({ email });
}

export async function signInWithGoogle(): Promise<void> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthentication.signInWithGoogle !== "function") {
    const err: any = new Error("Google sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthentication.signInWithGoogle();
  nativeCachedUser = toNativeUserLike(res?.user ?? null);
}

export async function signInWithApple(): Promise<void> {
  await attachNativeListenerIfAvailable();
  if (typeof FirebaseAuthentication.signInWithApple !== "function") {
    const err: any = new Error("Apple sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthentication.signInWithApple();
  nativeCachedUser = toNativeUserLike(res?.user ?? null);
}

export const impl: AuthImpl = {
  getCurrentUser,
  getIdToken,
  onAuthStateChanged,
  onIdTokenChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  createAccountEmail,
  sendPasswordResetEmail,
  signInWithGoogle,
  signInWithApple,
};
