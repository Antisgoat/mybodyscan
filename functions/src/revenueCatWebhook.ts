import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { FieldValue, getFirestore } from "./firebase.js";

const db = getFirestore();

function normalizeBearer(value: string): string {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.toLowerCase().startsWith("bearer ")) return v.slice("bearer ".length).trim();
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

function parseSignatureHeader(raw: string): { scheme: "hex" | "base64"; sig: string } | null {
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
    header.scheme === "hex" ? digest.toString("hex") : digest.toString("base64");
  const expected = Buffer.from(expectedSig, "utf8");
  const got = Buffer.from(header.sig, "utf8");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

function entitlementShouldApply(event: any, entitlementId: string): boolean {
  const idsRaw = (event?.entitlement_ids ?? event?.entitlementIds ?? null) as unknown;
  const idRaw = (event?.entitlement_id ?? event?.entitlementId ?? null) as unknown;
  const ids: string[] = Array.isArray(idsRaw)
    ? idsRaw.map((v) => readString(v)).filter(Boolean)
    : idRaw
      ? [readString(idRaw)].filter(Boolean)
      : [];
  // If the event payload doesn't include entitlement IDs, treat it as relevant (fail open).
  if (!ids.length) return true;
  return ids.includes(entitlementId);
}

function computeProState(eventType: string, expiresAtMs: number | null): boolean {
  const t = eventType.toUpperCase();
  if (t === "EXPIRATION") return false;
  // Cancellation can still be active until expiresAt.
  if (t === "CANCELLATION") {
    if (expiresAtMs == null) return false;
    return expiresAtMs > Date.now();
  }
  if (t === "INITIAL_PURCHASE" || t === "RENEWAL" || t === "UNCANCELLATION") return true;
  // Conservative fallback: if we have a future expiry, consider it active.
  if (expiresAtMs != null) return expiresAtMs > Date.now();
  return false;
}

export const revenueCatWebhook = onRequest(
  { invoker: "public", cors: true, rawBody: true, region: "us-central1" },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).send("method_not_allowed");
      return;
    }

    const secret = String(process.env.REVENUECAT_WEBHOOK_SIGNING_SECRET || "").trim();
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

    let body: any = null;
    try {
      body = req.body;
    } catch {
      body = null;
    }
    const event = (body?.event ?? body) as any;
    const eventId =
      readString(event?.id) ||
      readString(event?.event_id) ||
      readString(event?.eventId) ||
      readString(body?.id) ||
      "";
    const eventType = readString(event?.type) || readString(body?.type) || "";
    const appUserId =
      readString(event?.app_user_id) ||
      readString(event?.appUserId) ||
      readString(event?.subscriber?.app_user_id) ||
      "";

    if (!eventId || !eventType || !appUserId) {
      res.status(400).send("invalid_payload");
      return;
    }

    const entitlementId = (process.env.REVENUECAT_ENTITLEMENT_ID || "pro").trim() || "pro";
    if (!entitlementShouldApply(event, entitlementId)) {
      res.status(200).send("[ignored]");
      return;
    }

    const expiresAtMs =
      readNumber(event?.expiration_at_ms) ??
      readNumber(event?.expires_at_ms) ??
      readNumber(event?.expirationAtMs) ??
      readNumber(event?.expiresAtMs) ??
      null;

    const pro = computeProState(eventType, expiresAtMs);

    const eventRef = db.doc(`revenuecat_events/${eventId}`);
    const entRef = db.doc(`users/${appUserId}/entitlements/current`);

    await db.runTransaction(async (tx) => {
      const seen = await tx.get(eventRef);
      if (seen.exists) {
        return;
      }

      const currentSnap = await tx.get(entRef);
      const current = currentSnap.exists ? (currentSnap.data() as any) : null;
      const currentSource = readString(current?.source);
      // Never let IAP events revoke Stripe/Admin access.
      if (!pro && (currentSource === "stripe" || currentSource === "admin") && current?.pro === true) {
        tx.create(eventRef, {
          receivedAt: FieldValue.serverTimestamp(),
          ignored: true,
          type: eventType,
          uid: appUserId,
          note: "ignored_revocation_due_to_non_iap_source",
        });
        return;
      }

      tx.create(eventRef, {
        receivedAt: FieldValue.serverTimestamp(),
        type: eventType,
        uid: appUserId,
      });
      tx.set(
        entRef,
        {
          pro,
          source: "iap",
          expiresAt: expiresAtMs ?? null,
          updatedAt: FieldValue.serverTimestamp(),
          revenueCat: {
            eventId,
            type: eventType,
            entitlementId,
          },
        },
        { merge: true }
      );
    });

    res.status(200).send("[ok]");
  }
);

