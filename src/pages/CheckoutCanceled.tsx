import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";
import TestModeWrapper from "@/components/TestModeWrapper";

export default function CheckoutCanceled() {
  const navigate = useNavigate();
  
  useEffect(() => {
    const t = setTimeout(() => navigate("/plans"), 4000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <TestModeWrapper>
      <main className="min-h-screen p-6 max-w-md mx-auto flex items-center justify-center">
        <Seo title="Checkout Canceled - MyBodyScan" description="Payment was canceled" />
        
        <Card className="w-full text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-orange-600" />
            </div>
            <CardTitle>Checkout Canceled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              No payment was made. You can try again when you're ready.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate("/plans")} className="w-full">
                View Plans
              </Button>
              <Button onClick={() => navigate(auth.currentUser ? "/home" : "/auth")} variant="outline" className="w-full">
                Return to App
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </TestModeWrapper>
  );
}