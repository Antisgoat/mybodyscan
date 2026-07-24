import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(__dirname, "mbs-auth.native.ts"),
  "utf8"
);

describe("native Firebase authentication bridge", () => {
  it("uses native provider UI and a persisted Firebase JS session", () => {
    expect(source).toContain(
      'registerPlugin<NativeFirebaseAuthenticationPlugin>('
    );
    expect(source).toContain('"FirebaseAuthentication"');
    expect(source).toContain('from "firebase/auth"');
    expect(source).toContain("initializeAuth(firebaseApp");
    expect(source).toContain("persistence: indexedDBLocalPersistence");
  });

  it("synchronizes Google and Apple credentials into Firestore's auth session", () => {
    expect(source).toContain("skipNativeAuth: true");
    expect(source).toContain("GoogleAuthProvider.credential");
    expect(source).toContain('new OAuthProvider("apple.com")');
    expect(source).toContain("rawNonce");
    expect(source.match(/signInWithCredential\(/g)?.length).toBe(2);
  });

  it("does not use browser OAuth or reCAPTCHA inside Capacitor", () => {
    expect(source).not.toMatch(
      /signInWithPopup|signInWithRedirect|RecaptchaVerifier|browserPopupRedirectResolver/
    );
    expect(source).not.toContain("@capacitor-firebase/authentication");
  });
});
