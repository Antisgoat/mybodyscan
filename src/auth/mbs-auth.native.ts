import {
  createUserWithEmailAndPassword as webCreateUserWithEmailAndPassword,
  getIdToken as webGetIdToken,
  onAuthStateChanged as webOnAuthStateChanged,
  onIdTokenChanged as webOnIdTokenChanged,
  sendPasswordResetEmail as webSendPasswordResetEmail,
  signInWithEmailAndPassword as webSignInWithEmailAndPassword,
  signOut as webSignOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import { FirebaseAuthenticationNative } from "@/native/plugins/firebaseAuthenticationNative";
import type {
  NativeAuthResult,
  NativeAuthUser,
} from "@/native/plugins/firebaseAuthentication";
import type { MbsUser, MbsUserCredential, Unsubscribe } from "./mbs-auth.types";

function toMbsUser(user?: NativeAuthUser | User | null): MbsUser | null {
  if (!user) return null;
  const anyUser = user as NativeAuthUser;
  const photo =
    typeof (user as User).photoURL === "string"
      ? (user as User).photoURL
      : typeof anyUser.photoURL === "string"
        ? anyUser.photoURL
        : typeof anyUser.photoUrl === "string"
          ? anyUser.photoUrl
          : null;
  return {
    uid: String((user as User).uid ?? anyUser.uid ?? ""),
    email:
      typeof (user as User).email === "string"
        ? (user as User).email
        : typeof anyUser.email === "string"
          ? anyUser.email
          : null,
    displayName:
      typeof (user as User).displayName === "string"
        ? (user as User).displayName
        : typeof anyUser.displayName === "string"
          ? anyUser.displayName
          : null,
    photoURL: photo,
    phoneNumber:
      typeof (user as User).phoneNumber === "string"
        ? (user as User).phoneNumber
        : typeof anyUser.phoneNumber === "string"
          ? anyUser.phoneNumber
          : null,
    emailVerified: Boolean((user as User).emailVerified ?? anyUser.emailVerified),
    isAnonymous: Boolean((user as User).isAnonymous ?? anyUser.isAnonymous),
    providerId:
      typeof (user as User).providerId === "string"
        ? (user as User).providerId
        : typeof anyUser.providerId === "string"
          ? anyUser.providerId
          : null,
  };
}

export async function getCurrentUser(): Promise<MbsUser | null> {
  return toMbsUser(auth.currentUser ?? null);
}

export async function getIdToken(
  forceRefresh?: boolean | { forceRefresh?: boolean }
): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const resolvedForceRefresh =
    typeof forceRefresh === "object"
      ? Boolean(forceRefresh?.forceRefresh)
      : Boolean(forceRefresh);
  try {
    return await webGetIdToken(user, resolvedForceRefresh);
  } catch {
    return null;
  }
}

export async function onAuthStateChanged(
  cb: (u: MbsUser | null) => void
): Promise<Unsubscribe> {
  const unsubscribe = webOnAuthStateChanged(auth, (user) => {
    cb(toMbsUser(user));
  });
  return () => unsubscribe();
}

export async function onIdTokenChanged(
  cb: (token: string | null) => void
): Promise<Unsubscribe> {
  const unsubscribe = webOnIdTokenChanged(auth, async (user) => {
    if (!user) {
      cb(null);
      return;
    }
    try {
      const token = await webGetIdToken(user);
      cb(token);
    } catch {
      cb(null);
    }
  });
  return () => unsubscribe();
}

export async function signOut(): Promise<void> {
  await webSignOut(auth);
}

export async function signInWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  const res = await webSignInWithEmailAndPassword(auth, email, password);
  const user = toMbsUser(res.user);
  if (!user || !user.uid) {
    const err: any = new Error("Native web sign-in did not return a user");
    err.code = "auth/native-no-user";
    throw err;
  }
  return { user };
}

export async function createUserWithEmailAndPassword(
  email: string,
  password: string
): Promise<MbsUserCredential> {
  const res = await webCreateUserWithEmailAndPassword(auth, email, password);
  const user = toMbsUser(res.user);
  if (!user || !user.uid) {
    const err: any = new Error("Native web sign-up did not return a user");
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
  await webSendPasswordResetEmail(auth, email);
}

export async function signInWithGoogle(): Promise<void> {
  if (typeof FirebaseAuthenticationNative.signInWithGoogle !== "function") {
    const err: any = new Error("Google sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthenticationNative.signInWithGoogle();
  const user = toMbsUser(res?.user ?? null);
  if (!user) {
    const err: any = new Error("Native Google sign-in did not return a user");
    err.code = "auth/native-no-user";
    throw err;
  }
}

export async function signInWithApple(): Promise<void> {
  if (typeof FirebaseAuthenticationNative.signInWithApple !== "function") {
    const err: any = new Error("Apple sign-in not supported");
    err.code = "auth/unsupported";
    throw err;
  }
  const res: NativeAuthResult = await FirebaseAuthenticationNative.signInWithApple();
  const user = toMbsUser(res?.user ?? null);
  if (!user) {
    const err: any = new Error("Native Apple sign-in did not return a user");
    err.code = "auth/native-no-user";
    throw err;
  }
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
