import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "../lib/firebase.js";
import {
  requireUploadCredit,
  reserveUploadSession,
  UPLOAD_LEASE_MS,
} from "../lib/scan/uploadAuthorization.js";

function creditDb(buckets) {
  return {
    doc: (path) => ({ path }),
    runTransaction: (callback) =>
      callback({
        get: async () => ({
          exists: true,
          data: () => ({ creditBuckets: buckets }),
        }),
        set: () => {
          throw new Error("preflight must not debit credits");
        },
      }),
  };
}
test("upload preflight rejects absent, expired and insufficient credits without a debit", async () => {
  for (const buckets of [
    [],
    [{ amount: 1, expiresAt: Timestamp.fromMillis(1) }],
    [{ amount: 0.5 }],
  ]) {
    await assert.rejects(
      requireUploadCredit("member", { bypass: false }, creditDb(buckets)),
      (error) => error.code === "failed-precondition"
    );
  }
  await requireUploadCredit(
    "member",
    { bypass: false },
    creditDb([{ amount: 1 }])
  );
  await requireUploadCredit(
    "staff",
    { bypass: true },
    {
      runTransaction() {
        throw new Error("not needed");
      },
    }
  );
});
test("upload sessions expire after an hour and retain abuse limits even for staff", async () => {
  for (const bypass of [false, true]) {
    const calls = [];
    const before = Date.now();
    const lease = await reserveUploadSession(
      "member",
      { bypass },
      {
        requireCredit: async () => calls.push("credit"),
        rateLimit: async (config) => {
          assert.equal(config.limit, 8);
          calls.push("rate");
        },
        monthlyQuota: async (config) => {
          assert.equal(config.limit, bypass ? 120 : 60);
          calls.push("quota");
        },
      }
    );
    assert.deepEqual(calls, ["credit", "rate", "quota"]);
    assert.ok(lease.toMillis() >= before + UPLOAD_LEASE_MS);
    assert.ok(lease.toMillis() <= Date.now() + UPLOAD_LEASE_MS);
  }
});
test("upload authorization fails closed before issuing a lease if limiting fails", async () => {
  await assert.rejects(
    reserveUploadSession(
      "member",
      { bypass: false },
      {
        requireCredit: async () => {},
        rateLimit: async () => {
          throw new Error("store unavailable");
        },
        monthlyQuota: async () => {
          throw new Error("must not run");
        },
      }
    ),
    /store unavailable/
  );
});
