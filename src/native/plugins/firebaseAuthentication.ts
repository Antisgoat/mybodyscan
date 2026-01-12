import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeAuthUser = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  isAnonymous?: boolean;
  providerId?: string | null;
};

export type NativeAuthResult = { user?: NativeAuthUser | null };
export type NativeIdTokenResult = { token?: string | null };

export type FirebaseAuthenticationNativePlugin = {
  getCurrentUser(): Promise<NativeAuthResult>;
  getIdToken(options?: { forceRefresh?: boolean }): Promise<NativeIdTokenResult>;
  signOut(): Promise<void>;

  signInWithEmailAndPassword(options: {
    email: string;
    password: string;
  }): Promise<NativeAuthResult>;

  createUserWithEmailAndPassword(options: {
    email: string;
    password: string;
  }): Promise<NativeAuthResult>;

  sendPasswordResetEmail?(options: { email: string }): Promise<void>;
  signInWithGoogle?(): Promise<NativeAuthResult>;
  signInWithApple?(): Promise<NativeAuthResult>;

  addListener(
    eventName: "authStateChange" | "idTokenChange",
    listenerFunc: (event: any) => void
  ): Promise<PluginListenerHandle>;
};

export const FirebaseAuthenticationNative = registerPlugin<FirebaseAuthenticationNativePlugin>(
  "FirebaseAuthentication"
);
