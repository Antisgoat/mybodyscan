import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";

export default function CheckoutCanceled() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate("/scan/new"), 4000);
    return () => clearTimeout(t);
  }, [navigate]);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Seo title="Checkout Canceled – MyBodyScan" description="Your payment was canceled. You can try again anytime." />
      <h1 className="text-2xl font-semibold mb-2">Payment canceled</h1>
      <p className="text-muted-foreground mb-6">No charge was made. You’ll be redirected shortly. You can also jump back now.</p>
      <div className="flex gap-2">
        <Button onClick={() => navigate(auth.currentUser ? "/scan/new" : "/auth")}>Return to App</Button>
      </div>
    </main>
  );
}
