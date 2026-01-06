type Unsubscribe = () => void;
type User = import("firebase/auth").User;
import { getCachedAuth, signOutAll } from "@/lib/auth";
import { isNativeCapacitor } from "@/lib/platform";
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
    const auth = await requireAuth();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(auth, email, password);
  },
  async signUpEmailPassword(email, password) {
    const auth = await requireAuth();
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    await createUserWithEmailAndPassword(auth, email, password);
  },
  async signOut() {
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
  onCurrentUserChanged(cb) {
    let cancelled = false;
    let unsub: Unsubscribe | null = null;
    void (async () => {
      try {
        const auth = await requireAuth();
        if (cancelled) return;
        const { onAuthStateChanged } = await import("firebase/auth");
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
    const auth = await requireAuth();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    await signInWithEmailAndPassword(auth, email, password);
  },
  async signUpEmailPassword(email, password) {
    const auth = await requireAuth();
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    await createUserWithEmailAndPassword(auth, email, password);
  },
  async signOut() {
    // Ensure Firebase session is cleared even if native provider sessions exist.
    try {
      const auth = await requireAuth();
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch {
      // ignore
    }
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
  onCurrentUserChanged(cb) {
    let cancelled = false;
    let unsub: Unsubscribe | null = null;
    void (async () => {
      try {
        const auth = await requireAuth();
        if (cancelled) return;
        const { onAuthStateChanged } = await import("firebase/auth");
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

