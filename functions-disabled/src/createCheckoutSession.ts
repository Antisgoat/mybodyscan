import * as functions from "firebase-functions";
import Stripe from "stripe";
import * as admin from "firebase-admin";

interface Body {
  priceId: string;
  mode: "payment" | "subscription";
  successUrl: string;
  cancelUrl: string;
}

export const createCheckoutSession = onRequest(
  { secrets: ["STRIPE_SECRET_KEY"] },
  async (req, res) => {
    try {
      const authHeader = req.get("authorization") || "";
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const decoded = await getAuth().verifyIdToken(match[1]);
      const body = req.body as Body;
      if (!body?.priceId || !body?.mode || !body?.successUrl || !body?.cancelUrl) {
        res.status(400).json({ error: "Invalid request" });
        return;
      }
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2024-06-20" as any,
      });
      const session = await stripe.checkout.sessions.create({
        mode: body.mode,
        line_items: [{ price: body.priceId, quantity: 1 }],
        success_url: body.successUrl,
        cancel_url: body.cancelUrl,
        metadata: { uid: decoded.uid, price_id: body.priceId },
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);
