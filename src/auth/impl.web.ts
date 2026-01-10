import type { AuthImpl } from "./facade";

import {
  createAccountEmail,
  ensureWebAuthPersistence,
  finalizeRedirectResult,
  getCurrentUser,
  getIdToken,
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithApple,
  signInWithEmailAndPassword,
  signInWithGoogle,
  signOut,
  webRequireAuth,
  createUserWithEmailAndPassword,
} from "@/lib/auth/sdk";

export { createAccountEmail, ensureWebAuthPersistence, finalizeRedirectResult, webRequireAuth };

export const impl: AuthImpl = {
  getCurrentUser,
  getIdToken,
  onAuthStateChanged,
  onIdTokenChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  createAccountEmail,
  sendPasswordResetEmail,
  signInWithGoogle,
  signInWithApple,
};
