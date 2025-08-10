import { useEffect, useState } from "react";
import { auth, app } from "../firebaseConfig";
import { onAuthStateChanged, setPersistence, browserLocalPersistence, signOut, getAuth, GoogleAuthProvider, signInWithRedirect, signInAnonymously } from "firebase/auth";

export async function initAuthPersistence() {
  await setPersistence(auth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<ReturnType<typeof auth.currentUser> | any>(auth.currentUser);
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
  // use navigate-equivalent without requiring hooks
  window.location.href = "/auth";
}

// Google, Guest, and Sign-out helpers (modular v9)
export function signInWithGoogle() {
  return signInWithRedirect(getAuth(app), new GoogleAuthProvider());
}

export function signOutUser() {
  return signOut(getAuth(app));
}

export function signInGuest() {
  return signInAnonymously(getAuth(app));
}
