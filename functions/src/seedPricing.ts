import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
const PRICING: Record<string, any> = {
  "price_1RuOpKQQU5vuhlNjipfFBsR0": { plan:"starter",    credits:1,  credit_expiry_days:365 },
  "price_1S4XsVQQU5vuhlNjzdQzeySA": { plan:"pro",        credits:3,  credit_expiry_days:365, extra_scan_price:9.99 },
  "price_1S4Y6YQQU5vuhlNjeJFmshxX": { plan:"elite",      credits:36, credit_expiry_days:365, extra_scan_price:9.99 },
  "price_1S4Y9JQQU5vuhlNjB7cBfmaW": { plan:"extra_scan", credits:1,  credit_expiry_days:365 },
};
export const seedPricingOnce = onRequest({ secrets:["SEED_TOKEN"] }, async (req, res) => {
  const token = req.get("x-seed-token");
  if (!token || token !== process.env.SEED_TOKEN) return res.status(401).send("Unauthorized");
  const db = getFirestore();
  const ops = Object.entries(PRICING).map(([id, doc]) =>
    db.doc(`pricing/${id}`).set(doc, { merge: true })
  );
  await Promise.all(ops);
  return res.json({ ok:true, count:Object.keys(PRICING).length });
});
