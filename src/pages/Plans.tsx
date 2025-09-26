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
      name: "Single Scan",
      price: "$9.99",
      period: "one-time",
      credits: "1 scan credit",
      priceId: "price_single_scan",
      mode: "payment" as const,
      features: ["1 body composition scan", "Detailed analysis", "Progress tracking"],
      description: "Perfect for trying out MyBodyScan"
    },
    {
      name: "Extra Scan", 
      price: "$9.99",
      period: "one-time",
      credits: "1 scan credit",
      priceId: "price_extra_scan",
      mode: "payment" as const,
      features: ["Additional scan credit", "For existing subscribers", "Same detailed analysis"],
      description: "For subscribers who need extra scans",
      subscriberOnly: true
    },
    {
      name: "Monthly",
      price: "$14.99",
      originalPrice: "$24.99",
      period: "first month, then $24.99/mo",
      credits: "Unlimited scans + Coach + Nutrition",
      priceId: "price_monthly_intro",
      mode: "subscription" as const,
      features: ["3 scans per month", "AI Coach & workout plans", "Nutrition tracking & advice", "Progress analytics", "Priority support"]
    },
    {
      name: "Annual",
      price: "$199.99",
      period: "per year",
      credits: "Everything included",
      priceId: "price_annual",
      mode: "subscription" as const,
      popular: true,
      features: ["All Monthly features", "Save $99.89 vs monthly", "Advanced analytics", "Export data", "Early access to new features"],
      badge: "Best Value"
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
            <hr className="border-border my-2" />
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
