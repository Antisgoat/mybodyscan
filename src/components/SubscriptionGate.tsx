import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SubscriptionGateProps {
  children: ReactNode;
  feature: string;
}

export default function SubscriptionGate({ children, feature }: SubscriptionGateProps) {
  const { subscription, loading } = useSubscription();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!subscription || subscription.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Subscription Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Access to {feature} requires an active subscription. 
              Choose from our Pro or Elite plans to unlock advanced features.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => navigate("/plans")} className="flex-1">
                View Plans
              </Button>
              <Button variant="outline" onClick={() => navigate("/home")} className="flex-1">
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}