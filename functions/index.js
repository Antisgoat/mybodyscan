// Cloud Functions v2 (Node 20, ESM) — Stripe Checkout wired with secrets

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import admin from "firebase-admin";
import Stripe from "stripe";

admin.initializeApp();

setGlobalOptions({
  region: "us-central1",
});

const getStripe = () => {
  const key = process.env.STRIPE_SECRET;
  if (!key) throw new Error("STRIPE_SECRET not set");
  return new Stripe(key, { apiVersion: "2024-06-20" });
};

const creditsByPlan = { single: 1, pack3: 3, pack5: 5, monthly: 3, annual: 36 };

// --- LIVE Stripe Price IDs (keep the ones you showed) ---
const PRICES = {
  single:  "price_1RuOpKQQU5vuhlNjipfFBsR0",
  pack3:   "price_1RuOr2QQU5vuhlNjcqTckCHL",
  pack5:   "price_1RuOrkQQU5vuhlNj15ebWfNP",
  monthly: "price_1RuOtOQQU5vuhlNjmXnQSsYq",
  annual:  "price_1RuOw0QQU5vuhlNjA5NZ66qq",
};

// Allowlisted product IDs for security
const ALLOWED_PRODUCTS = new Set([
  // Add your allowed product IDs here
  // Example: "prod_ExampleProductId123"
]);

// Helpers
function assertAuthed(auth) {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");
  return uid;
}

async function verifyIdToken(req) {
  const authHeader = req.headers?.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new HttpsError("unauthenticated", "Missing token");
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    throw new HttpsError("unauthenticated", "Invalid token");
  }
}

const lbToKg = (lb) => lb / 2.2046226218;
const ftInToCm = (ft, inch) => (ft * 12 + inch) * 2.54;
const kgToLb = (kg) => kg * 2.2046226218;
const cmToFtIn = (cm) => {
  const totalIn = cm / 2.54;
  return { ft: Math.floor(totalIn / 12), in: Math.round(totalIn % 12) };
};

// ===== Callable: create Stripe Checkout session =====
export const createCheckoutSession = onCall(
  { secrets: ["STRIPE_SECRET"] },
  async (request) => {
    const stripe = getStripe();
    const uid = assertAuthed(request.auth);
    const plan = String(request.data?.plan || "");

    if (!Object.prototype.hasOwnProperty.call(PRICES, plan)) {
      throw new HttpsError("invalid-argument", "Invalid plan");
    }

    const priceId = PRICES[plan];
    const price = await stripe.prices.retrieve(priceId);
    const mode = price?.recurring ? "subscription" : "payment";

    const domain = "https://mybodyscanapp.com";

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${domain}/plans?success=1`,
      cancel_url: `${domain}/plans?canceled=1`,
      client_reference_id: uid,
      metadata: { uid, plan },
    });

    return { url: session.url };
  }
);

// ===== Callable: start scan (consume credit + enqueue) =====
export const startScan = onCall(async (req) => {
  const uid = assertAuthed(req.auth);
  const { filename, size, contentType } = req.data || {};
  if (typeof filename !== 'string' || typeof size !== 'number' || typeof contentType !== 'string') {
    throw new HttpsError('invalid-argument', 'Invalid file metadata');
  }
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const scanRef = userRef.collection('scans').doc();
  let remaining = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const credits = snap.exists ? snap.data()?.credits || 0 : 0;
    if (credits <= 0) {
      throw new HttpsError('failed-precondition', 'No credits left');
    }
    remaining = credits - 1;
    tx.update(userRef, {
      credits: remaining,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(scanRef, {
      uid,
      status: 'queued',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      filename,
      size,
      contentType,
    });
  });
  return { scanId: scanRef.id, remaining };
});

// ===== HTTPS: create checkout by product =====
export const createCheckoutByProduct = onRequest(
  { secrets: ['STRIPE_SECRET'] },
  async (req, res) => {
    let uid;
    try {
      uid = await verifyIdToken(req);
    } catch {
      res.status(401).send('unauthenticated');
      return;
    }
    const productId = req.query.productId;
    if (typeof productId !== 'string') {
      res.status(400).send('missing-productId');
      return;
    }
    if (!ALLOWED_PRODUCTS.has(productId)) {
      res.status(400).send('invalid-productId');
      return;
    }
    try {
      const stripe = getStripe();
      const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
      const price = product.default_price;
      const priceId = typeof price === 'string' ? price : price?.id;
      if (!priceId) {
        res.status(400).send('product-has-no-price');
        return;
      }
      const domain = 'https://mybodyscanapp.com';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${domain}/plans?success=1`,
        cancel_url: `${domain}/plans?canceled=1`,
        client_reference_id: uid,
        metadata: { uid, productId },
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error('createCheckoutByProduct error', e?.message);
      res.status(500).send('error');
    }
  }
);

