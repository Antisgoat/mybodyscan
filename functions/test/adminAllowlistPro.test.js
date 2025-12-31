import test from "node:test";
import assert from "node:assert/strict";

import {
  isAdminPro,
  ensureAdminProEntitlement,
} from "../lib/lib/adminAllowlistPro.js";

function makeFakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));

  const doc = (path) => {
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
  };

  const merge = (target, patch) => {
    const base = target && typeof target === "object" ? { ...target } : {};
    for (const [k, v] of Object.entries(patch || {})) {
      base[k] = v;
    }
    return base;
  };

  return {
    doc,
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

test("isAdminPro: matches allowlisted email case-insensitively", () => {
  assert.equal(isAdminPro({ uid: "nope", email: "Tester@AdlrLabs.com" }), true);
  assert.equal(isAdminPro({ uid: "nope", email: "developer@adlrlabs.com" }), true);
});

test("isAdminPro: treats unlimited UID allowlist as Pro (email missing)", () => {
  // UID is from the canonical unlimited allowlist.
  assert.equal(
    isAdminPro({ uid: "ww481RPvMYZzwn5vLX8FXyRlGVV2", email: null }),
    true
  );
});

test("ensureAdminProEntitlement: writes durable admin Pro and preserves paid metadata", async () => {
  const uid = "u_paid";
  const path = `users/${uid}/entitlements/current`;
  const fakeDb = makeFakeDb({
    [path]: {
      pro: false,
      source: "stripe",
      expiresAt: 123,
      stripeCustomerId: "cus_123",
      grantedAt: "keep_me",
    },
  });

  const res = await ensureAdminProEntitlement(uid, "developer@adlrlabs.com", {
    db: fakeDb,
  });
  assert.equal(res.didWrite, true);

  const after = fakeDb.__get(path);
  assert.equal(after.pro, true);
  // Durable admin grant (cannot be overwritten by Stripe/RC writers).
  assert.equal(after.source, "admin");
  assert.equal(after.expiresAt, null);
  assert.equal(after.stripeCustomerId, "cus_123");
  // Should not overwrite an existing grantedAt.
  assert.equal(after.grantedAt, "keep_me");
});

test("ensureAdminProEntitlement: upgrades an already-pro paid doc to durable admin (no revocation risk)", async () => {
  const uid = "u_already_pro_paid";
  const path = `users/${uid}/entitlements/current`;
  const fakeDb = makeFakeDb({
    [path]: {
      pro: true,
      source: "stripe",
      expiresAt: 123,
    },
  });

  const res = await ensureAdminProEntitlement(uid, "developer@adlrlabs.com", {
    db: fakeDb,
  });
  assert.equal(res.didWrite, true);

  const after = fakeDb.__get(path);
  assert.equal(after.pro, true);
  assert.equal(after.source, "admin");
  assert.equal(after.expiresAt, null);
});

