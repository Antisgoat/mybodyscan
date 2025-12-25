import assert from "node:assert/strict";
import test from "node:test";

import {
  assertScanPose,
  buildScanPhotoPath,
  scanPhotosPrefix,
} from "../lib/scan/paths.js";

test("buildScanPhotoPath builds canonical storage paths", () => {
  const path = buildScanPhotoPath({ uid: " user1 ", scanId: "scan123", pose: "front" });
  assert.equal(path, "scans/user1/scan123/front.jpg");
});

test("scanPhotosPrefix trims uid", () => {
  const prefix = scanPhotosPrefix("  person ");
  assert.equal(prefix, "scans/person/");
});

test("assertScanPose rejects invalid poses", () => {
  assert.throws(() => assertScanPose("upper"), /Invalid scan pose/);
});
