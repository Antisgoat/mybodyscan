import { describe, expect, it } from "vitest";
import { firebaseApp, auth, getFirebaseInitError } from "@/lib/firebase";

// Sanity check: our Firebase bootstrap should always produce an app/auth instance so that
// downstream hooks do not attach listeners to a null object. If configuration is partial,
// getFirebaseInitError surfaces the warning but the objects stay defined.
describe("firebase bootstrap", () => {
  it("exposes app and auth instances", () => {
    expect(firebaseApp).toBeTruthy();
    expect(auth).toBeTruthy();
  });

  it("does not block on config warnings", () => {
    const err = getFirebaseInitError();
    // Either no error or a soft warning string, but bootstrap still yields auth.
    if (err) {
      expect(typeof err).toBe("string");
      expect(auth).toBeTruthy();
    }
  });
});
