import type { AuthImpl } from "./facade";

import {
  createAccountEmail,
  createUserWithEmailAndPassword,
  getCurrentUser,
  getIdToken,
  onAuthStateChanged,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithApple,
  signInWithEmailAndPassword,
  signInWithGoogle,
  signOut,
} from "@/lib/auth/sdk";

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
