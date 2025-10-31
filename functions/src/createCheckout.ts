import type { Request, Response } from "express";
import type Stripe from "stripe";
import { onRequest } from "firebase-functions/v2/https";

import { getAuth } from "./firebase.js";
import { getPriceAllowlist } from "./lib/config.js";
import { getStripeKey } from "./stripe/config.js";
import { HttpError, send } from "./util/http.js";

type AuthDetails = {
  uid: string | null;
};

const CHECKOUT_OPTIONS = {
  region: "us-central1",
};

let cachedStripe: { key: string; client: Stripe } | null = null;

async function getStripeClient(secret: string): Promise<Stripe> {
  if (cachedStripe && cachedStripe.key === secret) {
    return cachedStripe.client;
  }

  const stripeModule = await import("stripe");
  const client = new stripeModule.default(secret, { apiVersion: "2024-06-20" });
  cachedStripe = { key: secret, client };
  return client;
}

function extractBearerToken(req: Request): string {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, "unauthorized", "missing_bearer");
  }
  const token = match[1]?.trim();
  if (!token) {
    throw new HttpError(401, "unauthorized", "missing_bearer");
  }
  return token;
}

async function verifyAuthorization(req: Request): Promise<AuthDetails> {
  const token = extractBearerToken(req);

  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid ?? null };
  } catch (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    const code = (error as { code?: string })?.code ?? "";
    if (
      code === "app/no-app" ||
      code === "app/invalid-credential" ||
      message.includes("credential") ||
      message.includes("initializeApp")
    ) {
      console.warn("no_admin_verify", { reason: message || code || "unknown" });
      return { uid: null };
    }

    console.warn("checkout_auth_failed", { message });
    throw new HttpError(401, "unauthorized", "invalid_token");
  }
}

function normalizeBody(body: unknown): Record<string, unknown> {
  if (!body) {
    return {};
  }
  if (typeof body === "object") {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore string parse errors
    }
  }
  return {};
}

function resolvePriceId(payload: Record<string, unknown>, planToPrice: Record<string, string>): string {
  const direct = typeof payload.priceId === "string" ? payload.priceId.trim() : "";
  if (direct) {
    if (!direct.startsWith("price_")) {
      throw new HttpError(400, "invalid_price");
    }
    return direct;
  }

  const plan = typeof payload.plan === "string" ? payload.plan.trim().toLowerCase() : "";
  if (plan) {
    const mapped = planToPrice[plan];
    if (mapped && mapped.startsWith("price_")) {
      return mapped;
    }
  }

  throw new HttpError(400, "invalid_price");
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    const payload: Record<string, unknown> = { error: error.code };
    if (error.message && error.message !== error.code) {
      payload.reason = error.message;
    }
    send(res, error.status, payload);
    return;
  }

  console.error("createCheckout_unexpected", error);
  send(res, 500, { error: "internal", code: "internal_error" });
}

function isStripeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const type = (error as { type?: unknown }).type;
  if (typeof type === "string" && type.toLowerCase().includes("stripe")) {
    return true;
  }

  const raw = (error as { raw?: { type?: unknown } }).raw;
  return typeof raw?.type === "string" && raw.type.toLowerCase().includes("stripe");
}

export const createCheckout = onRequest(CHECKOUT_OPTIONS, async (req: Request, res: Response) => {
  if (req.method === "OPTIONS") {
    send(res, 204, null);
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST,OPTIONS");
    handleError(res, new HttpError(405, "method_not_allowed"));
    return;
  }

  try {
    const auth = await verifyAuthorization(req);
    const payload = normalizeBody(req.body);
    const { allowlist, planToPrice, subscriptionPriceIds } = getPriceAllowlist();
    const priceId = resolvePriceId(payload, planToPrice);

    if (allowlist.size > 0 && !allowlist.has(priceId)) {
      throw new HttpError(400, "invalid_price");
    }

    const stripeKey = getStripeKey();
    if (!stripeKey.present || !stripeKey.value) {
      throw new HttpError(501, "payments_disabled", "missing_stripe_secret");
    }

    let stripe: Stripe;
    try {
      stripe = await getStripeClient(stripeKey.value);
    } catch (error) {
      if (isStripeError(error)) {
        throw new HttpError(502, "stripe_unavailable");
      }
      throw error;
    }

    const mode: Stripe.Checkout.SessionCreateParams.Mode = subscriptionPriceIds.has(priceId)
      ? "subscription"
      : "payment";

    try {
      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: "https://mybodyscanapp.com/settings?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://mybodyscanapp.com/plans?canceled=1",
        client_reference_id: auth.uid ?? undefined,
        metadata: {
          uid: auth.uid ?? "anonymous",
          priceId,
        },
      });

      if (!session?.url) {
        throw new HttpError(502, "stripe_unavailable", "session_missing_url");
      }

      send(res, 200, { url: session.url });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (isStripeError(error)) {
        throw new HttpError(502, "stripe_unavailable");
      }
      throw error;
    }
  } catch (error) {
    handleError(res, error);
  }
});
