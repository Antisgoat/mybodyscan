import functions from "firebase-functions";
import admin from "firebase-admin";
import corsLib from "cors";
import Stripe from "stripe";
admin.initializeApp();
const db = admin.firestore();
const cors = corsLib({ origin: true });

// Helper: verify ID token from "Authorization: Bearer <idToken>"
async function requireAuth(req) {
  const h = req.headers.authorization || "";
  const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!idToken) return null;
  try { return await admin.auth().verifyIdToken(idToken); } catch { return null; }
}

// GET user height if present (for BMI). Returns cm or null.
async function getUserHeightCm(uid) {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const cm = snap.exists ? snap.data()?.heightCm : null;
    return (typeof cm === "number" && cm > 0) ? cm : null;
  } catch { return null; }
}

// BMI helper if height available
function computeBMIkgM2(weightKg, heightCm) {
  if (typeof weightKg !== "number" || typeof heightCm !== "number" || heightCm <= 0) return null;
  const m = heightCm / 100;
  return +(weightKg / (m * m)).toFixed(1);
}

// POST /createScan  (STUB: instant success)
export const createScan = functions.region("us-central1").https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireAuth(req);
      if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });

      const { scanId } = req.body || {};
      if (!scanId) return res.status(400).json({ error: "Missing scanId" });

      const ref = db.doc(`users/${user.uid}/scans/${scanId}`);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Scan not found" });
      const data = snap.data();
      if (data?.uid !== user.uid) return res.status(403).json({ error: "Forbidden" });

      // move to processing
      await ref.update({ status: "processing", updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      // generate plausible results (stable-ish but varied)
      const seed = scanId.split("").reduce((a,c)=>a+c.charCodeAt(0), 0) % 1000;
      const rand = (min, max, s=1) => {
        const r = Math.abs(Math.sin(seed + Date.now()/1e7 + s));
        return +(min + r*(max-min)).toFixed(1);
      };

      // body fat 14–32%, weight 130–220 lb
      const bodyFatPct = rand(18, 28, 2);
      const weightLb   = Math.round(rand(150, 200, 3));
      const weightKg   = +(weightLb / 2.20462).toFixed(1);

      const heightCm = await getUserHeightCm(user.uid);
      const BMI = heightCm ? computeBMIkgM2(weightKg, heightCm) : null;

      // mark done
      await ref.update({
        status: "done",
        results: {
          bodyFatPct,
          weightKg,
          weightLb,
          ...(BMI != null ? { BMI } : {})
        },
        modelVersion: "stub-v1",
        qualityScore: 0.9,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.json({ ok: true, stub: true });
    } catch (e) {
      console.error(e);
      try {
        const user = await requireAuth(req);
        const scanId = req.body?.scanId;
        if (user?.uid && scanId) {
          await db.doc(`users/${user.uid}/scans/${scanId}`).update({
            status: "error",
            errorMsg: String(e?.message || e)
          });
        }
      } catch {}
      return res.status(500).json({ error: "Internal error" });
    }
  });
});

