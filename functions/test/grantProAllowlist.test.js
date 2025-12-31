import test from "node:test";
import assert from "node:assert/strict";

import { grantProAllowlistCore } from "../lib/admin/grantProAllowlist.js";

function makeFakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));

  const merge = (target, patch) => {
    const base = target && typeof target === "object" ? { ...target } : {};
    for (const [k, v] of Object.entries(patch || {})) {
      base[k] = v;
    }
    return base;
  };

  return {
    doc(path) {
      return {
        path,
        async get() {
          const data = store.get(path);
          return {
            exists: data != null,
            data: () => (data == null ? undefined : data),
          };
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          const data = store.get(ref.path);
          return {
            exists: data != null,
            data: () => (data == null ? undefined : data),
          };
        },
        set(ref, payload, opts) {
          const existing = store.get(ref.path);
          if (opts?.merge) {
            store.set(ref.path, merge(existing, payload));
          } else {
            store.set(ref.path, payload);
          }
        },
      };
      return await fn(tx);
    },
    __get(path) {
      return store.get(path) ?? null;
    },
  };
}

test("grantProAllowlist: rejects non-admin callers", async () => {
  await assert.rejects(
    async () =>
      await grantProAllowlistCore(
        {
          auth: { uid: "caller", token: { email: "someone@gmail.com" } },
          data: { emails: ["tester@adlrlabs.com"] },
        },
        {
          // Ensure no admins/{uid} fallback exists.
          db: makeFakeDb({}),
          auth: { getUserByEmail: async () => ({ uid: "u1" }) },
        }
      ),
    (err) => {
      assert.equal(err?.code, "permission-denied");
      return true;
    }
  );
});

test("grantProAllowlist: writes users/{uid}/entitlements/current with merge semantics", async () => {
  const uidFromEmail = "u_email";
  const uidDirect = "u_direct";
  const paidUid = "u_paid";

  const paidPath = `users/${paidUid}/entitlements/current`;
  const db = makeFakeDb({
    [paidPath]: {
      pro: false,
      source: "stripe",
      expiresAt: 123,
      stripe: { customerId: "cus_123" },
      grantedAt: "keep_me",
    },
  });

  const auth = {
    async getUserByEmail(email) {
      if (email === "tester@adlrlabs.com") return { uid: uidFromEmail };
      const err = new Error("not_found");
      err.code = "auth/user-not-found";
      throw err;
    },
  };

  const res = await grantProAllowlistCore(
    {
      auth: { uid: "caller", token: { email: "developer@adlrlabs.com" } },
      data: {
        emails: ["tester@adlrlabs.com", "missing@adlrlabs.com"],
        uids: [uidDirect, paidUid],
      },
    },
    { db, auth }
  );

  assert.equal(res.ok, true);
  assert.deepEqual(res.notFoundEmails, ["missing@adlrlabs.com"]);
  assert.equal(res.resolvedEmails["tester@adlrlabs.com"], uidFromEmail);

  const path1 = `users/${uidFromEmail}/entitlements/current`;
  const path2 = `users/${uidDirect}/entitlements/current`;
  const afterEmail = db.__get(path1);
  const afterDirect = db.__get(path2);

  assert.equal(afterEmail.pro, true);
  assert.equal(afterDirect.pro, true);
  assert.equal(typeof afterEmail.source, "string");
  assert.equal(typeof afterDirect.source, "string");
  assert.ok(afterEmail.updatedAt != null);
  assert.ok(afterDirect.updatedAt != null);

  const afterPaid = db.__get(paidPath);
  assert.equal(afterPaid.pro, true);
  // Must preserve paid fields but enforce durable admin Pro.
  assert.equal(afterPaid.source, "admin");
  assert.equal(afterPaid.expiresAt, null);
  assert.deepEqual(afterPaid.stripe, { customerId: "cus_123" });
  // Must not overwrite existing grantedAt.
  assert.equal(afterPaid.grantedAt, "keep_me");
});

