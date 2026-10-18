import test from "node:test";
import assert from "node:assert/strict";

import { readFirebaseAppCheckHeader } from "../lib/lib/appCheckHeader.js";

test("reads Firebase App Check's canonical Node-normalized header", () => {
  assert.equal(
    readFirebaseAppCheckHeader({ "x-firebase-appcheck": " valid-token " }),
    "valid-token"
  );
});

test("does not accept the misspelled legacy header name", () => {
  assert.equal(
    readFirebaseAppCheckHeader({ "x-firebase-app-check": "wrong-header" }),
    ""
  );
});
