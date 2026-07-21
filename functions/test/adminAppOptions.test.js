import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminAppOptions } from "../lib/adminAppOptions.js";

test("Admin app uses the configured Firebase Storage bucket", () => {
  assert.deepEqual(
    buildAdminAppOptions({
      STORAGE_BUCKET: "mybodyscan-f3daf.firebasestorage.app",
    }),
    { storageBucket: "mybodyscan-f3daf.firebasestorage.app" }
  );
});

test("Admin app accepts a gs bucket URL and omits empty configuration", () => {
  assert.deepEqual(
    buildAdminAppOptions({ STORAGE_BUCKET: "gs://example.appspot.com" }),
    { storageBucket: "example.appspot.com" }
  );
  assert.equal(buildAdminAppOptions({ STORAGE_BUCKET: "" }), undefined);
});
