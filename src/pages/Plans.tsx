import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { openStripeCheckout } from "@/lib/api";

const PRICE_ONETIME = import.meta.env.VITE_STRIPE_PRICE_ONETIME;
const PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY;
const PRICE_YEARLY = import.meta.env.VITE_STRIPE_PRICE_YEARLY;

const plans = [
  { title: "$9.99 per scan", copy: "Pay-as-you-go", mode: "payment" as const, price: PRICE_ONETIME, note: "Effective price: $9.99/scan" },
  { title: "$14.99 / month", copy: "3 scans/month", mode: "subscription" as const, price: PRICE_MONTHLY, note: "~$4.99 per scan" },
  { title: "$99.99 / year", copy: "Best value", mode: "subscription" as const, price: PRICE_YEARLY, note: "Best yearly value" },
];

const Plans = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      toast({ title: "Payment successful" });
    } else if (params.get("canceled") === "1") {
      toast({ title: "Payment canceled" });
    }
  }, []);

  const checkout = async (price?: string, mode?: "payment" | "subscription") => {
    try {
      if (!price || !mode) {
        toast({ title: "Price not configured" });
        return;
      }
      await openStripeCheckout(price, mode);
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e?.message ?? "Try again." });
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Plans – MyBodyScan" description="Choose pay-as-you-go or subscription to get more scans for less." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Plans</h1>
      <p className="text-sm text-muted-foreground mb-6">No free trial. DEXA scans can cost $50–$150—MyBodyScan is a fraction of that.</p>
      <div className="grid gap-4">
        {plans.map((p) => (
          <Card key={p.title} className="shadow-md">
            <CardHeader>
              <CardTitle>{p.title}</CardTitle>
              <CardDescription>{p.copy}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <span className="text-sm text-muted-foreground">{p.note}</span>
              <Button onClick={() => checkout(p.price, p.mode)}>Checkout</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
};

export default Plans;
