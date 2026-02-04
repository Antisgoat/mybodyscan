import { useCallback, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { useAuthUser } from "@/auth/mbs-auth";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useCredits } from "@/hooks/useCredits";
import { useSubscription } from "@/hooks/useSubscription";
import { PRICE_IDS } from "@/config/prices";
import { startCheckout } from "@/lib/api/billing";
import { apiFetchJson } from "@/lib/apiFetch";
import { createCustomerPortalSession } from "@/lib/api/portal";
import { openExternalUrl } from "@/lib/platform";
import { reportError } from "@/lib/telemetry";
import { isIOSBuild } from "@/lib/iosBuild";
import { isNative } from "@/lib/platform";

const PRICE_ID_ONE = PRICE_IDS.single;
const PRICE_ID_MONTHLY = PRICE_IDS.monthly;
const PRICE_ID_YEARLY = PRICE_IDS.yearly;
const PRICE_ID_EXTRA = (import.meta.env.VITE_PRICE_EXTRA ?? "").trim();
const STRIPE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ""
).trim();
const BILLING_CONFIGURED = Boolean(STRIPE_PUBLISHABLE_KEY);

type PlanConfig = {
  name: string;
  price: string;
  period: string;
  credits: string;
  plan: "one" | "pro_monthly" | "elite_annual" | "extra";
  priceId: string;
  envKey?: string;
  mode: "payment" | "subscription";
  features: string[];
  description?: string;
  badge?: string;
  popular: boolean;
  originalPrice?: string;
  subscriberOnly: boolean;
};

