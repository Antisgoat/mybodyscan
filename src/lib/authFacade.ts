import type { User } from "firebase/auth";
import { getCachedAuth, signOutAll } from "@/lib/auth";
import { signInWithApple, signInWithGoogle } from "@/lib/auth/providers";
import { isNativeCapacitor } from "@/lib/platform";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from "firebase/auth";

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
  async signInGoogle(next) {
    try {
      const { FirebaseAuthentication } = await import(
        "@capacitor-firebase/authentication"
      );
      const result = await FirebaseAuthentication.signInWithGoogle();
      const nativeCred = result?.credential;
      const idToken = nativeCred?.idToken ?? undefined;
      const accessToken = nativeCred?.accessToken ?? undefined;
      if (!idToken && !accessToken) {
        throw new Error("Native Google sign-in did not return usable tokens.");
      }
      const webCred = GoogleAuthProvider.credential(idToken, accessToken);
      await signInWithCredential(getFirebaseAuth(), webCred);
      return;
    } catch (error) {
      // Fallback: if the Capacitor plugin is missing/unavailable, use web OAuth.
      // This is important for WKWebView builds that temporarily ship without the plugin.
      await WebAuth.signInGoogle(next);
      return;
    }
  },
  async signInApple(next) {
    try {
      const { FirebaseAuthentication } = await import(
        "@capacitor-firebase/authentication"
      );
      const result = await FirebaseAuthentication.signInWithApple();
      const nativeCred = result?.credential;
      const idToken = nativeCred?.idToken ?? undefined;
      const rawNonce = nativeCred?.nonce ?? undefined;
      const accessToken = nativeCred?.accessToken ?? undefined;
      if (!idToken) {
        throw new Error("Native Apple sign-in did not return an idToken.");
      }
      const provider = new OAuthProvider("apple.com");
      const webCred = provider.credential({
        idToken,
        rawNonce,
        accessToken,
      } as any);
      await signInWithCredential(getFirebaseAuth(), webCred);
      return;
    } catch (error) {
      // Fallback: web OAuth redirect flow.
      await WebAuth.signInApple(next);
      return;
    }
  },
  async signOut() {
    // When native auth is implemented, this should sign out both:
    // - the native provider session
    // - Firebase Auth session
    try {
      const { FirebaseAuthentication } = await import(
        "@capacitor-firebase/authentication"
      );
      await FirebaseAuthentication.signOut().catch(() => undefined);
    } catch {
      // ignore plugin issues; still sign out web session
    }
    await signOutAll();
  },
  getCurrentUser() {
    return getCachedAuth()?.currentUser ?? null;
  },
};

function impl(): AuthFacade {
  // Prefer native auth in Capacitor, but keep a safe fallback inside each method.
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

