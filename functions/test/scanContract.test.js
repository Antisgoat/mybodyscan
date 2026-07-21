import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAllRequiredPhotoPaths,
  isSaneWeightKg,
  isValidBodyFatPercent,
  normalizeScanStatus,
} from "../lib/scan/contract.js";

test("scan contract normalizes legacy statuses", () => {
  assert.equal(normalizeScanStatus("pending"), "queued");
  assert.equal(normalizeScanStatus("queued"), "queued");
  assert.equal(normalizeScanStatus("uploading"), "uploading");
  assert.equal(normalizeScanStatus("not-a-real-status"), "unknown");
  assert.equal(normalizeScanStatus("completed"), "complete");
  assert.equal(normalizeScanStatus("done"), "complete");
  assert.equal(normalizeScanStatus("failed"), "error");
});

test("scan contract requires four paths and sane metrics", () => {
  const paths = {
    front: "scans/u/s/front.jpg",
    back: "scans/u/s/back.jpg",
    left: "scans/u/s/left.jpg",
    right: "scans/u/s/right.jpg",
  };
  assert.equal(hasAllRequiredPhotoPaths(paths), true);
  assert.equal(hasAllRequiredPhotoPaths({ ...paths, right: "" }), false);
  assert.equal(isSaneWeightKg(80), true);
  assert.equal(isSaneWeightKg(5), false);
  assert.equal(isValidBodyFatPercent(22), true);
  assert.equal(isValidBodyFatPercent(Number.NaN), false);
});
