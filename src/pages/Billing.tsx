import React, { useMemo, useState } from "react";
import { startCheckout } from "@/lib/api/billing";
import { createCustomerPortalSession } from "@/lib/api/portal";
import { openExternalUrl } from "@/lib/platform";
import { isCapacitorNative } from "@/lib/platform/isNative";
import { Navigate } from "react-router-dom";
import { useAuthUser } from "@/auth/mbs-auth";
import { useCredits } from "@/hooks/useCredits";
import { Check } from "lucide-react";
import { Seo } from "@/components/Seo";

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
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;
  const { credits, loading: creditsLoading } = useCredits();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const native = isCapacitorNative();
  const stripePromise = useMemo(() => {
    if (native) return null;
    const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
    return key
      ? import("@stripe/stripe-js").then(({ loadStripe }) => loadStripe(key))
      : null;
  }, [native]);

  async function go<T>(fn: () => Promise<T>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (native) {
    return <Navigate to="/paywall" replace />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Seo
        title="Plans & Billing - MyBodyScan"
        description="Choose single-scan or ongoing MyBodyScan access."
      />
      <header className="space-y-2">
        <p className="text-sm font-semibold text-primary">
          Plans &amp; billing
        </p>
        <h1 className="text-3xl font-bold">Choose how you want to progress</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A single scan includes its complete source-labeled report and initial
          plan. Membership adds the ongoing tools that respond as your routine
          changes.
        </p>
        <p className="text-sm">
          Current scan credits:{" "}
          <b>
            {creditsLoading
              ? "…"
              : credits === Infinity
                ? "Unlimited"
                : credits}
          </b>
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">One time</div>
          <h2 className="mt-1 text-lg font-semibold">One scan</h2>
          <div className="mt-2 text-2xl font-bold">$4.99</div>
          <ul className="my-4 flex-1 space-y-2 text-sm">
            {[
              "One four-photo scan",
              "Complete labeled report",
              "Initial workout and nutrition plan",
            ].map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
          <button
            className="w-full rounded-md border px-3 py-2 font-medium"
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
            Buy one scan
          </button>
        </section>

        <section className="flex flex-col rounded-xl border-2 border-primary bg-card p-5 shadow-sm">
          <div className="text-sm font-semibold text-primary">
            Most flexible
          </div>
          <h2 className="mt-1 text-lg font-semibold">Monthly Pro</h2>
          <div className="mt-2 text-2xl font-bold">
            $9.99<span className="text-sm font-normal">/month</span>
          </div>
          <ul className="my-4 flex-1 space-y-2 text-sm">
            {[
              "Three scan credits per renewal",
              "Personal Coach and weekly adaptive reviews",
              "Workout tracking, meal plans, recipes, and food insights",
            ].map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
          <button
            className="w-full rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground"
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
            Choose monthly
          </button>
        </section>

        <section className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Best annual value</div>
          <h2 className="mt-1 text-lg font-semibold">Yearly Pro</h2>
          <div className="mt-2 text-2xl font-bold">
            $79.99<span className="text-sm font-normal">/year</span>
          </div>
          <ul className="my-4 flex-1 space-y-2 text-sm">
            {[
              "36 scan credits per renewal",
              "All ongoing Pro coaching and tracking",
              "Same features for about $6.67/month",
            ].map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
          <button
            className="w-full rounded-md border px-3 py-2 font-medium"
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
            Choose yearly
          </button>
        </section>
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <button
          className="w-full rounded-md border bg-background p-2 font-medium"
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
        <p className="text-center text-xs text-muted-foreground">
          Subscription renews until canceled. See the checkout and Terms for
          billing details.
        </p>
      </div>

      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
    </div>
  );
}
