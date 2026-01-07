import { registerPlugin } from "@capacitor/core";

// Native plugin facade (no NPM wrapper import).
export const FirebaseAuthentication = registerPlugin<any>(
  "FirebaseAuthentication"
);

