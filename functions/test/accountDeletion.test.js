import assert from "node:assert/strict";
import test from "node:test";

import { deleteStripeCustomerForUser } from "../lib/accountDeletion.js";

test("does not access production Stripe from the Functions emulator", async () => {
  const priorEmulatorValue = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = "true";
  try {
    const result = await deleteStripeCustomerForUser(
      "emulator-user",
      "req-emulator"
    );
    assert.deepEqual(result, { customerIds: [], deletedCount: 0 });
  } finally {
    if (priorEmulatorValue === undefined) {
      delete process.env.FUNCTIONS_EMULATOR;
    } else {
      process.env.FUNCTIONS_EMULATOR = priorEmulatorValue;
    }
  }
});

test("skips Stripe deletion when the user has no Stripe customer", async () => {
  let deleteCalls = 0;
  const result = await deleteStripeCustomerForUser("user-no-stripe", "req-1", {
    readCustomerId: async () => null,
    findCustomerIds: async () => [],
    deleteCustomer: async () => {
      deleteCalls += 1;
    },
  });

  assert.deepEqual(result, { customerIds: [], deletedCount: 0 });
  assert.equal(deleteCalls, 0);
});

test("deletes cached and legacy Stripe customers before account data removal", async () => {
  const deleted = [];
  const result = await deleteStripeCustomerForUser("user-paid", "req-2", {
    readCustomerId: async () => "cus_release_test",
    findCustomerIds: async () => [
      "cus_release_test",
      "cus_legacy_without_cache",
    ],
    deleteCustomer: async (customerId) => {
      deleted.push(customerId);
    },
  });

  assert.deepEqual(result, {
    customerIds: ["cus_release_test", "cus_legacy_without_cache"],
    deletedCount: 2,
  });
  assert.deepEqual(deleted, [
    "cus_release_test",
    "cus_legacy_without_cache",
  ]);
});

test("treats an already-missing Stripe customer as idempotent", async () => {
  const result = await deleteStripeCustomerForUser("user-retry", "req-3", {
    readCustomerId: async () => "cus_already_deleted",
    findCustomerIds: async () => [],
    deleteCustomer: async () => {
      const error = new Error("No such customer");
      error.code = "resource_missing";
      throw error;
    },
  });

  assert.deepEqual(result, {
    customerIds: ["cus_already_deleted"],
    deletedCount: 0,
  });
});

test("surfaces Stripe failures so deletion can be retried safely", async () => {
  await assert.rejects(
    deleteStripeCustomerForUser("user-error", "req-4", {
      readCustomerId: async () => "cus_unavailable",
      findCustomerIds: async () => [],
      deleteCustomer: async () => {
        throw new Error("Stripe unavailable");
      },
    }),
    /Stripe unavailable/
  );
});
