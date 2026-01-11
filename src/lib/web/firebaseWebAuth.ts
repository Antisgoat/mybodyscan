import * as firebaseAuth from "firebase/auth";

export type FirebaseAuthModule = typeof firebaseAuth;

export function getFirebaseAuthModule(): FirebaseAuthModule {
  return firebaseAuth;
}
