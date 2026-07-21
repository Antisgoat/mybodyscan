import type { Transaction } from "firebase-admin/firestore";
import { Timestamp, getFirestore } from "../firebase.js";
import { isStaff } from "../claims.js";
import { hasUnlimitedCreditsMirror } from "../lib/unlimitedCredits.js";
import { hasProEntitlement } from "../lib/proEntitlements.js";
import { consumeCreditBuckets } from "./creditUtils.js";
import { HttpsError } from "firebase-functions/v2/https";

const db = getFirestore();

export type ScanCreditAccess = { bypass: boolean };

export async function resolveScanCreditAccess(
  uid: string,
  claims: any
): Promise<ScanCreditAccess> {
  const tokenEmail = claims?.email;
  const email = typeof tokenEmail === "string" ? tokenEmail : null;
  const bypass =
    (await isStaff(uid)) ||
    claims?.unlimitedCredits === true ||
    (await hasUnlimitedCreditsMirror(uid)) ||
    (await hasProEntitlement(uid, email));
  return { bypass };
}

export function isScanCreditAuthorized(scan: any, scanId: string): boolean {
  return (
    scan?.charged === true ||
    scan?.creditStatus === "bypassed" ||
    (scan?.creditAuthorizationId === scanId &&
      scan?.creditStatus !== "refunded")
  );
}

export async function authorizeScanCredit(args: {
  tx: Transaction;
  uid: string;
  scanId: string;
  scan: any;
  requestId: string;
  access: ScanCreditAccess;
}): Promise<{
  charged: boolean;
  creditStatus: "consumed" | "bypassed";
  creditsRemaining: number | null;
}> {
  const { tx, uid, scanId, scan, requestId, access } = args;
  const ledgerRef = db.doc(`credits_ledger/scan:${uid}:${scanId}`);
  if (isScanCreditAuthorized(scan, scanId)) {
    if (scan?.charged === true) {
      tx.set(
        ledgerRef,
        {
          uid,
          scanId,
          amount: -1,
          kind: "scan_credit_consumed_legacy",
          createdAt: scan.authorizedAt || Timestamp.now(),
        },
        { merge: true }
      );
      return {
        charged: true,
        creditStatus: "consumed",
        creditsRemaining: scan?.creditsRemaining ?? null,
      };
    }
    return {
      charged: false,
      creditStatus: "bypassed",
      creditsRemaining: null,
    };
  }

  if (access.bypass) {
    return {
      charged: false,
      creditStatus: "bypassed",
      creditsRemaining: null,
    };
  }

  const creditRef = db.doc(`users/${uid}/private/credits`);
  const { buckets, consumed, total } = await consumeCreditBuckets(
    tx,
    creditRef,
    1
  );
  if (!consumed) {
    throw new HttpsError("failed-precondition", "No scan credits available.", {
      debugId: requestId,
      reason: "no_credits",
    });
  }
  const chargedAt = Timestamp.now();
  tx.set(
    creditRef,
    {
      creditBuckets: buckets,
      creditsSummary: { totalAvailable: total, lastUpdated: chargedAt },
    },
    { merge: true }
  );
  tx.set(ledgerRef, {
    uid,
    scanId,
    amount: -1,
    balanceAfter: total,
    kind: "scan_credit_consumed",
    createdAt: chargedAt,
    requestId,
  });
  return {
    charged: true,
    creditStatus: "consumed",
    creditsRemaining: total,
  };
}
