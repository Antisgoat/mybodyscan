import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate("/scan/new"), 4000);
    return () => clearTimeout(t);
  }, [navigate]);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Seo title="Checkout Success – MyBodyScan" description="Your payment succeeded. Redirecting you back to the app." />
      <h1 className="text-2xl font-semibold mb-2">Payment successful</h1>
      <p className="text-muted-foreground mb-6">Thanks! You’ll be redirected shortly. You can also jump back now.</p>
      <div className="flex gap-2">
        <Button onClick={() => navigate(auth.currentUser ? "/scan/new" : "/auth")}>Return to App</Button>
      </div>
    </main>
  );
}
