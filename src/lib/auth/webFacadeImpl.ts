import type { AuthFacade } from "@/lib/auth/facadeTypes";
import {
  webCreateAccountEmail,
  webGetCurrentUser,
  webGetIdToken,
  webOnAuthStateChanged,
  webOnIdTokenChanged,
  webSendPasswordResetEmail,
  webSignInApple,
  webSignInEmail,
  webSignInGoogle,
  webSignOut,
} from "@/lib/auth/webFirebaseAuth";

export const webAuthImpl: AuthFacade = {
  async signInGoogle(next) {
    await webSignInGoogle(next);
  },
  async signInApple(next) {
    await webSignInApple(next);
  },
  async signInEmail(email, password) {
    const res = await webSignInEmail(email, password);
    return res.user;
  },
  async createUserEmail(email, password) {
    const res = await webCreateAccountEmail(email, password);
    return res.user;
  },
  async signOut() {
    await webSignOut();
  },
  async sendPasswordResetEmail(email) {
    await webSendPasswordResetEmail(email);
  },
  async getCurrentUser() {
    return webGetCurrentUser();
  },
  async getIdToken(options) {
    return webGetIdToken(options);
  },
  async onAuthStateChanged(cb) {
    return webOnAuthStateChanged(cb);
  },
  async onIdTokenChanged(cb) {
    return webOnIdTokenChanged(cb);
  },
};

