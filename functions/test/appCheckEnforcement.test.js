import assert from "node:assert/strict";
import test from "node:test";

import { appCheckSoft as checkHttpAppCheck } from "../lib/http/appCheckSoft.js";
import { ensureSoftAppCheckFromRequest } from "../lib/lib/appCheckSoft.js";

const requestWithoutToken = {
  get: () => "",
  headers: {},
  path: "/test",
  url: "/test",
};

async function withMode(mode, callback) {
  const previous = process.env.APP_CHECK_MODE;
  try {
    if (mode == null) delete process.env.APP_CHECK_MODE;
    else process.env.APP_CHECK_MODE = mode;
    await callback();
  } finally {
    if (previous == null) delete process.env.APP_CHECK_MODE;
    else process.env.APP_CHECK_MODE = previous;
  }
}

test("soft App Check logs but allows a missing token", async () => {
  await withMode("soft", async () => {
    await assert.doesNotReject(() => checkHttpAppCheck(requestWithoutToken));
    await assert.doesNotReject(() =>
      ensureSoftAppCheckFromRequest(requestWithoutToken, { fn: "test" })
    );
  });
});

test("strict App Check rejects a missing token across HTTP helpers", async () => {
  await withMode("strict", async () => {
    await assert.rejects(
      () => checkHttpAppCheck(requestWithoutToken),
      (error) => error?.code === "permission-denied"
    );
    await assert.rejects(
      () => ensureSoftAppCheckFromRequest(requestWithoutToken, { fn: "test" }),
      (error) => error?.code === "permission-denied"
    );
  });
});

test("health-style alwaysSoft remains observable during strict rollout", async () => {
  await withMode("strict", async () => {
    await assert.doesNotReject(() =>
      checkHttpAppCheck(requestWithoutToken, { alwaysSoft: true })
    );
  });
});

test("disabled App Check skips token validation", async () => {
  await withMode("disabled", async () => {
    await assert.doesNotReject(() => checkHttpAppCheck(requestWithoutToken));
    await assert.doesNotReject(() =>
      ensureSoftAppCheckFromRequest(requestWithoutToken, { fn: "test" })
    );
  });
});
