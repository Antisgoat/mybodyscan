import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import TestModeWrapper from "@/components/TestModeWrapper";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  
  useEffect(() => {
    toast({ 
      title: "Payment successful!", 
      description: "Your credits will be updated shortly." 
    });
    const t = setTimeout(() => navigate("/plans"), 4000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <TestModeWrapper>
      <main className="min-h-screen p-6 max-w-md mx-auto flex items-center justify-center">
        <Seo title="Payment Successful - MyBodyScan" description="Payment completed successfully" />
        
        <Card className="w-full text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Payment Successful!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Thank you for your purchase. Your credits will be updated within a few minutes.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate(auth.currentUser ? "/home" : "/auth")} className="w-full">
                Return to App
              </Button>
              <Button onClick={() => navigate("/capture/photos")} variant="outline" className="w-full">
                Start a Scan
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </TestModeWrapper>
  );
}