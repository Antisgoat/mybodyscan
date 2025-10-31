import assert from "node:assert/strict";
import test from "node:test";

import { getStripeSecret, __resetConfigForTest, __setRuntimeConfigForTest } from "../src/lib/config.js";

const SECRET_ENV_KEYS = ["STRIPE_SECRET", "STRIPE_API_KEY", "STRIPE_KEY"] as const;

type SecretSnapshot = Record<(typeof SECRET_ENV_KEYS)[number], string | undefined>;

function snapshotSecrets(): SecretSnapshot {
  const snapshot = {} as SecretSnapshot;
  for (const key of SECRET_ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreSecrets(snapshot: SecretSnapshot) {
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

test("getStripeSecret falls back to functions.config() when env unset", () => {
  const snapshot = snapshotSecrets();
  try {
    __resetConfigForTest();
    for (const key of SECRET_ENV_KEYS) {
      delete process.env[key];
    }
    __setRuntimeConfigForTest({ stripe: { secret: "sk_test_cfg_456" } });

    const secret = getStripeSecret();
    assert.equal(secret, "sk_test_cfg_456");
  } finally {
    restoreSecrets(snapshot);
    __resetConfigForTest();
  }
});
