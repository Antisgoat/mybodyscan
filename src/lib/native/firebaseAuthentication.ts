import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * Native-only Capacitor plugin access.
 *
 * CRITICAL:
 * - Do NOT import the Capacitor Firebase Authentication JS package anywhere in `src/`.
 * - This keeps native builds from bundling the package's web implementation chunk
 *   (which can pull in Firebase JS Auth).
 */

type NativeAuthUser = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string | null;
};

type CurrentUserResult = { user?: NativeAuthUser | null };
type IdTokenResult = { token?: string | null };

export type FirebaseAuthenticationPlugin = {
  getCurrentUser(): Promise<CurrentUserResult>;
  getIdToken(options?: { forceRefresh?: boolean }): Promise<IdTokenResult>;
  signOut(): Promise<void>;

  signInWithEmailAndPassword(options: {
    email: string;
    password: string;
  }): Promise<CurrentUserResult>;

  createUserWithEmailAndPassword(options: {
    email: string;
    password: string;
  }): Promise<CurrentUserResult>;

  sendPasswordResetEmail?(options: { email: string }): Promise<void>;

  // Optional providers used by native builds.
  signInWithGoogle?(): Promise<CurrentUserResult>;
  signInWithApple?(): Promise<CurrentUserResult>;

  addListener?(
    eventName: "authStateChange" | "idTokenChange",
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
};

export const FirebaseAuthentication =
  registerPlugin<FirebaseAuthenticationPlugin>("FirebaseAuthentication");

