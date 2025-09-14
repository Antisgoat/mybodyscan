import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import Stripe from 'stripe';
import { PRICES, INTRO_COUPON } from './pricing.js';

const stripeSecret = defineSecret('STRIPE_SECRET');

export const createCheckout = onRequest({
  region: 'us-central1',
  secrets: [stripeSecret],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  try {
    await getAuth().verifyIdToken(token);
  } catch {
    res.status(401).send('Unauthorized');
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const plan = body?.plan as keyof typeof PRICES | undefined;
  if (!plan || !(plan in PRICES)) {
    res.status(400).send('Invalid plan');
    return;
  }
  const uid = body?.uid as string | undefined;
  if (!uid) {
    res.status(400).send('Missing uid');
    return;
  }
  const stripe = new Stripe(stripeSecret.value(), { apiVersion: '2024-06-20' });
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: plan === 'PRO_MONTHLY' || plan === 'ELITE_ANNUAL' ? 'subscription' : 'payment',
    line_items: [{ price: PRICES[plan], quantity: 1 }],
    success_url: 'https://mybodyscanapp.com/success',
    cancel_url: 'https://mybodyscanapp.com/cancel',
    metadata: { uid, plan },
  };
  if (plan === 'PRO_MONTHLY') {
    params.discounts = [{ coupon: INTRO_COUPON }];
  }
  const session = await stripe.checkout.sessions.create(params);
  res.json({ url: session.url });
});
