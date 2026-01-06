import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { loadStripe } from "@stripe/stripe-js";
import { startCheckout } from "@/lib/api/billing";
import { createCustomerPortalSession } from "@/lib/api/portal";
import { openExternalUrl } from "@/lib/platform";
import { auth, db } from "@/lib/firebase";
import { isNative } from "@/lib/platform";
import { Navigate } from "react-router-dom";
import { useAuthUser } from "@/lib/auth";

const PRICE_IDS = {
  one: (import.meta.env.VITE_PRICE_ONE ?? "").trim(),
  monthly: (import.meta.env.VITE_PRICE_MONTHLY ?? "").trim(),
  yearly: (import.meta.env.VITE_PRICE_YEARLY ?? "").trim(),
  extra: (import.meta.env.VITE_PRICE_EXTRA ?? "").trim(),
} as const;

const MODES: Record<keyof typeof PRICE_IDS, "payment" | "subscription"> = {
  one: "payment",
  monthly: "subscription",
  yearly: "subscription",
  extra: "payment",
};

export default function Billing() {
  const [uid, setUid] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { user, authReady } = useAuthUser();
  const stripePromise = useMemo(() => {
    const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
    return key ? loadStripe(key) : null;
  }, []);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined;
    const nextUid = authReady ? (user?.uid ?? null) : null;
    setUid(nextUid);
    if (unsubscribeDoc) {
      unsubscribeDoc();
      unsubscribeDoc = undefined;
    }
    if (nextUid && db) {
      unsubscribeDoc = onSnapshot(doc(db, "users", nextUid), (snap) => {
        setCredits((snap.data()?.credits as number) ?? 0);
      });
    } else {
      setCredits(null);
    }
    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [authReady, user?.uid]);

  async function go<T>(fn: () => Promise<T>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const native = isNative();
  if (native) {
    return <Navigate to="/paywall" replace />;
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold mb-4">Billing</h1>
      <p className="mb-4 text-sm text-gray-600">
        Credits let you run body scans. Subscriptions deposit credits every
        billing cycle.
      </p>
      <div className="mb-4">
        Current credits: <b>{credits ?? "…"}</b>
      </div>

      <div className="space-y-3">
        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const priceId = PRICE_IDS.one;
              if (!priceId) throw new Error("Plan unavailable");
              const { sessionId, url } = await startCheckout(
                priceId,
                MODES.one
              );
              const stripe = stripePromise ? await stripePromise : null;
              if (stripe && sessionId) {
                const result = await stripe.redirectToCheckout({ sessionId });
                if (result.error) {
                  throw new Error(
                    result.error.message || "Stripe redirect failed"
                  );
                }
                return;
              }
              if (url) {
                await openExternalUrl(url);
                return;
              }
              throw new Error("Checkout unavailable");
            })
          }
        >
          Buy 1 Scan Credit
        </button>

        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const priceId = PRICE_IDS.monthly;
              if (!priceId) throw new Error("Plan unavailable");
              const { sessionId, url } = await startCheckout(
                priceId,
                MODES.monthly
              );
              const stripe = stripePromise ? await stripePromise : null;
              if (stripe && sessionId) {
                const result = await stripe.redirectToCheckout({ sessionId });
                if (result.error) {
                  throw new Error(
                    result.error.message || "Stripe redirect failed"
                  );
                }
                return;
              }
              if (url) {
                await openExternalUrl(url);
                return;
              }
              throw new Error("Checkout unavailable");
            })
          }
        >
          Subscribe — Monthly
        </button>

        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const priceId = PRICE_IDS.yearly;
              if (!priceId) throw new Error("Plan unavailable");
              const { sessionId, url } = await startCheckout(
                priceId,
                MODES.yearly
              );
              const stripe = stripePromise ? await stripePromise : null;
              if (stripe && sessionId) {
                const result = await stripe.redirectToCheckout({ sessionId });
                if (result.error) {
                  throw new Error(
                    result.error.message || "Stripe redirect failed"
                  );
                }
                return;
              }
              if (url) {
                await openExternalUrl(url);
                return;
              }
              throw new Error("Checkout unavailable");
            })
          }
        >
          Subscribe — Annual
        </button>

        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const url = await createCustomerPortalSession();
              await openExternalUrl(url);
            })
          }
        >
          Manage Subscription
        </button>
      </div>

      {msg && <p className="text-red-600 text-sm mt-3">{msg}</p>}
    </div>
  );
}