// GET /createCheckout?priceId=...&mode=payment|subscription
export const createCheckout = functions.region("us-central1").https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireAuth(req);
      if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });

      const priceId = String(req.query.priceId || "");
      const mode = req.query.mode === "subscription" ? "subscription" : "payment";
      if (!priceId) return res.status(400).json({ error: "Missing priceId" });

      const stripeSecret = functions.config().stripe?.secret || process.env.STRIPE_SECRET;
      if (!stripeSecret) return res.status(500).json({ error: "Stripe not configured" });
      const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

      const domain =
        functions.config().app?.domain ||
        process.env.APP_DOMAIN ||
        (req.headers.origin && /^https?:\/\//.test(req.headers.origin) ? req.headers.origin : `https://${req.headers.host}`);

      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${domain}/plans?success=1`,
        cancel_url: `${domain}/plans?canceled=1`,
        customer_email: user.email || undefined,
        metadata: { uid: user.uid },
      });

      return res.json({ url: session.url });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal error" });
    }
  });
});

// ===================== Stripe Checkout by Product (secure) =====================
const SUCCESS_URL = "https://mybodyscan-f3daf.web.app/checkout/success";
const CANCEL_URL = "https://mybodyscan-f3daf.web.app/checkout/canceled";

const KNOWN_PRODUCTS = {
  subscription: {
    annual: "prod_Sq56NGBUDUMhGD",
    monthly: "prod_Sq5377Wo0TnB8n",
  },
  credits: {
    single: "prod_Sq4zdmFOJQRnx9",
    pack3: "prod_Sq518jyDt1x0Dy",
    pack5: "prod_Sq51gLOTQn5sIP",
  },
};

async function getStripe() {
  const stripeSecret = functions.config().stripe?.secret || process.env.STRIPE_SECRET;
  if (!stripeSecret) throw new Error("Stripe not configured");
  return new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
}

async function getOrCreateCustomer(uid, email) {
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? userSnap.data()?.billing?.customerId : null;
  const stripe = await getStripe();
  if (existing) return existing;
  const customer = await stripe.customers.create({ email: email || undefined, metadata: { uid } });
  await userRef.set({ billing: { customerId: customer.id } }, { merge: true });
  return customer.id;
}

async function resolveDefaultPrice(stripe, productId) {
  const product = await stripe.products.retrieve(productId, { expand: ["default_price"] });
  const price = product.default_price && typeof product.default_price === "object" ? product.default_price : await stripe.prices.retrieve(String(product.default_price));
  if (!price?.active) throw new Error("Product has no active default price");
  const mode = price.recurring ? "subscription" : "payment";
  return { price, mode };
}

export const createCheckoutByProduct = functions.region("us-central1").https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireAuth(req);
      if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });

      const productId = String(req.query.productId || "");
      if (!productId) return res.status(400).json({ error: "Missing productId" });

      const stripe = await getStripe();
      const { price, mode } = await resolveDefaultPrice(stripe, productId);

      // ensure customer mapping
      const customerId = await getOrCreateCustomer(user.uid, user.email);

      const session = await stripe.checkout.sessions.create({
        mode,
        client_reference_id: user.uid,
        customer: customerId,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        metadata: { uid: user.uid, productId },
      });

      return res.json({ url: session.url });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal error" });
    }
  });
});

export const createCustomerPortal = functions.region("us-central1").https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireAuth(req);
      if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });
      const stripe = await getStripe();

      const userDoc = await db.doc(`users/${user.uid}`).get();
      const customerId = userDoc.exists ? userDoc.data()?.billing?.customerId : null;
      if (!customerId) return res.status(400).json({ error: "No Stripe customer on file" });

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: "https://mybodyscan-f3daf.web.app/settings",
      });
      return res.json({ url: session.url });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal error" });
    }
  });
});

async function findUidByCustomerId(customerId) {
  const qs = await db.collection("users").where("billing.customerId", "==", customerId).limit(1).get();
  if (qs.empty) return null;
  return qs.docs[0].id;
}

function isKnownSubscriptionProduct(productId) {
  if (!productId) return null;
  if (productId === KNOWN_PRODUCTS.subscription.monthly) return "monthly";
  if (productId === KNOWN_PRODUCTS.subscription.annual) return "annual";
  return null;
}

function creditsFromProduct(product) {
  const meta = product?.metadata || {};
  if (meta.credits) {
    const n = parseInt(meta.credits, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  // fallback by known product ids
  if (product?.id === KNOWN_PRODUCTS.credits.single) return 1;
  if (product?.id === KNOWN_PRODUCTS.credits.pack3) return 3;
  if (product?.id === KNOWN_PRODUCTS.credits.pack5) return 5;
  return 0;
}

export const stripeWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    const webhookSecret = functions.config().stripe?.webhook || process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send("Webhook secret not configured");

    const stripe = await getStripe();
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed.", err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency via webhooks/{eventId}
    const hookRef = db.doc(`webhooks/${event.id}`);
    const hookSnap = await hookRef.get();
    if (hookSnap.exists) {
      return res.status(200).send("Already processed");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const uid = session.client_reference_id;
        const customerId = session.customer?.toString();
        if (uid && customerId) {
          await db.doc(`users/${uid}`).set({ billing: { customerId } }, { merge: true });
        }

        if (session.mode === "subscription" && session.subscription && uid) {
          const sub = await stripe.subscriptions.retrieve(session.subscription.toString());
          const item = sub.items.data[0];
          const price = item.price;
          const productId = typeof price.product === "string" ? price.product : price.product.id;
          const type = isKnownSubscriptionProduct(productId) || (price.recurring?.interval === "year" ? "annual" : "monthly");
          await db.doc(`users/${uid}`).set({
            plan: {
              type,
              active: true,
              stripeSubscriptionId: sub.id,
              currentPeriodEnd: admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
            }
          }, { merge: true });
          // credits for first cycle will be granted on invoice.payment_succeeded
        }

        if (session.mode === "payment" && uid) {
          // grant credits by reading line items -> product metadata
          const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5, expand: ["data.price.product"] });
          let add = 0;
          for (const li of items.data) {
            const prod = typeof li.price.product === "string" ? await stripe.products.retrieve(li.price.product) : li.price.product;
            add += creditsFromProduct(prod);
          }
          if (add > 0) {
            await db.doc(`users/${uid}`).set({ credits: { wallet: admin.firestore.FieldValue.increment(add) } }, { merge: true });
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const customerId = invoice.customer?.toString();
        if (!customerId) break;
        const uid = await findUidByCustomerId(customerId);
        if (!uid) break;
        const subId = invoice.subscription?.toString();
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const item = sub.items.data[0];
          const price = item.price;
          const productId = typeof price.product === "string" ? price.product : price.product.id;
          const type = isKnownSubscriptionProduct(productId) || (price.recurring?.interval === "year" ? "annual" : "monthly");
          await db.doc(`users/${uid}`).set({
            plan: {
              type,
              active: true,
              stripeSubscriptionId: sub.id,
              currentPeriodEnd: admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000),
            }
          }, { merge: true });
        }
        // grant monthly credits (+3) on each successful invoice
        await db.doc(`users/${uid}`).set({ credits: { wallet: admin.firestore.FieldValue.increment(3) } }, { merge: true });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub.customer?.toString();
        if (!customerId) break;
        const uid = await findUidByCustomerId(customerId);
        if (!uid) break;
        await db.doc(`users/${uid}`).set({ plan: { active: false } }, { merge: true });
        break;
      }

      default:
        // ignore other events
        break;
    }

    await hookRef.create({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type });
    return res.status(200).send("ok");
  } catch (e) {
    console.error("Webhook handler error", e);
    return res.status(500).send("error");
  }
});
