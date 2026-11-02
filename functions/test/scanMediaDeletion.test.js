import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanMediaPrefixes,
  deleteScanMediaAndRecords,
  previewBlocksDeletion,
} from "../lib/lib/scanMediaDeletion.js";

test("scan deletion removes both photo and preview media before database records", async () => {
  const calls = [];
  await deleteScanMediaAndRecords("owner", "scan-1", {
    deletePrefix: async (p) => calls.push(p),
    deleteRecords: async () => calls.push("records"),
  });
  assert.deepEqual(calls, [
    "scans/owner/scan-1/",
    "transformation-previews/owner/scan-1/",
    "records",
  ]);
});

test("only fresh or unverified preview processing blocks scan deletion", () => {
  const now = 2_000_000;
  assert.equal(
    previewBlocksDeletion(
      { status: "processing", updatedAt: { toMillis: () => now } },
      now
    ),
    true
  );
  assert.equal(
    previewBlocksDeletion(
      {
        status: "processing",
        updatedAt: { toMillis: () => now - 16 * 60 * 1000 },
      },
      now
    ),
    false
  );
  assert.equal(previewBlocksDeletion({ status: "processing" }, now), true);
  assert.equal(previewBlocksDeletion({ status: "ready" }, now), false);
});

test("media deletion failure keeps records for retry and never reports success", async () => {
  let recordsDeleted = false;
  await assert.rejects(
    deleteScanMediaAndRecords("owner", "scan-1", {
      deletePrefix: async (p) => {
        if (p.startsWith("transformation"))
          throw new Error("storage unavailable");
      },
      deleteRecords: async () => {
        recordsDeleted = true;
      },
    }),
    /storage unavailable/
  );
  assert.equal(recordsDeleted, false);
});

test("scan media prefix validation rejects traversal, objects and prefix collisions", () => {
  for (const id of [
    "",
    "..",
    "../other",
    "one/two",
    "one\\two",
    {},
    "a".repeat(129),
  ]) {
    assert.throws(() => scanMediaPrefixes("owner", id));
  }
  assert.deepEqual(scanMediaPrefixes("owner", "one"), [
    "scans/owner/one/",
    "transformation-previews/owner/one/",
  ]);
});
