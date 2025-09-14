import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import TestModeWrapper from "@/components/TestModeWrapper";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { createCheckout } from "@/lib/api";
import { doc, getDoc } from "firebase/firestore";

const Plans = () => {
  const navigate = useNavigate();
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      setBanner("Payment received — updating your account…");
      toast({ title: "Payment received — updating your account…" });
      
      // Poll for updates for up to 10 seconds
      const pollForUpdates = async () => {
        const user = auth.currentUser;
        if (!user) return;
        
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkUpdates = async () => {
          try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            // Force a small delay to allow backend processing
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkUpdates, 1000);
            }
          } catch (error) {
            console.error("Error polling for updates:", error);
          }
        };
        
        setTimeout(checkUpdates, 1000);
      };
      
      pollForUpdates();
    } else if (params.get("canceled") === "1") {
      setBanner("Checkout canceled");
      toast({ title: "Checkout canceled" });
    }
  }, []);

  const handleCheckout = async (
    plan: string,
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
      await createCheckout(plan);
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
    <TestModeWrapper>
      <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Plans – MyBodyScan" description="Professional body analysis made affordable." canonical={window.location.href} />
      {banner && (
        <div className="mb-4 rounded-md bg-secondary text-secondary-foreground px-3 py-2 text-sm">{banner}</div>
      )}
      <h1 className="text-2xl font-semibold mb-4">Plans</h1>
      <p className="text-sm text-muted-foreground mb-6">Professional body analysis made affordable.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Starter Scan */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Starter Scan — $9.99</CardTitle>
            <CardDescription>Perfect for your first analysis</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={(e) => handleCheckout("STARTER_SCAN", e.currentTarget as HTMLButtonElement)}>Buy Now</Button>
          </CardContent>
        </Card>
        
        {/* Pro Monthly */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Pro Plan (Monthly)</CardTitle>
            <CardDescription>$14.99 first month, then $24.99/mo, 3 scans/mo</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={(e) => handleCheckout("PRO_MONTHLY", e.currentTarget as HTMLButtonElement)}>Subscribe</Button>
          </CardContent>
        </Card>
        
        {/* Elite Annual */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Elite Plan (Annual) — $199/yr</CardTitle>
            <CardDescription>Best value for serious tracking</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={(e) => handleCheckout("ELITE_ANNUAL", e.currentTarget as HTMLButtonElement)}>Subscribe</Button>
          </CardContent>
        </Card>
        
        {/* Extra Scan */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Extra Scan — $9.99</CardTitle>
            <CardDescription>Additional scan credit</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={(e) => handleCheckout("EXTRA_SCAN", e.currentTarget as HTMLButtonElement)}>Buy Now</Button>
          </CardContent>
        </Card>
      </div>
    </main>
    </TestModeWrapper>
  );
};

export default Plans;