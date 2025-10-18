import { useState } from "react";
import { format, subDays } from "date-fns";
import { Button } from "@app/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card.tsx";
import { Badge } from "@app/components/ui/badge.tsx";
import { useHealthDaily } from "@app/hooks/useHealthDaily.ts";
import { useToast } from "@app/hooks/use-toast.ts";
import type { DailySummary } from "@app/integrations/health/HealthAdapter.ts";
import { Smartphone, Activity, Heart, Footprints, Shield } from "lucide-react";

const SettingsHealth = () => {
  const { platform, connect, syncDay } = useHealthDaily();
  const [last, setLast] = useState<(DailySummary & { date: string }) | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const success = await connect();
      if (success) {
        toast({
          title: "Connected successfully",
          description: `Health data connection established with ${platform === "ios" ? "Apple Health" : "Google Fit"}`,
        });
      } else {
        toast({
          title: "Connection failed", 
          description: "Please ensure you have the health app installed and try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    }
    setIsConnecting(false);
  }

  async function sync(offset: number) {
    const date = format(subDays(new Date(), offset), "yyyy-MM-dd");
    try {
      const s = await syncDay(date);
      setLast({ date, ...s });
      toast({
        title: "Sync complete",
        description: `Imported data for ${date}`,
      });
    } catch (error) {
      toast({
        title: "Sync failed",
        description: "Could not sync health data. Please try again.",
        variant: "destructive"
      });
    }
  }

  const getPlatformInfo = () => {
    if (platform === "ios") {
      return {
        name: "Apple Health",
        icon: <Smartphone className="h-5 w-5" />,
        description: "Connect with Apple HealthKit to automatically import your activity data.",
        features: ["Active Energy (calories burned)", "Steps", "Resting Heart Rate"]
      };
    }
    if (platform === "android") {
      return {
        name: "Google Fit",
        icon: <Activity className="h-5 w-5" />,
        description: "Connect with Google Fit to automatically import your fitness data.",
        features: ["Active Energy (calories burned)", "Steps", "Heart Rate"]
      };
    }
    return {
      name: "Health Integration",
      icon: <Heart className="h-5 w-5" />,
      description: "Health data sync is available on mobile devices.",
      features: ["Install our mobile app to connect with health platforms"]
    };
  };

  const platformInfo = getPlatformInfo();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Health Integration</h1>
        <p className="text-muted-foreground">
          Sync your activity data to enhance your nutrition tracking
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {platformInfo.icon}
            {platformInfo.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {platformInfo.description}
          </p>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">What we import:</h4>
            <div className="flex flex-wrap gap-2">
              {platformInfo.features.map((feature, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">Privacy first</p>
              <p>Your health data stays on your device. We only access what you explicitly authorize.</p>
            </div>
          </div>

          {platform !== "web" ? (
            <Button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? "Connecting..." : `Connect ${platformInfo.name}`}
            </Button>
          ) : (
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <Smartphone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Mobile Required</p>
              <p className="text-xs text-muted-foreground">
                Install our mobile app to connect with health platforms
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {platform !== "web" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Footprints className="h-5 w-5" />
              Manual Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Manually sync your latest health data when needed.
            </p>
            
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => sync(1)} className="flex-1">
                Sync Yesterday
              </Button>
              <Button variant="secondary" onClick={() => sync(0)} className="flex-1">
                Sync Today
              </Button>
            </div>

            {last && (
              <div className="p-3 bg-primary/5 rounded-lg">
                <div className="text-sm">
                  <div className="font-medium">Last sync: {format(new Date(last.date), "MMM dd, yyyy")}</div>
                  <div className="text-muted-foreground">
                    {last.activeEnergyKcal ? `${last.activeEnergyKcal} kcal burned` : "No activity data"}
                    {last.steps && ` • ${last.steps} steps`}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SettingsHealth;

