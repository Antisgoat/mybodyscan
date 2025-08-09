import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { openStripeCheckout } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

const PRICE_ONETIME = import.meta.env.VITE_STRIPE_PRICE_ONETIME as string | undefined;
const PRICE_PACK3 = import.meta.env.VITE_STRIPE_PRICE_PACK3 as string | undefined;
const PRICE_PACK5 = import.meta.env.VITE_STRIPE_PRICE_PACK5 as string | undefined;
const PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY as string | undefined;
const PRICE_YEARLY = import.meta.env.VITE_STRIPE_PRICE_YEARLY as string | undefined;

const Plans = () => {
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      setBanner("Checkout successful");
      try { toast({ title: "Checkout successful" }); } catch {}
    } else if (params.get("canceled") === "1") {
      setBanner("Checkout canceled");
      try { toast({ title: "Checkout canceled" }); } catch {}
    }
  }, []);

  const checkout = async (priceId?: string, mode?: "payment" | "subscription") => {
    try {
      if (!priceId || !mode) {
        setBanner("Price not configured");
        try { toast({ title: "Price not configured" }); } catch {}
        return;
      }
      await openStripeCheckout(priceId, mode);
    } catch (e: any) {
      const msg = e?.message ?? "Checkout failed";
      setBanner(msg);
      try { toast({ title: "Checkout failed", description: msg }); } catch {}
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Plans – MyBodyScan" description="Choose pay-as-you-go or subscription to get more scans for less." canonical={window.location.href} />
      {banner && (
        <div className="mb-4 rounded-md bg-secondary text-secondary-foreground px-3 py-2 text-sm">{banner}</div>
      )}
      <h1 className="text-2xl font-semibold mb-4">Plans</h1>
      <p className="text-sm text-muted-foreground mb-6">No free trial. DEXA scans can cost $50–$150—MyBodyScan is a fraction of that.</p>

      {/* Pay-as-you-go Packs */}
      <section className="space-y-3 mb-8">
        <h2 className="text-lg font-semibold">Pay-as-you-go Packs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1 Scan */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>1 Scan — $9.99</CardTitle>
              <CardDescription>Great for first try</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => checkout(PRICE_ONETIME, "payment")} disabled={!PRICE_ONETIME}>Buy</Button>
              {!PRICE_ONETIME && (<span className="text-xs text-muted-foreground">Price not configured</span>)}
            </CardContent>
          </Card>
          {/* 3 Scans */}
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>3 Scans — $19.99 (Save 33%)</CardTitle>
                <Badge variant="secondary">Popular</Badge>
              </div>
              <CardDescription>Use anytime</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => checkout(PRICE_PACK3, "payment")} disabled={!PRICE_PACK3}>Buy</Button>
              {!PRICE_PACK3 && (<span className="text-xs text-muted-foreground">Price not configured</span>)}
            </CardContent>
          </Card>
          {/* 5 Scans */}
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>5 Scans — $29.99 (Best pack)</CardTitle>
                <Badge>Best Value</Badge>
              </div>
              <CardDescription>Lowest price per scan</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => checkout(PRICE_PACK5, "payment")} disabled={!PRICE_PACK5}>Buy</Button>
              {!PRICE_PACK5 && (<span className="text-xs text-muted-foreground">Price not configured</span>)}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Subscriptions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Subscriptions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Monthly */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Monthly — $14.99 / mo (3 scans/month)</CardTitle>
              <CardDescription>Auto-renews. Cancel anytime.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => checkout(PRICE_MONTHLY, "subscription")} disabled={!PRICE_MONTHLY}>Subscribe</Button>
              {!PRICE_MONTHLY && (<span className="text-xs text-muted-foreground">Price not configured</span>)}
            </CardContent>
          </Card>
          {/* Annual */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Annual — $99.99 / yr</CardTitle>
              <CardDescription>Best long-term value</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => checkout(PRICE_YEARLY, "subscription")} disabled={!PRICE_YEARLY}>Subscribe</Button>
              {!PRICE_YEARLY && (<span className="text-xs text-muted-foreground">Price not configured</span>)}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Plans;
