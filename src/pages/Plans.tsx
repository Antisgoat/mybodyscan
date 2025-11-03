import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { useAuthUser } from "@/lib/auth";
import { useDemoMode } from "@/components/DemoModeProvider";
import { apiFetch } from "@/lib/apiFetch";
import { useCredits } from "@/hooks/useCredits";

const STRIPE_PUBLISHABLE_KEY = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
const PRICE_ID_ONE = (import.meta.env.VITE_PRICE_ONE ?? "").trim();
const PRICE_ID_MONTHLY = (import.meta.env.VITE_PRICE_MONTHLY ?? "").trim();
const PRICE_ID_YEARLY = (import.meta.env.VITE_PRICE_YEARLY ?? "").trim();
const PRICE_ID_EXTRA = (import.meta.env.VITE_PRICE_EXTRA ?? "").trim();

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
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const demoMode = useDemoMode();
  const { refresh: refreshCredits } = useCredits();
  const [refreshingCredits, setRefreshingCredits] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const stripePromise = useMemo(
    () => (STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null),
    [STRIPE_PUBLISHABLE_KEY],
  );
  const success = searchParams.get("success") === "1";
  const canceled = searchParams.get("canceled") === "1";
  const canBuy = Boolean(user) && !demoMode;
  const signUpHref = "/auth?next=/plans";

  const dismissCheckoutState = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("success");
    next.delete("canceled");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleRefreshCredits = async () => {
    if (!user) return;
    setRefreshingCredits(true);
    try {
      try {
        await apiFetch("/system/bootstrap", { method: "POST", body: JSON.stringify({}) });
        await user.getIdToken(true).catch(() => undefined);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("plans_refresh_credits_failed", error);
        }
      }
      refreshCredits();
    } finally {
      dismissCheckoutState();
      setRefreshingCredits(false);
    }
  };

  const handleRetryCheckout = () => {
    dismissCheckoutState();
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  const handleCheckout = async (plan: PlanConfig) => {
    if (!user) {
      window.location.assign("/auth?next=/plans");
      return;
    }
    if (demoMode) {
      toast({
        title: "Demo is read-only",
        description: "Sign up to purchase a plan.",
      });
      return;
    }
    if (!plan.priceId) {
      const description = plan.envKey
        ? `This plan is not configured yet. Set ${plan.envKey} before enabling checkout.`
        : "This plan is not configured yet.";
      toast({
        title: "Plan unavailable",
        description,
        variant: "destructive",
      });
      return;
    }

    if (!STRIPE_PUBLISHABLE_KEY) {
      toast({
        title: "Checkout unavailable",
        description: "Stripe key missing. Contact support.",
        variant: "destructive",
      });
      return;
    }

    setPendingPlan(plan.plan);
    try {
      track("checkout_start", { plan: plan.plan, priceId: plan.priceId });
      const stripe = stripePromise ? await stripePromise : null;
      if (!stripe) {
        throw new Error("Stripe unavailable");
      }
      const payload = await apiFetch("/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ priceId: plan.priceId, mode: plan.mode }),
      });

      const sessionId = typeof (payload as any)?.sessionId === "string" ? (payload as any).sessionId : null;
      if (!sessionId) {
        console.error("checkout_session_invalid", payload);
        throw new Error("Invalid checkout session response");
      }

      const result = await stripe.redirectToCheckout({ sessionId });
      if (result.error) {
        throw new Error(result.error.message || "Stripe redirect failed");
      }
    } catch (err: any) {
      console.error("checkout_error", err);
      const description = typeof err?.message === "string" && err.message.length
        ? err.message
        : "We couldn't open checkout. Please try again.";
      toast({
        title: "Checkout unavailable",
        description,
        variant: "destructive",
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
      envKey: "VITE_PRICE_ONE",
      mode: "payment" as const,
      features: ["1 body composition scan", "Detailed analysis", "Progress tracking"],
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
      features: ["Additional scan credit", "For existing subscribers", "Same detailed analysis"],
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

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <main className="max-w-md mx-auto p-6 space-y-6">
        <Seo title="Plans - MyBodyScan" description="Choose your scanning plan" />
        {canceled && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <AlertTitle>Checkout canceled</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>We didn't charge your card. Start checkout again when you're ready.</span>
              <Button type="button" size="sm" variant="outline" onClick={handleRetryCheckout}>
                Try checkout again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-primary/40 bg-primary/5">
            <AlertTitle>Payment received</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Credits will appear shortly after processing. Refresh once webhook processing completes.</span>
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
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">{t('plans.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('plans.description')}</p>
          {demoMode && (
            <p className="text-xs text-muted-foreground mt-2">
              Demo Mode — sign in to purchase.
            </p>
          )}
        </div>
        
        {uniqueMissingEnvKeys.length > 0 && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Billing setup incomplete — set {uniqueMissingEnvKeys.join(", ")} to enable Stripe checkout.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {plans.filter(plan => !plan.subscriberOnly || false).map((plan) => ( // TODO: Check subscription status
            <Card key={plan.name} className={plan.popular ? "border-primary shadow-lg" : ""}>
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
                        <span className="text-sm text-muted-foreground line-through">{plan.originalPrice}</span>
                      )}
                      <div className="text-lg font-bold">{plan.price}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{plan.period}</div>
                  </div>
                </CardTitle>
                <p className="text-sm text-accent font-medium">{plan.credits}</p>
                {plan.description && (
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-accent flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.features.some((feature) => feature.includes("3 scans per month")) && (
                  <p className="text-xs text-muted-foreground mt-2">*Unused scans roll over for 12 months.*</p>
                )}
                <div className="space-y-1">
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleCheckout(plan)}
                    disabled={pendingPlan === plan.plan || !canBuy || !plan.priceId || !STRIPE_PUBLISHABLE_KEY}
                  >
                    {pendingPlan === plan.plan ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening checkout…
                      </span>
                    ) : plan.mode === "subscription" ? (
                      t('plans.subscribe')
                    ) : (
                      t('plans.buyNow')
                    )}
                  </Button>
                  {demoMode && (
                    <a
                      className="block text-xs text-center text-primary underline"
                      href={signUpHref}
                    >
                      Sign up to use this feature
                    </a>
                  )}
                  {!user && !demoMode && (
                    <p className="text-xs text-muted-foreground text-center">Sign in to complete checkout.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Savings Comparison Card */}
        <div className="mt-8 p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg">
          <h3 className="text-xl font-bold mb-4 text-center">Save Hundreds Every Month</h3>
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
                <div className="text-xs text-muted-foreground">(first month $14.99)</div>
                <div className="text-sm font-semibold text-accent">or $199.99/year</div>
              </div>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            All-in-one nutrition coaching, personalized workouts, and progress scans — save hundreds every month.
          </p>
        </div>

        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            Questions about pricing? <br />
            <span className="font-medium">Contact our support team for help</span>
          </p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
