import {
  appJson,
  requireStripe,
  requireUidFromAuthHeader,
  getStripe,
} from "./stripe/common.js";
import * as logger from "firebase-functions/logger";
import {
  legacyCheckoutBaseUrl,
  legacyCheckoutQuantity,
} from "./stripe/legacyCheckoutPolicy.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";

export const legacyCreateCheckout = appJson(async (req, res) => {
  if (req.method !== "POST")
    return res
      .status(405)
      .send(JSON.stringify({ error: "method_not_allowed" }));

  const uid = await requireUidFromAuthHeader(req);
  await enforceRateLimit({
    uid,
    key: "legacy_checkout",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  requireStripe();
  // Never construct payment return URLs from caller-controlled origin/host headers.
  const base = legacyCheckoutBaseUrl(process.env.HOST_BASE_URL);
  const { kind, credits = 1 } = (req.body || {}) as {
    kind: "scan" | "sub_monthly" | "sub_annual";
    credits?: number;
  };
  if (!["scan", "sub_monthly", "sub_annual"].includes(kind)) {
    res.status(400).json({ error: "bad_kind" });
    return;
  }
  const quantity = kind === "scan" ? legacyCheckoutQuantity(credits) : 1;

  const stripe = getStripe();
  const search = await stripe.customers.search({
    query: `metadata['uid']:'${uid}'`,
  });
  let customer = search.data[0];
  if (!customer) {
    customer = await stripe.customers.create({ metadata: { uid } });
  } else if (!customer.metadata?.uid) {
    await stripe.customers.update(customer.id, {
      metadata: { ...(customer.metadata ?? {}), uid },
    });
  }
  if (!customer) {
    throw new Error("customer_creation_failed");
  }

  const priceScan = process.env.STRIPE_PRICE_SCAN || "";
  const priceMonthly = process.env.STRIPE_PRICE_SUB_MONTHLY || "";
  const priceAnnual = process.env.STRIPE_PRICE_SUB_ANNUAL || "";

  let mode: "payment" | "subscription";
  let line_items: any[];
  const metadata: Record<string, string> = { uid };

  if (kind === "scan") {
    if (!priceScan)
      return res
        .status(501)
        .send(JSON.stringify({ error: "price_scan_unset" }));
    mode = "payment";
    line_items = [{ price: priceScan, quantity }];
    metadata.credits = String(quantity);
  } else if (kind === "sub_monthly") {
    if (!priceMonthly)
      return res
        .status(501)
        .send(JSON.stringify({ error: "price_monthly_unset" }));
    mode = "subscription";
    line_items = [{ price: priceMonthly, quantity: 1 }];
  } else if (kind === "sub_annual") {
    if (!priceAnnual)
      return res
        .status(501)
        .send(JSON.stringify({ error: "price_annual_unset" }));
    mode = "subscription";
    line_items = [{ price: priceAnnual, quantity: 1 }];
  } else {
    return res.status(400).send(JSON.stringify({ error: "bad_kind" }));
  }

  const session = await stripe.checkout.sessions.create({
    mode,
    line_items,
    success_url: `${base}/billing?status=success`,
    cancel_url: `${base}/billing?status=cancel`,
    metadata,
    ...(mode === "subscription"
      ? { subscription_data: { metadata: { uid } } }
      : {}),
    client_reference_id: uid,
    allow_promotion_codes: true,
    customer: customer.id,
  });

  logger.info("Created checkout", { uid, kind, session: session.id });
  res.send(JSON.stringify({ sessionId: session.id }));
});
