import { useEffect, useState } from "react";
import { auth as firebaseAuth } from "@/lib/firebase";
import {
  Auth,
  OAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth";

export async function initAuthPersistence() {
  await setPersistence(firebaseAuth, browserLocalPersistence);
}

export function useAuthUser() {
  const [user, setUser] = useState<typeof firebaseAuth.currentUser>(firebaseAuth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading } as { user: typeof firebaseAuth.currentUser; loading: boolean };
}

export async function signOutToAuth(): Promise<void> {
  await signOut(firebaseAuth);
  window.location.href = "/auth";
}

// New helpers
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(firebaseAuth, provider);
  } catch (err: any) {
    const code = String(err?.code || "");
    if (
      code.includes("popup-blocked") ||
      code.includes("popup-closed-by-user") ||
      code.includes("operation-not-supported-in-this-environment")
    ) {
      await signInWithRedirect(firebaseAuth, provider);
      return;
    }
    throw err;
  }
}

type AppleAdditionalProfile = {
  name?: { firstName?: string; lastName?: string };
  firstName?: string;
  lastName?: string;
};

export async function signInWithApple(auth: Auth): Promise<void> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  try {
    if (isIOS) {
      await signInWithRedirect(auth, provider);
      return;
    }

    const result = await signInWithPopup(auth, provider);
    const info = getAdditionalUserInfo(result);
    if (info?.isNewUser && result.user && !result.user.displayName) {
      const profile = info.profile as AppleAdditionalProfile | undefined;
      const firstName = profile?.name?.firstName ?? profile?.firstName ?? "";
      const lastName = profile?.name?.lastName ?? profile?.lastName ?? "";
      const displayName = `${firstName} ${lastName}`.trim();
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }
    }
  } catch (err: any) {
    const msg = String(err?.code || "");
    if (
      msg.includes("popup-blocked") ||
      msg.includes("popup-closed-by-user") ||
      msg.includes("operation-not-supported-in-this-environment")
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export async function createAccountEmail(email: string, password: string, displayName?: string) {
  const user = firebaseAuth.currentUser;
  const cred = EmailAuthProvider.credential(email, password);
  if (user?.isAnonymous) {
    const res = await linkWithCredential(user, cred);
    if (displayName) await updateProfile(res.user, { displayName });
    return res.user;
  }
  const res = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (displayName) await updateProfile(res.user, { displayName });
  return res.user;
}

export function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

export function sendReset(email: string) {
  return sendPasswordResetEmail(firebaseAuth, email);
}

export function signOutAll() {
  return signOut(firebaseAuth);
}

