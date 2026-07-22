import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { FieldValue, getFirestore } from "./firebase.js";
import { getCreditExpiryMonths } from "./lib/creditPolicy.js";
import { projectBillingEntitlement } from "./lib/entitlementProjection.js";
import {
  readRevenueCatProductId,
  revenueCatCreditLedgerId,
  resolveRevenueCatEvent,
} from "./revenuecat/plans.js";
import { grantCreditBuckets } from "./scan/creditUtils.js";

const db = getFirestore();

function normalizeBearer(value: string): string {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.toLowerCase().startsWith("bearer "))
    return v.slice("bearer ".length).trim();
  return v;
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

function readAuthHeader(req: Request): string {
  // Express lower-cases header names; req.get is case-insensitive.
  return String(req.get("authorization") || "").trim();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseSignatureHeader(
  raw: string
): { scheme: "hex" | "base64"; sig: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("sha256=")) {
    return { scheme: "hex", sig: trimmed.slice("sha256=".length).trim() };
  }
  // Some providers include a "v1=" prefix; accept it.
  if (trimmed.startsWith("v1=")) {
    const rest = trimmed.slice(3).trim();
    // assume base64 if it has typical base64 chars; else treat as hex
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(rest) && rest.length % 4 === 0;
    return { scheme: looksBase64 ? "base64" : "hex", sig: rest };
  }
  // Heuristic: hex is [0-9a-f] and even length.
  const looksHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
  return { scheme: looksHex ? "hex" : "base64", sig: trimmed };
}

