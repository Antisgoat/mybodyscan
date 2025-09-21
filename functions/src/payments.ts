import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { CallableRequest, Request } from "firebase-functions/v2/https";
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

type CheckoutMode = "payment" | "subscription";

interface CheckoutSessionPayload {
  priceId: string;
  mode: CheckoutMode;
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutSessionResult {
  url: string | null;
  mock?: true;
}

function parseCheckoutSessionPayload(data: unknown): CheckoutSessionPayload {
  const body = (data || {}) as Partial<CheckoutSessionPayload>;
  const { priceId, mode, successUrl, cancelUrl } = body;
  if (
    typeof priceId !== "string" ||
    typeof successUrl !== "string" ||
    typeof cancelUrl !== "string" ||
    (mode !== "payment" && mode !== "subscription")
  ) {
    throw new HttpsError("invalid-argument", "Missing checkout parameters");
  }
  return { priceId, mode, successUrl, cancelUrl };
}

async function createCheckoutSessionForUid(
  uid: string,
  payload: CheckoutSessionPayload
): Promise<CheckoutSessionResult> {
  const stripe = buildStripe();
  if (!stripe) {
    const fallbackUrl = `${APP_BASE_URL}/plans/checkout?price=${encodeURIComponent(
      payload.priceId
    )}&mode=${payload.mode}`;
    return { url: fallbackUrl, mock: true };
  }
  const session = await stripe.checkout.sessions.create({
    mode: payload.mode,
    line_items: [{ price: payload.priceId, quantity: 1 }],
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
    client_reference_id: uid,
    metadata: { uid, priceId: payload.priceId },
  });
  return { url: session.url };
}

async function handleCheckoutSession(req: Request, res: any) {
  await verifyAppCheckSoft(req);
  const uid = await requireAuth(req);
  const payload = parseCheckoutSessionPayload(req.body);
  const result = await createCheckoutSessionForUid(uid, payload);
  res.json(result);
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
    { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
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

type CheckoutCallableContext = Pick<CallableRequest<unknown>, "auth" | "rawRequest">;

export async function createCheckoutSessionHandler(
  data: Partial<CheckoutSessionPayload>,
  context: CheckoutCallableContext
) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const rawRequest = context.rawRequest as Request | undefined;
  if (rawRequest) {
    await softVerifyAppCheck(rawRequest as any, {} as any);
    await verifyAppCheckSoft(rawRequest);
  }
  const payload = parseCheckoutSessionPayload(data);
  return createCheckoutSessionForUid(uid, payload);
}

export const createCheckoutSession = onCall<Partial<CheckoutSessionPayload>>(
  { region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (request: CallableRequest<Partial<CheckoutSessionPayload>>) =>
    createCheckoutSessionHandler(request.data, request)
);

export const createCustomerPortal = withHandler(handleCustomerPortal);

export const createCheckout = withHandler(handleCheckoutSession);