export default function Plans() {
  const { t } = useI18n();
  const { user } = useAuthUser();
  const iosBuild = isIOSBuild();
  const native = isNative();
  const stripePromise = useMemo(() => {
    if (__IS_NATIVE__ || native) return null;
    if (!STRIPE_PUBLISHABLE_KEY) return null;
    return import("@stripe/stripe-js").then(({ loadStripe }) =>
      loadStripe(STRIPE_PUBLISHABLE_KEY)
    );
  }, [native]);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [billingActionError, setBillingActionError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const demoMode = useDemoMode();
  const { refresh: refreshCredits } = useCredits();
  const [refreshingCredits, setRefreshingCredits] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isActive: hasSubscription,
    subscription,
    error: subscriptionError,
  } = useSubscription();
  const [managingSubscription, setManagingSubscription] = useState(false);
  const status = searchParams.get("status");
  const success = searchParams.get("success") === "1" || status === "success";
  const canceled = searchParams.get("canceled") === "1" || status === "cancel";
  const signUpHref = "/auth?next=/plans";
  const subscriptionStatus = subscription?.status ?? "none";
  const subscriptionPastDue = subscriptionStatus === "past_due";
  const subscriptionCanceled = subscriptionStatus === "canceled";
  const subscriptionActive = subscriptionStatus === "active";

  const dismissCheckoutState = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("success");
    next.delete("canceled");
    next.delete("status");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleRefreshCredits = async () => {
    if (!user) return;
    setRefreshingCredits(true);
    try {
      try {
        await apiFetchJson("/system/bootstrap", {
          method: "POST",
          body: JSON.stringify({}),
        });
        await user.getIdToken(true).catch(() => undefined);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("plans_refresh_credits_failed", error);
        }
      }
      refreshCredits();
    } finally {
      dismissCheckoutState();
      setBillingActionError(null);
      setRefreshingCredits(false);
    }
  };

  const handleRetryCheckout = () => {
    dismissCheckoutState();
    setBillingActionError(null);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  const handleManageSubscription = async () => {
    if (iosBuild) {
      setBillingActionError({
        title: "Available on web",
        message:
          "Subscription management is disabled in the iOS build. Please use the web app to manage plans.",
      });
      return;
    }
    if (!BILLING_CONFIGURED) {
      setBillingActionError({
        title: "Billing unavailable",
        message:
          "Stripe is not configured for this environment. Please try again later.",
      });
      void reportError({
        kind: "client_error",
        message: "billing_portal_missing_stripe_key",
        code: "failed-precondition",
        extra: { page: "Plans", action: "manageSubscription" },
      });
      return;
    }
    setManagingSubscription(true);
    setBillingActionError(null);
    try {
      const url = await createCustomerPortalSession();
      await openExternalUrl(url);
    } catch (err: any) {
      const message =
        typeof err?.message === "string" && err.message.length
          ? err.message
          : "Subscription management is unavailable right now.";
      setBillingActionError({
        title: "Can't open portal",
        message: "Subscription management is currently unavailable. Please try again.",
      });
      void reportError({
        kind: "client_error",
        message,
        code: err?.code || "client_error",
        extra: { fn: "createCustomerPortalSession" },
      });
    } finally {
      setManagingSubscription(false);
    }
  };

  const authed = Boolean(user);
  const canBuy = authed && BILLING_CONFIGURED && !iosBuild;

  const handleCheckout = async (plan: PlanConfig) => {
    if (iosBuild) {
      setBillingActionError({
        title: "Available on web",
        message:
          "Purchases are disabled in the iOS build. Please use the web app to manage plans.",
      });
      return;
    }
    if (!user) {
      window.location.assign("/auth?next=/plans");
      return;
    }
    if (!BILLING_CONFIGURED) {
      setBillingActionError({
        title: "Billing unavailable",
        message:
          "Stripe is not configured for this environment. Please try again later.",
      });
      void reportError({
        kind: "client_error",
        message: "billing_checkout_missing_stripe_key",
        code: "failed-precondition",
        extra: { page: "Plans", action: "checkout" },
      });
      return;
    }
    if (!plan.priceId) {
      const description = plan.envKey
        ? `This plan is not configured yet. Set ${plan.envKey} before enabling checkout.`
        : "This plan is not configured yet.";
      setBillingActionError({
        title: "Plan unavailable",
        message: description,
      });
      return;
    }

    setPendingPlan(plan.plan);
    setBillingActionError(null);
    try {
      track("checkout_start", { plan: plan.plan, priceId: plan.priceId });
      const { sessionId, url } = await startCheckout(plan.priceId, plan.mode);

      if (sessionId && stripePromise) {
        const stripe = await stripePromise;
        if (stripe) {
          const { error } = await stripe.redirectToCheckout({ sessionId });
          if (error) {
            throw new Error(error.message || "Stripe redirect failed.");
          }
          return;
        }
      }

      if (url) {
        window.location.assign(url);
        return;
      }

      throw new Error("Checkout unavailable");
    } catch (err: any) {
      const errMessage =
        typeof err?.message === "string" && err.message.length
          ? err.message
          : String(err);
      const debugId = (err as { debugId?: string } | undefined)?.debugId;
      if (import.meta.env.DEV) {
        console.warn("checkout_error", err);
      }
      const ref = debugId ? ` (ref ${debugId.slice(0, 8)})` : "";
      // Keep this small + non-scary (no raw "Bad Request" text).
      setBillingActionError({
        title: "Checkout unavailable",
        message: `Checkout is currently unavailable; please try again.${ref}`,
      });
      void reportError({
        kind: "client_error",
        message: errMessage || "checkout failed",
        code: err?.code || "client_error",
        extra: { fn: "checkout", debugId },
      });
    } finally {
      setPendingPlan(null);
    }
  };

  const ENABLE_SCAN_PACKS = false;

  const corePlans: PlanConfig[] = [
    {
      name: "One Scan",
      price: "$9.99",
      period: "one-time",
      credits: "1 scan credit",
      plan: "one" as const,
      priceId: PRICE_ID_ONE,
      envKey: "VITE_PRICE_SINGLE",
      mode: "payment" as const,
      features: [
        "1 body composition scan",
        "Detailed analysis",
        "Progress tracking",
      ],
      description: "Perfect for trying out MyBodyScan",
      popular: false,
      badge: undefined,
      originalPrice: undefined,
      subscriberOnly: false,
    },
    {
      name: "Monthly",
      price: "$14.99",
      originalPrice: "$24.99",
      period: "first month, then $24.99/mo",
      credits: "3 scans/month + Coach + Nutrition",
      plan: "pro_monthly" as const,
      priceId: PRICE_ID_MONTHLY,
      envKey: "VITE_PRICE_MONTHLY",
      mode: "subscription" as const,
      features: [
        "3 scans per month",
        "AI Coach & workout plans",
        "Nutrition tracking & advice",
        "Progress analytics",
        "Priority support",
      ],
      popular: false,
      badge: undefined,
      description: undefined,
      subscriberOnly: false,
    },
    {
      name: "Yearly",
      price: "$199.99",
      period: "per year",
      credits: "3 scans/month + Everything included",
      plan: "elite_annual" as const,
      priceId: PRICE_ID_YEARLY,
      envKey: "VITE_PRICE_YEARLY",
      mode: "subscription" as const,
      popular: true,
      features: [
        "3 scans per month",
        "All Monthly features",
        "Save $99.89 vs monthly",
        "Advanced analytics",
        "Export data",
        "Early access to new features",
      ],
      badge: "Best Value",
      description: undefined,
      originalPrice: undefined,
      subscriberOnly: false,
    },
  ];

  const scanPackPlans: PlanConfig[] = [
    {
      name: "Extra Scan",
      price: "$9.99",
      period: "one-time",
      credits: "1 scan credit",
      plan: "extra" as const,
      priceId: PRICE_ID_EXTRA,
      envKey: "VITE_PRICE_EXTRA",
      mode: "payment" as const,
      features: [
        "Additional scan credit",
        "For existing subscribers",
        "Same detailed analysis",
      ],
      description: "For subscribers who need extra scans",
      subscriberOnly: true,
      popular: false,
      badge: undefined,
      originalPrice: undefined,
    },
  ];

  const plans: PlanConfig[] = [
    corePlans[0],
    ...(ENABLE_SCAN_PACKS ? scanPackPlans : []),
    corePlans[1],
    corePlans[2],
  ];

  const missingPriceEnvKeys = plans
    .filter((plan) => !plan.priceId && plan.envKey)
    .map((plan) => plan.envKey as string);

  const uniqueMissingEnvKeys = Array.from(new Set(missingPriceEnvKeys));

  if (native) {
    return <Navigate to="/paywall" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <main className="max-w-md mx-auto p-6 space-y-6">
        <Seo
          title="Plans - MyBodyScan"
          description="Choose your scanning plan"
        />
        {billingActionError && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <AlertTitle>{billingActionError.title}</AlertTitle>
                  <AlertDescription className="text-sm">
                    {billingActionError.message}
                  </AlertDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setBillingActionError(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </Alert>
        )}
        {iosBuild && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Purchases and subscription management are disabled in the iOS build
              for App Store compliance. Use the web app to manage billing.
            </AlertDescription>
          </Alert>
        )}
        {canceled && (
          <Alert
            variant="destructive"
            className="border-destructive/40 bg-destructive/5"
          >
            <AlertTitle>Checkout canceled</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                We didn't charge your card. Start checkout again when you're
                ready.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRetryCheckout}
              >
                Try checkout again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-primary/40 bg-primary/5">
            <AlertTitle>Payment received</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Credits will appear shortly after processing. Refresh once
                webhook processing completes.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefreshCredits}
                disabled={refreshingCredits}
              >
                {refreshingCredits ? "Refreshing…" : "Refresh credits"}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {subscription && (
          <Alert
            variant={
              subscriptionPastDue || subscriptionCanceled
                ? "destructive"
                : undefined
            }
            className={
              subscriptionPastDue || subscriptionCanceled
                ? "border-destructive/40 bg-destructive/5"
                : "border-emerald-300 bg-emerald-50 text-emerald-900"
            }
          >
            <AlertTitle>
              {subscriptionCanceled
                ? "Subscription canceled"
                : subscriptionPastDue
                  ? "Payment past due"
                  : "Subscription active"}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Status: {subscriptionStatus}
                {subscription?.price ? ` • Price: ${subscription.price}` : ""}
                {subscriptionPastDue
                  ? " — update your payment method to keep premium scans."
                  : subscriptionCanceled
                    ? " — restart checkout to regain access."
                    : subscriptionActive
                      ? " — premium access is enabled."
                      : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleManageSubscription}
                disabled={managingSubscription}
              >
                {managingSubscription
                  ? "Opening portal…"
                  : "Manage subscription"}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {subscriptionError && (
          <Alert
            variant="destructive"
            className="border-destructive/40 bg-destructive/5"
          >
            <AlertTitle>Subscription status unavailable</AlertTitle>
            <AlertDescription>{subscriptionError}</AlertDescription>
          </Alert>
        )}
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {t("plans.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("plans.description")}
          </p>
          {demoMode && !authed && (
            <p className="text-xs text-muted-foreground mt-2">
              Demo Mode — sign in to purchase.
            </p>
          )}
        </div>

        {uniqueMissingEnvKeys.length > 0 && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Billing setup incomplete — set {uniqueMissingEnvKeys.join(", ")}{" "}
              to enable Stripe checkout.
            </AlertDescription>
          </Alert>
        )}
        {!BILLING_CONFIGURED && !iosBuild && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Stripe publishable key missing. Set VITE_STRIPE_PUBLISHABLE_KEY to
              allow checkout and subscription management.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {plans
            .filter((plan) => !plan.subscriberOnly || hasSubscription)
            .map((plan) => (
              <Card
                key={plan.name}
                className={plan.popular ? "border-primary shadow-lg" : ""}
              >
                <CardHeader className="relative">
                  {(plan.popular || plan.badge) && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                      {plan.badge || "Most Popular"}
                    </Badge>
                  )}
                  <CardTitle className="flex items-center justify-between">
                    <span>{plan.name}</span>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        {plan.originalPrice && (
                          <span className="text-sm text-muted-foreground line-through">
                            {plan.originalPrice}
                          </span>
                        )}
                        <div className="text-lg font-bold">{plan.price}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {plan.period}
                      </div>
                    </div>
                  </CardTitle>
                  <p className="text-sm text-accent font-medium">
                    {plan.credits}
                  </p>
                  {plan.description && (
                    <p className="text-xs text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Check className="h-4 w-4 text-accent flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.features.some((feature) =>
                    feature.includes("3 scans per month")
                  ) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      *Unused scans roll over for 12 months.*
                    </p>
                  )}
                  <div className="space-y-1">
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                      onClick={() =>
                        plan.mode === "subscription" &&
                        hasSubscription &&
                        subscription?.price === plan.priceId
                          ? handleManageSubscription()
                          : handleCheckout(plan)
                      }
                      disabled={
                        !canBuy ||
                        pendingPlan === plan.plan ||
                        !plan.priceId ||
                        (plan.mode === "subscription" &&
                          hasSubscription &&
                          managingSubscription)
                      }
                    >
                      {pendingPlan === plan.plan ||
                      (plan.mode === "subscription" && managingSubscription) ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {plan.mode === "subscription" && hasSubscription
                            ? "Opening portal…"
                            : "Opening checkout…"}
                        </span>
                      ) : plan.mode === "subscription" &&
                        hasSubscription &&
                        subscription?.price === plan.priceId ? (
                        "Manage subscription"
                      ) : plan.mode === "subscription" && hasSubscription ? (
                        "Change plan"
                      ) : plan.mode === "subscription" ? (
                        t("plans.subscribe")
                      ) : (
                        t("plans.buyNow")
                      )}
                    </Button>
                    {iosBuild && (
                      <p className="text-xs text-muted-foreground text-center">
                        Billing is available on web.
                      </p>
                    )}
                    {!authed && (
                      <>
                        <a
                          className="block text-xs text-center text-primary underline"
                          href={signUpHref}
                        >
                          Sign in to use this feature
                        </a>
                        <p className="text-xs text-muted-foreground text-center">
                          Sign in to complete checkout.
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Savings Comparison Card */}
        <div className="mt-8 p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg">
          <h3 className="text-xl font-bold mb-4 text-center">
            Save Hundreds Every Month
          </h3>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">🥗 Dietitian visits</span>
              <span className="font-semibold">~$300/month</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">💪 Personal trainer</span>
              <span className="font-semibold">~$240/month</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">📊 DEXA scans</span>
              <span className="font-semibold">~$150/scan</span>
            </div>
            <hr className="my-2 border-t" />
            <div className="flex justify-between items-center py-2 text-lg">
              <span className="text-primary font-bold">MyBodyScan</span>
              <div className="text-right">
                <div className="font-bold text-primary">$24.99/month</div>
                <div className="text-xs text-muted-foreground">
                  (first month $14.99)
                </div>
                <div className="text-sm font-semibold text-accent">
                  or $199.99/year
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            All-in-one nutrition coaching, personalized workouts, and progress
            scans — save hundreds every month.
          </p>
        </div>

        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            Questions about pricing? <br />
            <span className="font-medium">
              Contact our support team for help
            </span>
          </p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
