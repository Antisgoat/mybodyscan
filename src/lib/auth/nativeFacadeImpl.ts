import type { AuthFacade } from "@/lib/auth/facadeTypes";
import {
  nativeAuthStateListener,
  nativeCreateUserEmail,
  nativeGetCurrentUser,
  nativeGetIdToken,
  nativeIdTokenListener,
  nativeSendPasswordResetEmail,
  nativeSignInEmail,
  nativeSignOut,
} from "@/lib/auth/nativeAuth";

export const nativeAuthImpl: AuthFacade = {
  async signInGoogle() {
    throw new Error(
      "Google sign-in is not available on iOS. Use email/password."
    );
  },
  async signInApple() {
    throw new Error("Apple sign-in is not available on iOS. Use email/password.");
  },
  async signInEmail(email, password) {
    const res = await nativeSignInEmail(email, password);
    return res.user;
  },
  async createUserEmail(email, password) {
    const res = await nativeCreateUserEmail(email, password);
    return res.user;
  },
  async signOut() {
    await nativeSignOut();
  },
  async sendPasswordResetEmail(email) {
    await nativeSendPasswordResetEmail(email);
  },
  async getCurrentUser() {
    return nativeGetCurrentUser();
  },
  async getIdToken(options) {
    return nativeGetIdToken(options);
  },
  async onAuthStateChanged(cb) {
    return nativeAuthStateListener(cb);
  },
  async onIdTokenChanged(cb) {
    return nativeIdTokenListener(cb);
  },
};

