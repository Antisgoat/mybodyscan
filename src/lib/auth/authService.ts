import {
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "@/lib/firebase";
import type { MbsUser, Unsubscribe } from "@/auth/mbs-auth.types";

function toMbsUser(user: User | null): MbsUser | null {
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

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<MbsUser> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const user = toMbsUser(result.user);
  if (!user) {
    throw new Error("Auth sign-in did not return a user.");
  }
  return user;
}

export async function createAccountEmail(
  email: string,
  password: string
): Promise<MbsUser> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user = toMbsUser(result.user);
  if (!user) {
    throw new Error("Auth sign-up did not return a user.");
  }
  return user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutAuth(): Promise<void> {
  await signOut(auth);
}

export function getCurrentUser(): MbsUser | null {
  return toMbsUser(auth.currentUser ?? null);
}

export async function onAuthStateChangedSafe(
  cb: (user: MbsUser | null) => void
): Promise<Unsubscribe> {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    cb(toMbsUser(user));
  });
  return () => unsubscribe();
}

export async function getIdTokenSafe(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await getIdToken(user, Boolean(options?.forceRefresh));
  } catch {
    return null;
  }
}
