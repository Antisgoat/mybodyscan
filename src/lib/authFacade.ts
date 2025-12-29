import type { User } from "firebase/auth";
import { getCachedAuth, signOutAll } from "@/lib/auth";
import { signInWithApple, signInWithGoogle } from "@/lib/auth/providers";
import { isNativeCapacitor } from "@/lib/platform";

type AuthFacade = {
  signInGoogle(next?: string | null): Promise<void>;
  signInApple(next?: string | null): Promise<void>;
  signOut(): Promise<void>;
  getCurrentUser(): User | null;
};

const WebAuth: AuthFacade = {
  async signInGoogle(next) {
    await signInWithGoogle(next);
  },
  async signInApple(next) {
    await signInWithApple(next);
  },
  async signOut() {
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
};

const CapacitorAuth: AuthFacade = {
  async signInGoogle() {
    throw new Error(
      "Native Google sign-in not implemented yet (Capacitor scaffold)."
    );
  },
  async signInApple() {
    throw new Error(
      "Native Apple sign-in not implemented yet (Capacitor scaffold)."
    );
  },
  async signOut() {
    // When native auth is implemented, this should sign out both:
    // - the native provider session
    // - Firebase Auth session
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
};

function impl(): AuthFacade {
  // Never attempt Firebase popup/redirect in a native WebView.
  return isNativeCapacitor() ? CapacitorAuth : WebAuth;
}

export function signInGoogle(next?: string | null) {
  return impl().signInGoogle(next);
}

export function signInApple(next?: string | null) {
  return impl().signInApple(next);
}

export function signOut() {
  return impl().signOut();
}

export function getCurrentUser() {
  return impl().getCurrentUser();
}

