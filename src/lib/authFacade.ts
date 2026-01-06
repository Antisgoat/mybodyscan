import type { Unsubscribe, User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getCachedAuth, signOutAll } from "@/lib/auth";
import { isNativeCapacitor } from "@/lib/platform";
import { getFirebaseAuth } from "@/lib/firebase";

type AuthFacade = {
  signInGoogle(next?: string | null): Promise<void>;
  signInApple(next?: string | null): Promise<void>;
  signInEmailPassword(email: string, password: string): Promise<void>;
  signUpEmailPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getCurrentUser(): User | null;
  onCurrentUserChanged(cb: (user: User | null) => void): Unsubscribe;
};

const WebAuth: AuthFacade = {
  async signInGoogle(next) {
    const { signInWithGoogle } = await import("@/lib/auth/providers");
    await signInWithGoogle(next);
  },
  async signInApple(next) {
    const { signInWithApple } = await import("@/lib/auth/providers");
    await signInWithApple(next);
  },
  async signInEmailPassword(email, password) {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  },
  async signUpEmailPassword(email, password) {
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  },
  async signOut() {
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
  onCurrentUserChanged(cb) {
    return onAuthStateChanged(getFirebaseAuth(), cb);
  },
};

const NativeAuth: AuthFacade = {
  async signInGoogle() {
    // Non-negotiable: do NOT run web popup/redirect OAuth inside WKWebView.
    // To ship quickly and comply with App Store review, we use email/password on iOS for now.
    throw new Error("Google sign-in is not available on iOS. Use email/password.");
  },
  async signInApple() {
    // Non-negotiable: do NOT run web redirect OAuth inside WKWebView.
    throw new Error("Apple sign-in is not available on iOS. Use email/password.");
  },
  async signInEmailPassword(email, password) {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  },
  async signUpEmailPassword(email, password) {
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  },
  async signOut() {
    // Ensure Firebase session is cleared even if native provider sessions exist.
    await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
  onCurrentUserChanged(cb) {
    return onAuthStateChanged(getFirebaseAuth(), cb);
  },
};

function impl(): AuthFacade {
  return isNativeCapacitor() ? NativeAuth : WebAuth;
}

export function signInGoogle(next?: string | null) {
  return impl().signInGoogle(next);
}

export function signInApple(next?: string | null) {
  return impl().signInApple(next);
}

export function signInEmailPassword(email: string, password: string) {
  return impl().signInEmailPassword(email, password);
}

export function signUpEmailPassword(email: string, password: string) {
  return impl().signUpEmailPassword(email, password);
}

export function signOut() {
  return impl().signOut();
}

export function getCurrentUser() {
  return impl().getCurrentUser();
}

export function onCurrentUserChanged(cb: (user: User | null) => void) {
  return impl().onCurrentUserChanged(cb);
}

