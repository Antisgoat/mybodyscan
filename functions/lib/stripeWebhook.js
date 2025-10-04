import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { defineSecret } from "firebase-functions/params";
import { addCredits, setSubscriptionStatus } from "./credits.js";
import { FieldValue, Timestamp, getFirestore } from "./firebase.js";
const STRIPE_WEBHOOK = defineSecret("STRIPE_WEBHOOK");
const STRIPE_SECRET = defineSecret("STRIPE_SECRET");
const db = getFirestore();
const stripeWebhookOptions = {
    region: "us-central1",
    cors: ["https://mybodyscanapp.com", "https://mybodyscan-f3daf.web.app"],
    maxInstances: 3,
    secrets: [STRIPE_WEBHOOK, STRIPE_SECRET],
    rawBody: true,
};
export const stripeWebhook = onRequest(stripeWebhookOptions, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const signature = req.header("Stripe-Signature");
    if (!signature) {
        res.status(400).send("Missing signature");
        return;
    }
    const stripeSecret = STRIPE_SECRET.value();
    const webhookSecret = STRIPE_WEBHOOK.value();
    if (!stripeSecret || !webhookSecret) {
        console.error("stripeWebhook", "Missing Stripe secrets");
        res.status(500).send("Missing Stripe secrets");
        return;
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
    const rawBody = req.rawBody;
    if (!rawBody) {
        console.error("stripeWebhook", "Missing raw body");
        res.status(400).send("Missing raw body");
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
    catch (err) {
        console.error("stripeWebhook", err?.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));
    const eventRef = db.collection("stripe_events").doc(event.id);
    const shouldProcess = await db.runTransaction(async (tx) => {
        const existing = await tx.get(eventRef);
        if (existing.exists) {
            return false;
        }
        tx.create(eventRef, {
            type: event.type,
            receivedAt: FieldValue.serverTimestamp(),
            expiresAt,
        });
        return true;
    });
    if (!shouldProcess) {
        res.status(200).send("ok");
        return;
    }
    try {
        console.info("stripe_webhook_event", { type: event.type, id: event.id });
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const uid = session.metadata?.uid || null;
                const priceId = session.metadata?.priceId || null;
                if (uid && priceId) {
                    await addCredits(uid, 1, `Checkout ${priceId}`, 12);
                }
                break;
            }
            case "invoice.payment_succeeded": {
                const invoice = event.data.object;
                const uid = invoice.metadata?.uid || null;
                if (uid) {
                    const lines = Array.isArray(invoice.lines?.data) ? invoice.lines.data : [];
                    const isMonthly = lines.some((line) => line.price?.recurring?.interval === "month");
                    const isAnnual = lines.some((line) => line.price?.recurring?.interval === "year");
                    if (isMonthly) {
                        await addCredits(uid, 3, "Monthly subscription", 12);
                    }
                    if (isAnnual) {
                        await addCredits(uid, 36, "Annual subscription (3/mo x 12)", 12);
                    }
                    await setSubscriptionStatus(uid, "active", invoice.lines.data[0]?.price?.id || null, invoice.lines.data[0]?.period?.end || null);
                }
                break;
            }
            case "customer.subscription.deleted": {
                const subscription = event.data.object;
                const uid = subscription.metadata?.uid || null;
                if (uid) {
                    await setSubscriptionStatus(uid, "canceled", null, null);
                }
                break;
            }
            default: {
                // Defensive guard: ignore non-transactional events without crashing
                console.warn("stripeWebhook_ignored_event", { type: event.type, id: event.id });
                break;
            }
        }
        await eventRef.set({ processedAt: FieldValue.serverTimestamp() }, { merge: true });
        res.status(200).send("ok");
        return;
    }
    catch (err) {
        console.error("stripeWebhook handler", err?.message || err);
        await eventRef.set({ error: err?.message || String(err), processedAt: FieldValue.serverTimestamp() }, { merge: true });
        res.status(500).send("Handler error");
        return;
    }
});
//# sourceMappingURL=stripeWebhook.js.map