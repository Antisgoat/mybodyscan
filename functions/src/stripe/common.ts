import Stripe from "stripe";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { initializeApp, getApps } from "firebase-admin/app";

if (!getApps().length) initializeApp();

export function getStripeSecret(): string {
  const secret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  return secret;
}

let stripeInstance: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getStripeSecret(), { apiVersion: "2023-10-16" });
  }
  return stripeInstance;
}

export const stripe = getStripeClient();

export function requireStripe(): void {
  try {
    getStripeSecret();
  } catch (error) {
    logger.error("STRIPE_SECRET_KEY missing");
    throw new Error("stripe_unconfigured");
  }
}

export async function requireUidFromAuthHeader(req: any): Promise<string> {
  const hdr = req.get("Authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) throw new Error("missing_auth");
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

export async function incCredits(uid: string, amount: number) {
  const db = getFirestore();
  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const cur = (snap.exists && (snap.data()?.credits as number)) || 0;
    tx.set(ref, { credits: cur + amount }, { merge: true });
  });
}

export async function setSubscriptionStatus(uid: string, status: string, product?: string, price?: string) {
  const db = getFirestore();
  await db.collection("users").doc(uid).set(
    {
      subscription: {
        status,
        product: product || null,
        price: price || null,
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}

export function appJson(handler: (req: any, res: any) => Promise<void>) {
  return onRequest({ cors: true }, async (req, res) => {
    try {
      res.set("Content-Type", "application/json");
      await handler(req, res);
    } catch (e: any) {
      const code = e?.message === "missing_auth" ? 401 : e?.message === "stripe_unconfigured" ? 501 : 500;
      res.status(code).send(JSON.stringify({ error: e?.message || "internal_error" }));
    }
  });
}
