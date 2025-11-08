import { appJson, requireStripe, requireUidFromAuthHeader, getStripe } from "./stripe/common.js";
import * as logger from "firebase-functions/logger";

export const legacyCreateCheckout = appJson(async (req, res) => {
  requireStripe();
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "method_not_allowed" }));

  const origin =
    req.get("origin") || req.headers["x-forwarded-origin"] || req.headers["x-forwarded-host"] || "";
  let base = "https://mybodyscan-f3daf.web.app";
  if (typeof origin === "string" && origin.length) {
    base = origin.startsWith("http") ? origin : `https://${origin}`;
  } else if (Array.isArray(origin) && origin[0]) {
    const value = origin[0];
    base = value.startsWith("http") ? value : `https://${value}`;
  }

  const uid = await requireUidFromAuthHeader(req);
  const { kind, credits = 1 } = (req.body || {}) as { kind: "scan" | "sub_monthly" | "sub_annual"; credits?: number };

  const stripe = getStripe();
  const search = await stripe.customers.search({ query: `metadata['uid']:'${uid}'` });
  let customer = search.data[0];
  if (!customer) {
    customer = await stripe.customers.create({ metadata: { uid } });
  } else if (!customer.metadata?.uid) {
    await stripe.customers.update(customer.id, { metadata: { ...(customer.metadata ?? {}), uid } });
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
    if (!priceScan) return res.status(501).send(JSON.stringify({ error: "price_scan_unset" }));
    mode = "payment";
    line_items = [{ price: priceScan, quantity: Math.max(1, Number(credits) || 1) }];
    metadata.credits = String(Math.max(1, Number(credits) || 1));
  } else if (kind === "sub_monthly") {
    if (!priceMonthly) return res.status(501).send(JSON.stringify({ error: "price_monthly_unset" }));
    mode = "subscription";
    line_items = [{ price: priceMonthly, quantity: 1 }];
  } else if (kind === "sub_annual") {
    if (!priceAnnual) return res.status(501).send(JSON.stringify({ error: "price_annual_unset" }));
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
    client_reference_id: uid,
    allow_promotion_codes: true,
    customer: customer.id,
  });

  logger.info("Created checkout", { uid, kind, session: session.id });
  res.send(JSON.stringify({ sessionId: session.id }));
});
