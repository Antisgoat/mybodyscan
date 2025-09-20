import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { softVerifyAppCheck } from "./middleware/appCheck.js";
import { withCors } from "./middleware/cors.js";
import { requireAuth, verifyAppCheckSoft } from "./http.js";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://mybodyscanapp.com";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

function buildStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

async function handleCheckoutSession(req: Request, res: any) {
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const body = req.body as {
    priceId?: string;
    mode?: "payment" | "subscription";
    successUrl?: string;
    cancelUrl?: string;
  };
  if (!body?.priceId || !body.mode || !body.successUrl || !body.cancelUrl) {
    throw new HttpsError("invalid-argument", "Missing checkout parameters");
  }
  const stripe = buildStripe();
  if (!stripe) {
    const fallbackUrl = `${APP_BASE_URL}/plans/checkout?price=${encodeURIComponent(body.priceId)}&mode=${body.mode}`;
    res.json({ url: fallbackUrl, mock: true });
    return;
  }
  const session = await stripe.checkout.sessions.create({
    mode: body.mode,
    line_items: [{ price: body.priceId, quantity: 1 }],
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    client_reference_id: uid,
    metadata: { uid, priceId: body.priceId },
  });
  res.json({ url: session.url });
}

async function handleCustomerPortal(req: Request, res: any) {
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const stripe = buildStripe();
  if (!stripe) {
    res.json({ url: `${APP_BASE_URL}/plans` });
    return;
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
    return_url: `${APP_BASE_URL}/plans`,
  });
  res.json({ url: session.url });
}

function withHandler(handler: (req: Request, res: any) => Promise<void>) {
  return onRequest(
    withCors(async (req, res) => {
      try {
        await softVerifyAppCheck(req as any, res as any);
        await handler(req, res);
      } catch (err: any) {
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

export const createCheckoutSession = withHandler(handleCheckoutSession);
export const createCustomerPortal = withHandler(handleCustomerPortal);

export const createCheckout = withHandler(async (req, res) => {
  await handleCheckoutSession(req, res);
});

