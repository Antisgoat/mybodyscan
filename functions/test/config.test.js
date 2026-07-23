import assert from "node:assert/strict";
import test from "node:test";

import { getStripeSecret, __resetConfigForTest } from "../lib/lib/config.js";

const SECRET_ENV_KEYS = ["STRIPE_SECRET", "STRIPE_API_KEY", "STRIPE_KEY"];

function snapshotSecrets() {
  const snapshot = {};
  for (const key of SECRET_ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreSecrets(snapshot) {
  for (const key of SECRET_ENV_KEYS) {
    const value = snapshot[key];
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

test("getStripeSecret prefers STRIPE_SECRET environment variable", () => {
  const snapshot = snapshotSecrets();
  try {
    __resetConfigForTest();
    for (const key of SECRET_ENV_KEYS) {
      delete process.env[key];
    }
    process.env.STRIPE_SECRET = "sk_test_env_123";

    const secret = getStripeSecret();
    assert.equal(secret, "sk_test_env_123");
  } finally {
    restoreSecrets(snapshot);
    __resetConfigForTest();
  }
});

test("getStripeSecret fails closed when environment and bound secrets are absent", () => {
  const snapshot = snapshotSecrets();
  try {
    __resetConfigForTest();
    for (const key of SECRET_ENV_KEYS) {
      delete process.env[key];
    }
    const secret = getStripeSecret();
    assert.equal(secret, null);
  } finally {
    restoreSecrets(snapshot);
    __resetConfigForTest();
  }
});
