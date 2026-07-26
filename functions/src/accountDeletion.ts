import Stripe from "stripe";

import { getFirestore } from "./firebase.js";
import { getStripeKey } from "./stripe/keys.js";

type StripeCustomerDeletionDeps = {
  readCustomerId?: (uid: string) => Promise<string | null>;
  findCustomerIds?: (uid: string) => Promise<string[]>;
  deleteCustomer?: (customerId: string) => Promise<void>;
};

type StripeDeletionError = {
  code?: string;
  statusCode?: number;
};

async function readCachedStripeCustomerId(uid: string): Promise<string | null> {
  const snapshot = await getFirestore()
    .doc(`users/${uid}/private/stripe`)
    .get();
  if (!snapshot.exists) return null;

  const value = snapshot.data()?.customerId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getStripeClient(): Stripe {
  return new Stripe(getStripeKey(), { apiVersion: "2024-06-20" });
}

function escapeStripeSearchValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findStripeCustomerIds(uid: string): Promise<string[]> {
  const result = await getStripeClient().customers.search({
    query: `metadata['uid']:'${escapeStripeSearchValue(uid)}'`,
    limit: 100,
  });
  return result.data.map((customer) => customer.id);
}

async function deleteStripeCustomer(customerId: string): Promise<void> {
  await getStripeClient().customers.del(customerId);
}

function isMissingStripeCustomer(error: unknown): boolean {
  const stripeError = error as StripeDeletionError | undefined;
  return (
    stripeError?.code === "resource_missing" || stripeError?.statusCode === 404
  );
}

export async function deleteStripeCustomerForUser(
  uid: string,
  requestId: string,
  deps: StripeCustomerDeletionDeps = {}
): Promise<{ customerIds: string[]; deletedCount: number }> {
  const readCustomerId = deps.readCustomerId ?? readCachedStripeCustomerId;
  const findCustomerIds = deps.findCustomerIds ?? findStripeCustomerIds;
  const removeCustomer = deps.deleteCustomer ?? deleteStripeCustomer;
  const [cachedCustomerId, discoveredCustomerIds] = await Promise.all([
    readCustomerId(uid),
    findCustomerIds(uid),
  ]);
  const customerIds = [
    ...new Set(
      [cachedCustomerId, ...discoveredCustomerIds].filter(
        (customerId): customerId is string => Boolean(customerId)
      )
    ),
  ];

  if (customerIds.length === 0) {
    console.log("account_delete_stripe_skipped", {
      uid,
      requestId,
      reason: "no_customer",
    });
    return { customerIds: [], deletedCount: 0 };
  }

  console.log("account_delete_stripe_begin", {
    uid,
    requestId,
    customerIds,
  });

  let deletedCount = 0;
  for (const customerId of customerIds) {
    try {
      await removeCustomer(customerId);
      deletedCount += 1;
      console.log("account_delete_stripe_customer_complete", {
        uid,
        requestId,
        customerId,
      });
    } catch (error) {
      if (isMissingStripeCustomer(error)) {
        console.warn("account_delete_stripe_already_missing", {
          uid,
          requestId,
          customerId,
        });
        continue;
      }
      console.error("account_delete_stripe_failed", {
        uid,
        requestId,
        customerId,
        message: (error as Error)?.message,
      });
      throw error;
    }
  }

  console.log("account_delete_stripe_complete", {
    uid,
    requestId,
    customerIds,
    deletedCount,
  });
  return { customerIds, deletedCount };
}
