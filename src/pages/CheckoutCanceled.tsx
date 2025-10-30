import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth as firebaseAuth } from "@/lib/firebase";
import { useBackNavigationGuard } from "@/lib/back";

export default function CheckoutCanceled() {
  const navigate = useNavigate();
  useBackNavigationGuard(() => true, {
    message: "Going back may cancel the current action. Continue?",
  });
  useEffect(() => {
    const t = setTimeout(() => navigate("/scan/new"), 4000);
    return () => clearTimeout(t);
  }, [navigate]);
  const handleReturn = () => {
    navigate(firebaseAuth.currentUser ? "/scan/new" : "/auth");
  };

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Seo title="Checkout Canceled – MyBodyScan" description="Your payment was canceled. You can try again anytime." />
      <h1 className="text-2xl font-semibold mb-2">Payment canceled</h1>
      <p className="text-muted-foreground mb-6">No charge was made. You’ll be redirected shortly. You can also jump back now.</p>
      <div className="flex gap-2">
        <Button onClick={handleReturn}>Return to App</Button>
      </div>
    </main>
  );
}
