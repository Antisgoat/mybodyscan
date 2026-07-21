import assert from "node:assert/strict";
import test from "node:test";

import { getEngineConfigOrThrow } from "../lib/scan/engineConfig.js";

const ENV_KEYS = ["OPENAI_API_KEY", "STORAGE_BUCKET", "GCLOUD_PROJECT"];

function snapshotEnv() {
  const snapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] == null) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

test("engine config surfaces missing OPENAI_API_KEY with actionable message", () => {
  const snap = snapshotEnv();
  try {
    delete process.env.OPENAI_API_KEY;
    process.env.STORAGE_BUCKET = "demo.appspot.com";
    process.env.GCLOUD_PROJECT = "demo-project";
    assert.throws(
      () => getEngineConfigOrThrow("test-correlation"),
      (err) => {
        assert.equal(err.code, "unavailable");
        assert.match(
          err.message,
          /Set OPENAI_API_KEY/,
          "missing key should include fix hint"
        );
        return true;
      }
    );
  } finally {
    restoreEnv(snap);
  }
});

test("engine config uses the vision-capable production model default", async () => {
  const snap = snapshotEnv();
  const previousModel = process.env.OPENAI_MODEL;
  try {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_MODEL;
    process.env.STORAGE_BUCKET = "demo.appspot.com";
    process.env.GCLOUD_PROJECT = "demo-project";
    const config = getEngineConfigOrThrow("test-default-model");
    assert.equal(config.model, "gpt-4o-mini");
  } finally {
    restoreEnv(snap);
    if (previousModel == null) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previousModel;
  }
});
