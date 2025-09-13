import { useEffect, useState } from "react";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { onAuthStateChanged, setPersistence, browserLocalPersistence, signOut, GoogleAuthProvider, signInWithRedirect, signInWithPopup, signInAnonymously, linkWithCredential, EmailAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from "firebase/auth";

export async function initAuthPersistence() {
  if (!isFirebaseConfigured) return;
  await setPersistence(auth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<typeof auth.currentUser>(auth.currentUser);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setLoading(false);
      return;
    }
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
export function signInGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function signInGuest() {
  return signInAnonymously(auth);
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

export function signOutUser() {
  return signOut(auth);
}

