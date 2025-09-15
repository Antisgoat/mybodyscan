import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { startCheckout } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "@/hooks/useTranslation";

const Plans = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [banner, setBanner] = useState<string | null>(null);

  const handleCheckout = async (
    plan: "STARTER_SCAN"|"EXTRA_SCAN"|"PRO_MONTHLY"|"ELITE_ANNUAL",
    el: HTMLButtonElement
  ) => {
    try {
      el.disabled = true;
      const user = auth.currentUser;
      if (!user) {
        el.disabled = false;
        navigate("/auth", { state: { from: window.location.pathname } });
        return;
      }
      // Mock API call - replace with createCheckout({ plan, uid })
      const mockCheckout = async (planId: string) => {
        console.log(`Would create checkout for plan: ${planId}`);
        toast({ title: "Checkout would open", description: `Plan: ${planId}` });
      };
      
      await mockCheckout(plan);
    } catch (err: any) {
      try { toast({ title: "Checkout failed", description: (err as any)?.message || "" }); } catch {}
      if ((err as any)?.code === "functions/unauthenticated" || /unauth/i.test(String((err as any)?.message ?? ""))) {
        navigate("/auth", { state: { from: window.location.pathname } });
      } else {
        if (!(window as any).toast) {
          alert((err as any)?.message || "Checkout failed");
        }
      }
      el.disabled = false;
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Plans – MyBodyScan" description="Choose pay-as-you-go or subscription to get more scans for less." canonical={window.location.href} />
      {banner && (
        <div className="mb-4 rounded-md bg-secondary text-secondary-foreground px-3 py-2 text-sm">{banner}</div>
      )}
      <h1 className="text-2xl font-semibold mb-4">{t("plans.title")}</h1>
      
      {/* Savings card */}
      <Card className="mb-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="text-sm">
            <div className="font-semibold mb-2">Save hundreds monthly:</div>
            <div>• Dietitian: ~$300/mo</div>
            <div>• Personal Trainer: ~$240/mo</div>
            <div>• DEXA scan: ~$150/scan</div>
            <div className="mt-2 font-medium text-primary">
              MyBodyScan: {t("plans.monthly")} $24.99/mo (first month $14.99) or {t("plans.annual")} $199.99/yr
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Single Purchases */}
      <section className="space-y-3 mb-8">
        <h2 className="text-lg font-semibold">Single Scans</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>{t("plans.single")} — $9.99</CardTitle>
              <CardDescription>Perfect for trying MyBodyScan</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={(e) => handleCheckout("STARTER_SCAN", e.currentTarget as HTMLButtonElement)}>Buy</Button>
            </CardContent>
          </Card>
          
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>{t("plans.extra")} — $9.99</CardTitle>
              <CardDescription>Top-up scan for subscribers</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={(e) => handleCheckout("EXTRA_SCAN", e.currentTarget as HTMLButtonElement)}>Buy</Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Subscriptions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Subscriptions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>{t("plans.monthly")} — $14.99 first month, then $24.99/mo</CardTitle>
              <CardDescription>3 scans per month + full AI coaching</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={(e) => handleCheckout("PRO_MONTHLY", e.currentTarget as HTMLButtonElement)}>Subscribe</Button>
            </CardContent>
          </Card>
          
          <Card className="shadow-md border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("plans.annual")} — $199/yr</CardTitle>
                <Badge>{t("plans.bestvalue")}</Badge>
              </div>
              <CardDescription>Everything included + significant savings</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={(e) => handleCheckout("ELITE_ANNUAL", e.currentTarget as HTMLButtonElement)}>Subscribe</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Plans;
