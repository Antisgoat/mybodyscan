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
import {
  signInWithApple as webSignInWithApple,
  signInWithGoogle as webSignInWithGoogle,
} from "./mbs-auth.web";
import type { MbsUser, MbsUserCredential, Unsubscribe } from "./mbs-auth.types";

function toMbsUser(user?: User | null): MbsUser | null {
  if (!user) return null;
  return {
    uid: String(user.uid ?? ""),
    email:
      typeof user.email === "string"
        ? user.email
        : null,
    displayName:
      typeof user.displayName === "string"
        ? user.displayName
        : null,
    photoURL: typeof user.photoURL === "string" ? user.photoURL : null,
    phoneNumber:
      typeof user.phoneNumber === "string"
        ? user.phoneNumber
        : null,
    emailVerified: Boolean(user.emailVerified),
    isAnonymous: Boolean(user.isAnonymous),
    providerId:
      typeof user.providerId === "string"
        ? user.providerId
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
  await webSignInWithGoogle(null);
}

export async function signInWithApple(): Promise<void> {
  await webSignInWithApple(null);
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
