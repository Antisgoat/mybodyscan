import assert from "node:assert/strict";
import test from "node:test";
import { legacyFunctionUrl } from "../lib/lib/legacyFunctionUrl.js";

test("gateway calls the project function origin, not the website host", () => {
  assert.equal(
    legacyFunctionUrl("addMeal", { GCLOUD_PROJECT: "mybodyscan-f3daf" }),
    "https://us-central1-mybodyscan-f3daf.cloudfunctions.net/addMeal"
  );
});

test("gateway refuses missing project and unsafe function names", () => {
  assert.equal(legacyFunctionUrl("addMeal", {}), null);
  assert.equal(
    legacyFunctionUrl("../api", { GCLOUD_PROJECT: "mybodyscan-f3daf" }),
    null
  );
});
