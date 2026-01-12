import { registerPlugin } from "@capacitor/core";
import type { FirebaseAuthenticationPlugin } from "@capacitor-firebase/authentication";

export const FirebaseAuthenticationNative =
  registerPlugin<FirebaseAuthenticationPlugin>("FirebaseAuthentication");
