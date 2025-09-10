import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { startCheckout } from "@/lib/payments";
import { toast } from "@/hooks/use-toast";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { track } from "@/lib/analytics";
import { isDemoGuest } from "@/lib/demoFlag";

const PLAN_FEATURES = {
  starter: ["1 scan", "Smart calorie target", "Basic guidance"],
  pro: [
    "3 scans per month",
    "Trend analysis",
    "Custom coaching tips",
    "Priority support"
  ],
  elite: [
    "36 scans per year",
    "Trend analysis",
    "Custom coaching tips",
    "Priority support",
    "Annual savings"
  ]
} as const;

export default function Plans() {
  const { t } = useI18n();
  const handleCheckout = async (priceId: string, mode: "payment" | "subscription") => {
    try {
      track("checkout_start", { plan: priceId });
      await startCheckout(priceId, mode);
    } catch (err: any) {
      if (err?.message?.includes("Backend URL not configured")) {
        toast({
          title: "Service unavailable",
          description: "Payments are not available in development mode.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: err?.message || "Failed to start checkout",
          variant: "destructive"
        });
      }
    }
  };

  const plans = [
    {
      name: "Starter Scan",
      price: "$9.99",
      period: "one-time",
      credits: "1 credit",
      priceId: "price_1RuOpKQQU5vuhlNjipfFBsR0",
      mode: "payment" as const,
      features: PLAN_FEATURES.starter
    },
    {
      name: "Pro",
      price: "$24.99",
      period: "per month",
      credits: "3 credits/mo",
      priceId: "price_1S4XsVQQU5vuhlNjzdQzeySA",
      mode: "subscription" as const,
      features: PLAN_FEATURES.pro
    },
    {
      name: "Elite",
      price: "$199",
      period: "per year",
      credits: "36 credits/yr",
      priceId: "price_1S4Y6YQQU5vuhlNjeJFmshxX",
      mode: "subscription" as const,
      popular: true,
      features: PLAN_FEATURES.elite
    }
  ];

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <Seo title="Plans - MyBodyScan" description="Choose your scanning plan" />
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-2">{t('plans.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('plans.description')}</p>
          {isDemoGuest() && (
            <p className="text-xs text-muted-foreground mt-2">
              Demo mode — purchase requires sign-up.
            </p>
          )}
        </div>
        
        <div className="space-y-4">
          {plans.map((plan) => (
            <Card key={plan.name} className={plan.popular ? "border-primary shadow-lg" : ""}>
              <CardHeader className="relative">
                {plan.popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    Most Popular
                  </Badge>
                )}
                <CardTitle className="flex items-center justify-between">
                  <span>{plan.name}</span>
                  <div className="text-right">
                    <div className="text-lg font-bold">{plan.price}</div>
                    <div className="text-xs text-muted-foreground">{plan.period}</div>
                  </div>
                </CardTitle>
                <p className="text-sm text-accent font-medium">{plan.credits}</p>
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
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleCheckout(plan.priceId, plan.mode)}
                >
                  {plan.mode === "subscription" ? t('plans.subscribe') : t('plans.buyNow')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            Need more scans? <br />
            <span className="font-medium">Extra scans available for $9.99 each</span>
          </p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
