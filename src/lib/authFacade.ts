import type { Unsubscribe, User } from "firebase/auth";
import { getCachedAuth, signOutAll } from "@/lib/auth";
import { isNative } from "@/lib/platform";
import { requireAuth } from "@/lib/firebase";

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
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const auth = await requireAuth();
    await signInWithEmailAndPassword(auth, email, password);
  },
  async signUpEmailPassword(email, password) {
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    const auth = await requireAuth();
    await createUserWithEmailAndPassword(auth, email, password);
  },
  async signOut() {
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
  onCurrentUserChanged(cb) {
    cb(getCachedAuth()?.currentUser ?? null);
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth");
        const auth = await requireAuth();
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, cb);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
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
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const auth = await requireAuth();
    await signInWithEmailAndPassword(auth, email, password);
  },
  async signUpEmailPassword(email, password) {
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    const auth = await requireAuth();
    await createUserWithEmailAndPassword(auth, email, password);
  },
  async signOut() {
    // Best-effort: only sign out if auth was already initialized.
    const cached = getCachedAuth();
    if (cached) {
      const { signOut: firebaseSignOut } = await import("firebase/auth");
      await firebaseSignOut(cached).catch(() => undefined);
    }
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
  onCurrentUserChanged(cb) {
    cb(getCachedAuth()?.currentUser ?? null);
    return () => undefined;
  },
};

function impl(): AuthFacade {
  return isNative() ? NativeAuth : WebAuth;
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

