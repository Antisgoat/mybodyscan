import { appJson, requireStripe, requireUidFromAuthHeader, getStripe } from "./stripe/common.js";

export const createCustomerPortal = appJson(async (req, res) => {
  requireStripe();
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "method_not_allowed" }));
  const uid = await requireUidFromAuthHeader(req);

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

  const rawOrigin = req.get("origin") || req.headers["x-forwarded-origin"] || req.headers["x-forwarded-host"] || "";
  let origin = "https://mybodyscan-f3daf.web.app";
  if (typeof rawOrigin === "string" && rawOrigin.length) {
    origin = rawOrigin.startsWith("http") ? rawOrigin : `https://${rawOrigin}`;
  } else if (Array.isArray(rawOrigin) && rawOrigin[0]) {
    const value = rawOrigin[0];
    origin = value.startsWith("http") ? value : `https://${value}`;
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${origin}/billing`,
  });

  res.send(JSON.stringify({ url: portal.url }));
});
