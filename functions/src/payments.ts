import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { withCors } from "./middleware/cors.js";
import { requireAppCheckStrict } from "./middleware/appCheck.js";
import { requireAuth, verifyAppCheckStrict } from "./http.js";
import { ensureEnvVars, reportMissingEnv } from "./env.js";

ensureEnvVars(["STRIPE_SECRET", "STRIPE_SECRET_KEY"], "payments");
reportMissingEnv("HOST_BASE_URL", "payments");

const STRIPE_SECRET = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY || "";
const ORIGIN = process.env.HOST_BASE_URL || "https://mybodyscanapp.com";

type CheckoutMode = "payment" | "subscription";

type PlanKey = "single" | "monthly" | "yearly" | "extra";

const PLAN_CONFIG: Record<PlanKey, { priceId: string; mode: CheckoutMode }> = {
  single: { priceId: "price_single_scan", mode: "payment" },
  monthly: { priceId: "price_monthly_intro", mode: "subscription" },
  yearly: { priceId: "price_annual", mode: "subscription" },
  extra: { priceId: "price_extra_scan", mode: "payment" },
};

interface CheckoutSessionPayload {
  plan: PlanKey;
}

interface CheckoutSessionResult {
  url: string | null;
}

class CheckoutError extends Error {
  constructor(readonly kind: "config" | "internal") {
    super(kind);
  }
}

function buildStripe(plan?: PlanKey): Stripe {
  if (!STRIPE_SECRET) {
    console.error("checkout_config_error", { plan: plan ?? null, reason: "missing_secret" });
    throw new CheckoutError("config");
  }
  return new Stripe(STRIPE_SECRET, { apiVersion: "2023-10-16" });
}

function parseCheckoutSessionPayload(data: unknown): CheckoutSessionPayload {
  const body = (data || {}) as Record<string, unknown>;
  const rawPlan = body?.plan;
  const plan = Array.isArray(rawPlan)
    ? (rawPlan[0] as string | undefined)
    : (rawPlan as string | undefined);
  if (plan !== "single" && plan !== "monthly" && plan !== "yearly" && plan !== "extra") {
    throw new HttpsError("invalid-argument", "Invalid checkout plan");
  }
  return { plan };
}

function getPlanConfig(plan: PlanKey) {
  const config = PLAN_CONFIG[plan];
  if (!config?.priceId) {
    console.error("checkout_config_error", { plan, reason: "missing_price" });
    throw new CheckoutError("config");
  }
  return config;
}

async function createCheckoutSessionForUid(
  uid: string,
  payload: CheckoutSessionPayload
): Promise<CheckoutSessionResult> {
  const { plan } = payload;
  const { priceId, mode } = getPlanConfig(plan);
  const stripe = buildStripe(plan);
  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${ORIGIN}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/plans?canceled=1`,
      client_reference_id: uid,
      metadata: { uid, priceId, plan },
    });
    return { url: session.url ?? null };
  } catch (err: any) {
    console.error("checkout_internal_error", {
      plan,
      message: err?.message,
    });
    throw new CheckoutError("internal");
  }
}

async function handleCheckoutSession(req: ExpressRequest, res: ExpressResponse) {
  await requireAppCheckStrict(req, res);
  const uid = await requireAuth(req);
  const source = req.body && Object.keys(req.body || {}).length ? req.body : req.query;
  const payload = parseCheckoutSessionPayload(source);
  try {
    const result = await createCheckoutSessionForUid(uid, payload);
    res.json(result);
  } catch (err) {
    if (err instanceof CheckoutError) {
      const status = err.kind === "config" ? 400 : 500;
      res.status(status).json({ error: err.kind });
      return;
    }
    throw err;
  }
}

async function handleCustomerPortal(req: ExpressRequest, res: ExpressResponse) {
  await requireAppCheckStrict(req, res);
  const uid = await requireAuth(req);
  let stripe: Stripe;
  try {
    stripe = buildStripe();
  } catch (err) {
    if (err instanceof CheckoutError && err.kind === "config") {
      res.json({ url: `${ORIGIN}/plans` });
      return;
    }
    throw err;
  }
  const user = await getAuth().getUser(uid);
  if (!user.email) {
    throw new HttpsError("failed-precondition", "User email required");
  }
  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  if (!customers.data.length) {
    throw new HttpsError("failed-precondition", "Customer not found");
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: customers.data[0].id,
    return_url: `${ORIGIN}/plans`,
  });
  res.json({ url: session.url });
}

function withHandler(handler: (req: ExpressRequest, res: ExpressResponse) => Promise<void>) {
  return onRequest(
    {
      region: "us-central1",
      secrets: ["STRIPE_SECRET", "STRIPE_SECRET_KEY"],
      invoker: "public",
      concurrency: 10,
    },
    withCors(async (req, res) => {
      try {
        await handler(req as ExpressRequest, res as ExpressResponse);
      } catch (err: any) {
        if (res.headersSent) {
          return;
        }
        if (err instanceof CheckoutError) {
          const status = err.kind === "config" ? 400 : 500;
          res.status(status).json({ error: err.kind });
          return;
        }
        const code = err instanceof HttpsError ? err.code : "internal";
        const status =
          code === "unauthenticated"
            ? 401
            : code === "invalid-argument"
            ? 400
            : code === "failed-precondition"
            ? 412
            : 500;
        res.status(status).json({ error: err.message || "error" });
      }
    })
  );
}

type CheckoutCallableContext = Pick<CallableRequest<unknown>, "auth" | "rawRequest">;

export async function createCheckoutSessionHandler(
  data: Partial<CheckoutSessionPayload>,
  context: CheckoutCallableContext
) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const rawRequest = context.rawRequest as ExpressRequest | undefined;
  if (rawRequest) {
    await verifyAppCheckStrict(rawRequest);
  }
  const payload = parseCheckoutSessionPayload(data);
  try {
    return await createCheckoutSessionForUid(uid, payload);
  } catch (err) {
    if (err instanceof CheckoutError) {
      const code = err.kind === "config" ? "failed-precondition" : "internal";
      throw new HttpsError(code as any, err.kind);
    }
    throw err;
  }
}

export const createCheckoutSession = onCall<Partial<CheckoutSessionPayload>>(
  { region: "us-central1", secrets: ["STRIPE_SECRET", "STRIPE_SECRET_KEY"] },
  async (request: CallableRequest<Partial<CheckoutSessionPayload>>) =>
    createCheckoutSessionHandler(request.data, request)
);

export const createCustomerPortal = withHandler(handleCustomerPortal);

export const createCheckout = withHandler(handleCheckoutSession);

