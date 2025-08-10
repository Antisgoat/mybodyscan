import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { openStripeCheckoutByProduct, openStripePortal } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

// Stripe product IDs (safe to expose; prices resolved server-side)
const PROD_SINGLE = "prod_Sq4zdmFOJQRnx9";
const PROD_PACK3 = "prod_Sq518jyDt1x0Dy";
const PROD_PACK5 = "prod_Sq51gLOTQn5sIP";
const PROD_MONTHLY = "prod_Sq5377Wo0TnB8n";
const PROD_ANNUAL = "prod_Sq56NGBUDUMhGD";

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

  const checkout = async (productId: string) => {
    try {
      await openStripeCheckoutByProduct(productId);
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
              <Button onClick={() => checkout(PROD_SINGLE)}>Buy</Button>
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
              <Button onClick={() => checkout(PROD_PACK3)}>Buy</Button>
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
              <Button onClick={() => checkout(PROD_PACK5)}>Buy</Button>
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
              <Button onClick={() => checkout(PROD_MONTHLY)}>Subscribe</Button>
            </CardContent>
          </Card>
          {/* Annual */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Annual — $99.99 / yr</CardTitle>
              <CardDescription>Best long-term value</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => checkout(PROD_ANNUAL)}>Subscribe</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Plans;
