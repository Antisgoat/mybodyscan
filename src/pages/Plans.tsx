import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { auth } from "@/firebaseConfig";
import { Badge } from "@/components/ui/badge";

const Plans = () => {
  const navigate = useNavigate();
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

  const CF_BASE = "https://us-central1-mybodyscan-f3daf.cloudfunctions.net";
  const handleCheckout = async (
    plan: "annual"|"monthly"|"pack5"|"pack3"|"single",
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
      const t = await user.getIdToken();
      const r = await fetch(`${CF_BASE}/createCheckoutSession`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ data: { plan } }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `Checkout failed (${r.status})`);
      }
      const json: any = await r.json();
      const url: string | undefined = json?.url || json?.result?.url || json?.data?.url;
      if (!url) throw new Error("No checkout URL returned");
      window.location.assign(url);
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
              <Button onClick={(e) => handleCheckout("single", e.currentTarget as HTMLButtonElement)}>Buy</Button>
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
              <Button onClick={(e) => handleCheckout("pack3", e.currentTarget as HTMLButtonElement)}>Buy</Button>
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
              <Button onClick={(e) => handleCheckout("pack5", e.currentTarget as HTMLButtonElement)}>Buy</Button>
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
              <Button onClick={(e) => handleCheckout("monthly", e.currentTarget as HTMLButtonElement)}>Subscribe</Button>
            </CardContent>
          </Card>
          {/* Annual */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Annual — $99.99 / yr</CardTitle>
              <CardDescription>Best long-term value</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={(e) => handleCheckout("annual", e.currentTarget as HTMLButtonElement)}>Subscribe</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Plans;
