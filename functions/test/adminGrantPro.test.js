import test from "node:test";
import assert from "node:assert/strict";

import { ensureAdminGrantedProEntitlement } from "../lib/lib/adminGrantPro.js";

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

test("ensureAdminGrantedProEntitlement: preserves paid source", async () => {
  const uid = "u_paid";
  const path = `users/${uid}/entitlements/current`;
  const db = makeFakeDb({
    [path]: { pro: false, source: "iap", expiresAt: 999, grantedAt: "keep" },
  });

  const res = await ensureAdminGrantedProEntitlement(uid, { db });
  assert.equal(res.didWrite, true);

  const after = db.__get(path);
  assert.equal(after.pro, true);
  assert.equal(after.source, "iap");
  assert.equal(after.expiresAt, 999);
  assert.equal(after.grantedAt, "keep");
});

