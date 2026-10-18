import assert from "node:assert/strict";
import test from "node:test";
import { refundMonthlyQuota } from "../lib/middleware/monthlyQuota.js";

test("failed-request refunds target the reserved month and never produce a negative allowance", async () => {
  let count = 1;
  let usedPath;
  const db = {
    doc(path) {
      usedPath = path;
      return { path };
    },
    async runTransaction(callback) {
      await callback({
        async get() {
          return { exists: true, data: () => ({ count }) };
        },
        set(_ref, data) {
          count = data.count;
        },
      });
    },
  };
  const reservation = {
    documentPath: "users/member/private/monthlyQuota_gymScans_2026-09",
  };
  await refundMonthlyQuota(reservation, db);
  assert.equal(count, 0);
  assert.equal(usedPath, reservation.documentPath);
  await refundMonthlyQuota(reservation, db);
  assert.equal(count, 0);
  await assert.rejects(() =>
    refundMonthlyQuota({ documentPath: "users/member" }, db)
  );
});
