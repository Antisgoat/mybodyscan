import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { withCors } from "./middleware/cors.js";
import { requireAppCheckStrict } from "./middleware/appCheck.js";
import { publicBaseUrl, requireAuth, verifyAppCheckStrict } from "./http.js";
import {
  assertStripeConfigured,
  env,
  getStripeSecret,
  hasStripe,
  stripeSecretNames,
} from "./env.js";

const DEFAULT_ORIGIN = "https://mybodyscanapp.com";
const stripeSecrets: string[] = hasStripe() ? [...stripeSecretNames] : [];

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

function getStripeRuntimeFromRequest(
  context: string,
  req?: ExpressRequest
): { stripe: Stripe; origin: string } | null {
  try {
    assertStripeConfigured();
  } catch (error) {
    console.warn("payments_disabled", {
      context,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const secret = getStripeSecret();
  if (!secret) {
    console.warn("payments_disabled_missing_secret", { context });
    return null;
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });
  const origin = req ? publicBaseUrl(req) : env.HOST_BASE_URL || DEFAULT_ORIGIN;

  return { stripe, origin };
}

function ensureStripeForRequest(
  context: string,
  req: ExpressRequest,
  res: ExpressResponse
): { stripe: Stripe; origin: string } | null {
  const runtime = getStripeRuntimeFromRequest(context, req);
  if (!runtime) {
    res.status(501).json({ error: "payments_disabled" });
    return null;
  }
  return runtime;
}

function ensureStripeForCallable(
  context: string,
  req?: ExpressRequest
): { stripe: Stripe; origin: string } {
  const runtime = getStripeRuntimeFromRequest(context, req);
  if (!runtime) {
    throw new HttpsError("failed-precondition", "payments_disabled");
  }
  return runtime;
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
  payload: CheckoutSessionPayload,
  stripe: Stripe,
  origin: string
): Promise<CheckoutSessionResult> {
  const { plan } = payload;
  const { priceId, mode } = getPlanConfig(plan);
  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/plans?canceled=1`,
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
  const runtime = ensureStripeForRequest("checkout_session_http", req, res);
  if (!runtime) {
    return;
  }

  await requireAppCheckStrict(req, res);
  const uid = await requireAuth(req);
  const source = req.body && Object.keys(req.body || {}).length ? req.body : req.query;
  const payload = parseCheckoutSessionPayload(source);
  try {
    const result = await createCheckoutSessionForUid(
      uid,
      payload,
      runtime.stripe,
      runtime.origin
    );
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
  const runtime = ensureStripeForRequest("customer_portal", req, res);
  if (!runtime) {
    return;
  }

  await requireAppCheckStrict(req, res);
  const uid = await requireAuth(req);
  const { stripe, origin } = runtime;
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
    return_url: `${origin}/plans`,
  });
  res.json({ url: session.url });
}

function withHandler(handler: (req: ExpressRequest, res: ExpressResponse) => Promise<void>) {
  return onRequest(
    {
      region: "us-central1",
      secrets: stripeSecrets,
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
  const runtime = ensureStripeForCallable("checkout_session_callable", rawRequest);
  if (rawRequest) {
    await verifyAppCheckStrict(rawRequest);
  }
  const payload = parseCheckoutSessionPayload(data);
  try {
    return await createCheckoutSessionForUid(
      uid,
      payload,
      runtime.stripe,
      runtime.origin
    );
  } catch (err) {
    if (err instanceof CheckoutError) {
      const code = err.kind === "config" ? "failed-precondition" : "internal";
      throw new HttpsError(code as any, err.kind);
    }
    throw err;
  }
}

export const createCheckoutSession = onCall<Partial<CheckoutSessionPayload>>(
  { region: "us-central1", secrets: stripeSecrets },
  async (request: CallableRequest<Partial<CheckoutSessionPayload>>) =>
    createCheckoutSessionHandler(request.data, request)
);

export const createCustomerPortal = withHandler(handleCustomerPortal);

export const createCheckout = withHandler(handleCheckoutSession);

