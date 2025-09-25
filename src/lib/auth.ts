import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
  GoogleAuthProvider,
  linkWithCredential,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { OAuthProvider, signInWithPopup } from "firebase/auth";

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
  try {
    const provider = new OAuthProvider("apple.com");
    const result = await signInWithPopup(auth, provider);

    // User info
    const user = result.user;

    // Access token & ID token (if needed for backend validation)
    const credential = OAuthProvider.credentialFromResult(result);
    const idToken = credential?.idToken;

    console.log("Apple sign-in successful:", { uid: user.uid, idToken });
    return { user, idToken };
  } catch (error: any) {
    console.error("Apple sign-in error:", error);
    throw error;
  }
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

