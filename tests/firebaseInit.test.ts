import { describe, expect, it } from "vitest";
import {
  firebaseApp,
  getFirebaseInitError,
  hasFirebaseConfig,
} from "@/lib/firebase";
import { getCurrentUser } from "@/auth/mbs-auth";

// Sanity check: our Firebase bootstrap should always produce an app/auth instance so that
// downstream hooks do not attach listeners to a null object. If configuration is partial,
// getFirebaseInitError surfaces the warning but the objects stay defined.
describe("firebase bootstrap", () => {
  it("exposes app and auth facade", async () => {
    expect(firebaseApp).toBeTruthy();
    if (hasFirebaseConfig) {
      await expect(getCurrentUser()).resolves.toBeTypeOf("object");
    }
  });

  it("does not block on config warnings", async () => {
    const err = getFirebaseInitError();
    // Either no error or a soft warning string, but bootstrap still yields auth.
    if (err) {
      expect(typeof err).toBe("string");
      if (hasFirebaseConfig) {
        await expect(getCurrentUser()).resolves.toBeTypeOf("object");
      }
    }
  });
});