function verifySignature(params: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
}): boolean {
  const secret = params.secret.trim();
  if (!secret) return false;
  const header = parseSignatureHeader(params.signatureHeader || "");
  if (!header) return false;
  const digest = createHmac("sha256", secret).update(params.rawBody).digest();
  const expectedSig =
    header.scheme === "hex"
      ? digest.toString("hex")
      : digest.toString("base64");
  const expected = Buffer.from(expectedSig, "utf8");
  const got = Buffer.from(header.sig, "utf8");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

function isSafeDocumentId(value: string): boolean {
  return Boolean(value && value.length <= 256 && !value.includes("/"));
}

const revenueCatWebhookSigningSecret = defineSecret(
  "REVENUECAT_WEBHOOK_SIGNING_SECRET"
);

export const revenueCatWebhook = onRequest(
  {
    invoker: "public",
    cors: true,
    rawBody: true,
    region: "us-central1",
    secrets: [revenueCatWebhookSigningSecret],
  },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).send("method_not_allowed");
      return;
    }

    const secret = String(
      process.env.REVENUECAT_WEBHOOK_SIGNING_SECRET || ""
    ).trim();
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? null;

    const signatureHeader =
      (req.get("X-RevenueCat-Signature") ||
        req.get("x-revenuecat-signature") ||
        req.get("X-Revenuecat-Signature") ||
        req.get("x-revenuecat-signature")) ??
      undefined;

    if (!secret) {
      res.status(501).send("unconfigured");
      return;
    }

    // RevenueCat Dashboard "Authorization header value" validation.
    // We store the secret WITHOUT the "Bearer " prefix and accept both:
    //   Authorization: "Bearer <secret>"
    //   Authorization: "<secret>"
    const providedAuth = normalizeBearer(readAuthHeader(req));
    const authOk = providedAuth ? safeEqual(providedAuth, secret) : false;

    // Keep signature verification optional (non-blocking). If a signature header is present
    // AND we have a raw body, we can additionally validate it; but bearer auth is sufficient.
    const sigOk =
      Boolean(signatureHeader) && rawBody
        ? verifySignature({ rawBody, signatureHeader, secret })
        : false;

    if (!authOk && !sigOk) {
      res.status(401).send("unauthorized");
      return;
    }

    let bodyValue: unknown = null;
    try {
      bodyValue = req.body;
    } catch {
      bodyValue = null;
    }
    const body = asRecord(bodyValue);
    const event = asRecord(body.event ?? bodyValue);
    const subscriber = asRecord(event.subscriber);
    const eventId =
      readString(event.id) ||
      readString(event.event_id) ||
      readString(event.eventId) ||
      readString(body.id) ||
      "";
    const eventType = (
      readString(event.type) ||
      readString(body.type) ||
      ""
    ).toUpperCase();
    const appUserId =
      readString(event.app_user_id) ||
      readString(event.appUserId) ||
      readString(subscriber.app_user_id) ||
      "";

    if (!eventId || !eventType) {
      res.status(400).send("invalid_payload");
      return;
    }
    if (!appUserId && (eventType === "TRANSFER" || eventType === "TEST")) {
      if (!isSafeDocumentId(eventId)) {
        res.status(200).send("[ignored_invalid_identity]");
        return;
      }
      const eventRef = db.doc(`revenuecat_events/${eventId}`);
      await db.runTransaction(async (tx) => {
        const seen = await tx.get(eventRef);
        if (!seen.exists) {
          tx.create(eventRef, {
            receivedAt: FieldValue.serverTimestamp(),
            ignored: true,
            reason: `${eventType.toLowerCase()}_requires_subscriber_resync`,
            type: eventType,
          });
        }
      });
      res.status(200).send("[ignored]");
      return;
    }
    if (!appUserId) {
      res.status(400).send("invalid_payload");
      return;
    }
    if (
      !isSafeDocumentId(eventId) ||
      !isSafeDocumentId(appUserId) ||
      appUserId.startsWith("$RCAnonymousID")
    ) {
      res.status(200).send("[ignored_invalid_identity]");
      return;
    }

    const entitlementId =
      (process.env.REVENUECAT_ENTITLEMENT_ID || "pro").trim() || "pro";
    const expiresAtMs =
      readNumber(event.expiration_at_ms) ??
      readNumber(event.expires_at_ms) ??
      readNumber(event.expirationAtMs) ??
      readNumber(event.expiresAtMs) ??
      null;
    const decision = resolveRevenueCatEvent({ event, entitlementId });
    const productId = readRevenueCatProductId(event);
    const transactionId =
      readString(event.transaction_id) || readString(event.transactionId);
    const creditLedgerId = revenueCatCreditLedgerId(transactionId);

    const eventRef = db.doc(`revenuecat_events/${eventId}`);
    const entRef = db.doc(`users/${appUserId}/entitlements/current`);
    const ledgerRef = creditLedgerId
      ? db.doc(`credits_ledger/${creditLedgerId}`)
      : null;
    const userRef = db.doc(`users/${appUserId}`);
    const creditRef = db.doc(`users/${appUserId}/private/credits`);

    await db.runTransaction(async (tx) => {
      const seen = await tx.get(eventRef);
      if (seen.exists) {
        return;
      }

      if (!decision.recognized) {
        tx.create(eventRef, {
          receivedAt: FieldValue.serverTimestamp(),
          ignored: true,
          reason: decision.reason,
          type: eventType,
          uid: appUserId,
          productId: productId || null,
        });
        return;
      }

      const currentSnap = await tx.get(entRef);
      const current = currentSnap.exists ? currentSnap.data() : null;
      const ledgerSnap =
        decision.credits > 0 && ledgerRef ? await tx.get(ledgerRef) : null;
      const userSnap =
        decision.credits > 0 ? await tx.get(userRef) : null;
      const currentCredits =
        userSnap?.exists && typeof userSnap.data()?.credits === "number"
          ? (userSnap.data()?.credits as number)
          : 0;
      const shouldGrantCredits =
        decision.credits > 0 &&
        ledgerRef != null &&
        ledgerSnap?.exists !== true;
      const balanceAfter = shouldGrantCredits
        ? await grantCreditBuckets(tx, creditRef, decision.credits, {
            context: `revenuecat:${eventId}`,
            sourcePriceId: productId,
            expiresInMonths: getCreditExpiryMonths(),
          })
        : null;

      const currentSource = readString(current?.source);
      const isAdminSource =
        currentSource === "admin" || currentSource === "admin_allowlist";

      tx.create(eventRef, {
        receivedAt: FieldValue.serverTimestamp(),
        type: eventType,
        uid: appUserId,
        productId,
        transactionId: transactionId || null,
        creditsGranted: shouldGrantCredits ? decision.credits : 0,
        creditGrantSkipped:
          decision.credits > 0 && !creditLedgerId
            ? "missing_transaction_id"
            : null,
      });

      if (shouldGrantCredits && balanceAfter != null && ledgerRef) {
        tx.create(ledgerRef, {
          uid: appUserId,
          amount: decision.credits,
          balanceAfter,
          kind: "revenuecat_credit_grant",
          meta: {
            eventId,
            eventType,
            productId,
            plan: decision.plan?.plan ?? null,
            transactionId: transactionId || null,
          },
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          userRef,
          {
            credits: currentCredits + decision.credits,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Consumable purchases grant credits but never grant or revoke Pro.
      if (decision.pro == null) {
        return;
      }

      // Never overwrite an admin-granted Pro with IAP state; keep `source: "admin"` and `expiresAt: null`.
      if (isAdminSource) {
        tx.set(
          entRef,
          {
            pro: true,
            source: "admin",
            expiresAt: null,
            updatedAt: FieldValue.serverTimestamp(),
            revenueCat: {
              eventId,
              type: eventType,
              entitlementId,
              productId,
              pro: decision.pro,
              expiresAt: expiresAtMs,
            },
          },
          { merge: true }
        );
        return;
      }

      const projected = projectBillingEntitlement({
        current,
        incomingSource: "iap",
        incoming: { pro: decision.pro, expiresAt: expiresAtMs },
      });

      tx.set(
        entRef,
        {
          pro: projected.pro,
          source: projected.source,
          expiresAt: projected.expiresAt,
          updatedAt: FieldValue.serverTimestamp(),
          revenueCat: {
            eventId,
            type: eventType,
            entitlementId,
            productId,
            pro: decision.pro,
            expiresAt: expiresAtMs,
          },
        },
        { merge: true }
      );
    });

    res.status(200).send("[ok]");
  }
);
