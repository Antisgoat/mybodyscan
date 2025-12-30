import test from "node:test";
import assert from "node:assert/strict";

import { grantUnlimitedCreditsHandler } from "../lib/auth/grantUnlimitedCreditsHandler.js";

function makeDeps(overrides = {}) {
  return {
    adminEmailAllowlist: new Set(["admin@example.com"]),
    nowIso: () => "2025-12-30T00:00:00.000Z",
    getUserByEmail: async (email) => ({
      uid: `uid_${email.replace(/[^a-z0-9]/gi, "_")}`,
      email,
      customClaims: {},
    }),
    setCustomUserClaims: async () => {},
    writeUnlimitedCreditsMirror: async () => {},
    ...overrides,
  };
}

test("grantUnlimitedCredits: rejects non-admin caller", async () => {
  const deps = makeDeps({ adminEmailAllowlist: new Set(["admin@example.com"]) });
  await assert.rejects(
    () =>
      grantUnlimitedCreditsHandler(
        {
          auth: {
            uid: "caller",
            token: { email: "user@example.com" },
          },
          data: { emails: ["a@example.com"], enabled: true },
        },
        deps
      ),
    (err) => {
      assert.equal(err?.code, "permission-denied");
      return true;
    }
  );
});

test("grantUnlimitedCredits: user not found returns failed entry", async () => {
  const deps = makeDeps({
    getUserByEmail: async (email) => {
      if (email === "missing@example.com") {
        const err = new Error("not found");
        err.code = "auth/user-not-found";
        throw err;
      }
      return { uid: "uid_ok", email, customClaims: {} };
    },
  });

  const res = await grantUnlimitedCreditsHandler(
    {
      auth: { uid: "caller", token: { email: "admin@example.com" } },
      data: { emails: ["missing@example.com", "ok@example.com"], enabled: true },
    },
    deps
  );

  assert.equal(res.ok, true);
  assert.equal(res.updated.length, 1);
  assert.equal(res.updated[0].email, "ok@example.com");
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].email, "missing@example.com");
  assert.equal(res.failed[0].reason, "user_not_found");
});

test("grantUnlimitedCredits: grant then revoke toggles mirror + claims", async () => {
  const store = {
    mirrorByUid: new Map(),
    claimsByUid: new Map(),
  };

  const deps = makeDeps({
    getUserByEmail: async () => ({ uid: "u1", email: "t@example.com", customClaims: {} }),
    setCustomUserClaims: async (uid, claims) => {
      store.claimsByUid.set(uid, claims);
    },
    writeUnlimitedCreditsMirror: async ({ uid, enabled, grantedByEmail }) => {
      store.mirrorByUid.set(uid, { enabled, grantedByEmail });
    },
  });

  const grant = await grantUnlimitedCreditsHandler(
    {
      auth: { uid: "caller", token: { email: "admin@example.com" } },
      data: { emails: ["t@example.com"], enabled: true },
    },
    deps
  );
  assert.equal(grant.ok, true);
  assert.equal(store.mirrorByUid.get("u1").enabled, true);
  assert.equal(store.claimsByUid.get("u1").unlimitedCredits, true);

  const revoke = await grantUnlimitedCreditsHandler(
    {
      auth: { uid: "caller", token: { email: "admin@example.com" } },
      data: { emails: ["t@example.com"], enabled: false },
    },
    deps
  );
  assert.equal(revoke.ok, true);
  assert.equal(store.mirrorByUid.get("u1").enabled, false);
  assert.equal(store.claimsByUid.get("u1").unlimitedCredits, false);
});