// ===== HTTPS: create customer portal =====
export const createCustomerPortal = onRequest(
  { secrets: ['STRIPE_SECRET'] },
  async (req, res) => {
    let uid;
    try {
      uid = await verifyIdToken(req);
    } catch {
      res.status(401).send('unauthenticated');
      return;
    }
    try {
      const db = admin.firestore();
      const snap = await db.collection('users').doc(uid).get();
      const customerId = snap.data()?.stripeCustomerId;
      if (!customerId) {
        res.status(400).send('no-customer');
        return;
      }
      const stripe = getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://mybodyscanapp.com/plans',
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error('createCustomerPortal error', e?.message);
      res.status(500).send('error');
    }
  }
);

// ===== HTTPS: Stripe Webhook (credit grants + idempotency) =====
export const stripeWebhook = onRequest(
  { secrets: ["STRIPE_SECRET", "STRIPE_WEBHOOK"] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const sig = req.headers["stripe-signature"];
    const raw = req.rawBody;
    console.log(
      "hasSig:",
      !!sig,
      "rawIsBuf:",
      Buffer.isBuffer(raw),
      "rawLen:",
      raw?.length || 0
    );

    const stripe = getStripe();
    const whsec = process.env.STRIPE_WEBHOOK;
    if (!whsec) {
      console.error("STRIPE_WEBHOOK not set");
      res.status(500).send("missing-webhook-secret");
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, whsec);
    } catch (e) {
      console.error("Webhook verify failed:", e?.message);
      res.status(400).send(`Webhook Error: ${e?.message}`);
      return;
    }

    const db = admin.firestore();
    const eventId = event.id;
    const seenRef = db.collection("stripe_events").doc(eventId);

    // Idempotency
    const seenSnap = await seenRef.get();
    if (seenSnap.exists) {
      console.log("Duplicate event:", eventId);
      res.status(200).send("ok-duplicate");
      return;
    }

    const allowed = new Set(["checkout.session.completed","invoice.payment_succeeded"]);
    if (!allowed.has(event.type)) {
      console.log("Unhandled event:", event.type);
      await seenRef.set({
        type: event.type,
        at: admin.firestore.FieldValue.serverTimestamp(),
        _expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
      res.status(200).send("ok");
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const uid = session?.metadata?.uid;
          const plan = session?.metadata?.plan;
          if (!uid || !plan) {
            console.warn("Missing uid/plan in metadata", {
              uid,
              plan,
              sessionId: session?.id,
            });
            break;
          }
          const add = creditsByPlan[plan] ?? 1;
          const userRef = db.collection("users").doc(uid);
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            const current =
              (snap.exists ? snap.data()?.credits || 0 : 0) + add;
            tx.set(
              userRef,
              {
                credits: current,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          });
          console.log(`Granted ${add} credits to uid=${uid} via plan=${plan}`);
          break;
        }

        case "invoice.payment_succeeded": {
          // Optional: monthly top-ups for subscriptions
          console.log("invoice.payment_succeeded (noop)");
          break;
        }

        default:
          console.log("Unhandled event:", event.type);
      }

      await seenRef.set({
        type: event.type,
        at: admin.firestore.FieldValue.serverTimestamp(),
        _expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
      res.status(200).send("ok");
    } catch (err) {
      console.error(
        "Handler error:",
        err?.stack || err?.message || err
      );
      res.status(500).send("internal-error");
    }
  }
);

// ===== Callable: useCredit (atomic spend) =====
export const useCredit = onCall(
  { secrets: ["STRIPE_SECRET"] },
  async (req) => {
    const uid = assertAuthed(req.auth);
    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    let remaining = 0;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const current = snap.exists ? snap.data()?.credits || 0 : 0;
      if (current <= 0) {
        throw new HttpsError("failed-precondition", "No credits left");
      }
      remaining = current - 1;
      tx.update(userRef, {
        credits: remaining,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const useRef = userRef.collection("credit_uses").doc();
      tx.set(useRef, {
        at: admin.firestore.FieldValue.serverTimestamp(),
        reason: req.data?.reason ?? "scan",
      });
    });
    return { ok: true, remaining };
  }
);

// ===== Callable: saveOnboarding =====
export const saveOnboarding = onCall(async (req) => {
  const uid = assertAuthed(req.auth);
  const data = req.data || {};
  const units = data.units === "metric" ? "metric" : "us";
  const sex = data.sex;
  if (sex !== "male" && sex !== "female") {
    throw new HttpsError("invalid-argument", "Invalid sex");
  }
  const age = typeof data.age === "number" ? data.age : undefined;
  const dob = typeof data.dob === "string" ? data.dob : undefined;
  if (!age && !dob) {
    throw new HttpsError("invalid-argument", "age or dob required");
  }
  let height_cm;
  let weight_kg;
  if (units === "us") {
    const ft = Number(data.height_ft);
    const inch = Number(data.height_in);
    const lb = Number(data.weight_lb);
    if (!ft || isNaN(inch) || !lb) {
      throw new HttpsError("invalid-argument", "Missing height/weight");
    }
    height_cm = ftInToCm(ft, inch);
    weight_kg = lbToKg(lb);
  } else {
    height_cm = Number(data.height_cm);
    weight_kg = Number(data.weight_kg);
  }
  if (!height_cm || !weight_kg) {
    throw new HttpsError("invalid-argument", "Missing height/weight");
  }
  const activity_level = data.activity_level;
  const activityOpts = ["sedentary", "light", "moderate", "very", "extra"];
  if (!activityOpts.includes(activity_level)) {
    throw new HttpsError("invalid-argument", "Invalid activity level");
  }
  const goal = data.goal;
  const goalOpts = ["lose_fat", "gain_muscle", "improve_heart"];
  if (!goalOpts.includes(goal)) {
    throw new HttpsError("invalid-argument", "Invalid goal");
  }
  const style = data.style;
  const styleOpts = ["ease_in", "all_in"];
  if (!styleOpts.includes(style)) {
    throw new HttpsError("invalid-argument", "Invalid style");
  }
  const timeframe_weeks = Number(data.timeframe_weeks);
  if (!timeframe_weeks || isNaN(timeframe_weeks)) {
    throw new HttpsError("invalid-argument", "Invalid timeframe");
  }
  const flags = data.medical_flags || {};
  const medical_flags = {
    pregnant: Boolean(flags.pregnant),
    under18: Boolean(flags.under18),
    eating_disorder_history: Boolean(flags.eating_disorder_history),
    heart_condition: Boolean(flags.heart_condition),
  };
  const ack = { disclaimer: Boolean(data.ack?.disclaimer) };
  if (!ack.disclaimer) {
    throw new HttpsError("failed-precondition", "Disclaimer not accepted");
  }
  const profile = {
    sex,
    age,
    dob,
    height_cm,
    weight_kg,
    activity_level,
    goal,
    timeframe_weeks,
    style,
    medical_flags,
    ack,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin
    .firestore()
    .doc(`users/${uid}/coach/profile`)
    .set(profile, { merge: true });
  return { ok: true };
});

// ===== Callable: computePlan =====
export const computePlan = onCall(async (req) => {
  const uid = assertAuthed(req.auth);
  const db = admin.firestore();
  const profSnap = await db.doc(`users/${uid}/coach/profile`).get();
  if (!profSnap.exists) {
    throw new HttpsError("failed-precondition", "Profile missing");
  }
  const p = profSnap.data() || {};
  const sex = p.sex;
  const age = p.age || (p.dob ? Math.floor((Date.now() - Date.parse(p.dob)) / 3.15576e10) : 0);
  const weight = p.weight_kg;
  const height = p.height_cm;
  const activity = p.activity_level;
  const goal = p.goal;
  const style = p.style;
  const flags = p.medical_flags || {};
  const bmr =
    sex === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;
  const factors = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very: 1.725,
    extra: 1.9,
  };
  const tdee = bmr * (factors[activity] || 1.2);
  let target = tdee;
  let needs_clearance = false;
  let message = "";
  if (
    flags.under18 ||
    flags.pregnant ||
    flags.eating_disorder_history ||
    flags.heart_condition
  ) {
    needs_clearance = true;
    message = "Medical clearance recommended";
  } else {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    if (goal === "lose_fat") {
      const maxDef = Math.min(700, Math.round((0.01 * weight * 7700) / 7));
      let deficit = style === "all_in" ? 600 : 300;
      deficit = clamp(deficit, 300, maxDef);
      target = tdee - deficit;
    } else if (goal === "gain_muscle") {
      let surplus = style === "all_in" ? 350 : 200;
      surplus = clamp(surplus, 150, 400);
      target = tdee + surplus;
    } else if (goal === "improve_heart") {
      let deficit = style === "all_in" ? 200 : 0;
      deficit = clamp(deficit, 0, 200);
      const bmi = weight / ((height / 100) ** 2);
      if (bmi < 22) deficit = 0;
      target = tdee - deficit;
    }
  }
  const minCalories = sex === "female" ? 1200 : 1500;
  target = Math.max(minCalories, target);
  const protein = Math.round(Math.min(Math.max(1.8, 1.6), 2.2) * weight);
  const fat = Math.round(Math.max(0.6 * weight, 40));
  const carbs = Math.round(
    Math.max((target - (protein * 4 + fat * 9)) / 4, 0)
  );
  const plan = {
    tdee: Math.round(tdee),
    target_kcal: Math.round(target),
    goal,
    style,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (needs_clearance) {
    plan.needs_clearance = true;
    plan.message = message;
  }
  await db.doc(`users/${uid}/coach/plan/current`).set(plan);
  const { ft, in: inch } = cmToFtIn(height);
  return { ...plan, weight_kg: weight, height_cm: height, weight_lb: kgToLb(weight), height_ft: ft, height_in: inch };
});

