import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

const stripeSecret = defineSecret('STRIPE_SECRET');

export const createBillingPortal = onRequest({
  region: 'us-central1',
  secrets: [stripeSecret],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    res.status(401).send('Unauthorized');
    return;
  }
  const userSnap = await getFirestore().doc(`users/${uid}`).get();
  const customerId = userSnap.get('subscription.customerId') || userSnap.get('stripeCustomerId');
  if (!customerId) {
    res.status(400).send('No customer');
    return;
  }
  const stripe = new Stripe(stripeSecret.value(), { apiVersion: '2024-06-20' });
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId as string,
    return_url: 'https://mybodyscanapp.com/settings',
  });
  res.json({ url: session.url });
});
