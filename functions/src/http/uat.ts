import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";

import { getAuth } from "../firebase.js";
import { requireAuthWithClaims } from "../http.js";
import { getPriceAllowlist } from "../lib/config.js";

const PRICE_CONFIG = getPriceAllowlist();
const PRICE_ALLOWLIST = PRICE_CONFIG.allowlist;
const SUBSCRIPTION_PRICE_IDS = PRICE_CONFIG.subscriptionPriceIds;

const ORIGIN_ALLOWLIST = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "capacitor://localhost",
  "ionic://localhost",
]);

const STAFF_EMAIL_ALLOWLIST = new Set(["developer@adlrlabs.com"]);

function applyCors(req: Request, res: Response): { ended: boolean } {
  const origin = req.headers.origin as string | undefined;
  if (origin && ORIGIN_ALLOWLIST.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.status(204).end();
    return { ended: true };
  }
  return { ended: false };
}

async function requireStaff(
  req: Request
): Promise<{ uid: string; email: string | null }> {
  const { uid, claims } = await requireAuthWithClaims(req);
  const tokenEmail =
    typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (
    claims?.staff === true ||
    claims?.dev === true ||
    (tokenEmail && STAFF_EMAIL_ALLOWLIST.has(tokenEmail))
  ) {
    return { uid, email: tokenEmail };
  }
  const record = await getAuth().getUser(uid);
  const recordClaims = record.customClaims as
    | Record<string, unknown>
    | undefined;
  const staffFromRecord = recordClaims?.staff === true;
  const recordEmail = record.email ? record.email.toLowerCase() : tokenEmail;
  if (
    staffFromRecord ||
    (recordEmail && STAFF_EMAIL_ALLOWLIST.has(recordEmail))
  ) {
    return { uid, email: recordEmail || null };
  }
  throw new Error("not_staff");
}

function normalizePath(req: Request): string {
  const raw = req.path || req.url || "";
  return raw.replace(/^\/+|\/+$/g, "");
}

function invalidMethod(res: Response) {
  res
    .status(405)
    .json({ error: "method_not_allowed", code: "method_not_allowed" });
}

function invalidAccess(res: Response) {
  res.status(403).json({ error: "forbidden", code: "forbidden" });
}

function invalidPrice(res: Response) {
  res.status(400).json({ error: "invalid_price", code: "invalid_price" });
}

export const uatHelper = onRequest(
  { region: "us-central1" },
  async (req: Request, res: Response) => {
    const cors = applyCors(req, res);
    if (cors.ended) return;

    let staff: { uid: string; email: string | null };
    try {
      staff = await requireStaff(req);
    } catch (error) {
      console.warn("uat_access_denied", {
        path: req.path || req.url,
        message: (error as Error)?.message,
      });
      invalidAccess(res);
      return;
    }

    const path = normalizePath(req);

    if (path === "uat/ping") {
      if (req.method !== "GET") {
        invalidMethod(res);
        return;
      }
      res.json({
        ok: true,
        ts: Date.now(),
        iso: new Date().toISOString(),
        uid: staff.uid,
      });
      return;
    }

    if (path === "uat/checkoutEcho") {
      if (req.method !== "POST") {
        invalidMethod(res);
        return;
      }
      const body =
        typeof req.body === "object" && req.body
          ? (req.body as Record<string, unknown>)
          : {};
      const priceIdRaw =
        typeof body.priceId === "string" ? body.priceId.trim() : "";
      const priceId =
        priceIdRaw || (typeof body.plan === "string" ? body.plan.trim() : "");
      if (!priceId || !PRICE_ALLOWLIST.has(priceId)) {
        invalidPrice(res);
        return;
      }
      const mode = SUBSCRIPTION_PRICE_IDS.has(priceId)
        ? "subscription"
        : "payment";
      res.json({ ok: true, priceId, mode, uid: staff.uid });
      return;
    }

    res.status(404).json({ error: "not_found", code: "not_found" });
  }
);
