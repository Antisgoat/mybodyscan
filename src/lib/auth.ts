import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";

export async function initAuthPersistence() {
  await setPersistence(auth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<typeof auth.currentUser>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading } as { user: typeof auth.currentUser; loading: boolean };
}

export async function signOutToAuth(): Promise<void> {
  await signOut(auth);
  window.location.href = "/auth";
}

// New helpers
export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signInWithApple() {
  if (import.meta.env.VITE_APPLE_AUTH_ENABLED !== "true") {
    throw new Error("Apple Sign-In not configured");
  }
  const provider = new OAuthProvider("apple.com");
  provider.addScope("name");
  provider.addScope("email");
  await signInWithPopup(auth, provider);
}

export async function createAccountEmail(email: string, password: string, displayName?: string) {
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

export function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function sendReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export function signOutAll() {
  return signOut(auth);
}

