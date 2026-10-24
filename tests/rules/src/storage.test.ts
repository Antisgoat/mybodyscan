import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";

const suite = process.env.FIREBASE_STORAGE_EMULATOR_HOST
  ? describe
  : describe.skip;
suite("Storage security boundaries", () => {
  let env: RulesTestEnvironment;
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0, 0xff, 0xd9]);
  const metadata = {
    contentType: "image/jpeg",
    cacheControl: "private, no-store, max-age=0",
  };
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-mbs",
      firestore: {
        rules: readFileSync(
          new URL("../../../firestore.rules", import.meta.url),
          "utf8"
        ),
      },
      storage: {
        rules: readFileSync(
          new URL("../../../storage.rules", import.meta.url),
          "utf8"
        ),
      },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc("users/owner/scans/one")
        .set({
          uid: "owner",
          status: "uploading",
          uploadAuthorizedUntil: new Date(Date.now() + 60 * 60 * 1000),
        });
      for (const [id, extra] of Object.entries({
        expired: { uploadAuthorizedUntil: new Date(0) },
        completed: { status: "complete" },
        unleased: { uploadAuthorizedUntil: null },
        wrongOwner: { uid: "other" },
      })) {
        await ctx
          .firestore()
          .doc(`users/owner/scans/${id}`)
          .set({
            uid: "owner",
            status: "uploading",
            uploadAuthorizedUntil: new Date(Date.now() + 60 * 60 * 1000),
            ...extra,
          });
      }
      await ctx.storage().ref("scans/owner/one/front.jpg").put(image, metadata);
      await ctx
        .storage()
        .ref("transformation-previews/owner/one/preview.jpg")
        .put(image, metadata);
    });
  });
  afterAll(async () => {
    await env?.cleanup();
  });
  it("allows the owner to read and upload their canonical photo", async () => {
    const storage = env.authenticatedContext("owner").storage();
    await assertSucceeds(
      storage.ref("scans/owner/one/front.jpg").getMetadata()
    );
    await assertSucceeds(
      storage.ref("scans/owner/one/back.jpg").put(image, metadata)
    );
  });
  it("denies cross-user reads, writes and deletes", async () => {
    const ref = env
      .authenticatedContext("other")
      .storage()
      .ref("scans/owner/one/front.jpg");
    await assertFails(ref.getMetadata());
    await assertFails(ref.put(image, metadata));
    await assertFails(ref.delete());
  });
  it("requires a live server-issued upload session", async () => {
    const storage = env.authenticatedContext("owner").storage();
    for (const id of [
      "missing",
      "expired",
      "completed",
      "unleased",
      "wrongOwner",
    ]) {
      await assertFails(
        storage.ref(`scans/owner/${id}/front.jpg`).put(image, metadata)
      );
    }
  });
  it("does not let a client forge or extend an upload lease", async () => {
    await assertFails(
      env
        .authenticatedContext("owner")
        .firestore()
        .doc("users/owner/scans/forged")
        .set({
          uid: "owner",
          status: "uploading",
          uploadAuthorizedUntil: new Date(Date.now() + 3600000),
        })
    );
    await assertFails(
      env
        .authenticatedContext("owner")
        .firestore()
        .doc("users/owner/scans/one")
        .update({ uploadAuthorizedUntil: new Date(Date.now() + 7200000) })
    );
  });
  it("limits diagnostic writes to privileged accounts", async () => {
    const path = "user_uploads/owner/debug/test.txt";
    await assertFails(
      env.authenticatedContext("owner").storage().ref(path).put(image)
    );
    await assertSucceeds(
      env
        .authenticatedContext("owner", { admin: true })
        .storage()
        .ref(path)
        .put(image)
    );
  });
  it("denies anonymous reads and writes", async () => {
    const ref = env
      .unauthenticatedContext()
      .storage()
      .ref("scans/owner/one/front.jpg");
    await assertFails(ref.getMetadata());
    await assertFails(ref.put(image, metadata));
  });
  it("rejects non-image MIME types and arbitrary filenames", async () => {
    const storage = env.authenticatedContext("owner").storage();
    await assertFails(
      storage
        .ref("scans/owner/one/left.jpg")
        .put(image, { contentType: "text/html" })
    );
    await assertFails(
      storage.ref("scans/owner/one/payload.html").put(image, metadata)
    );
  });
  it("rejects oversized scan uploads", async () => {
    await assertFails(
      env
        .authenticatedContext("owner")
        .storage()
        .ref("scans/owner/one/right.jpg")
        .put(new Uint8Array(15 * 1024 * 1024), metadata)
    );
  });
  it("keeps generated previews owner-readable and server-write-only", async () => {
    const path = "transformation-previews/owner/one/preview.jpg";
    const owner = env.authenticatedContext("owner").storage().ref(path);
    await assertSucceeds(owner.getMetadata());
    await assertFails(owner.put(image, metadata));
    await assertFails(owner.delete());
    await assertFails(
      env.authenticatedContext("other").storage().ref(path).getMetadata()
    );
  });
  it("denies writes to public and unrecognized paths", async () => {
    const storage = env.authenticatedContext("owner").storage();
    await assertFails(storage.ref("public/payload.html").put(image, metadata));
    await assertFails(
      storage.ref("unrecognized/owner/front.jpg").put(image, metadata)
    );
  });
});
