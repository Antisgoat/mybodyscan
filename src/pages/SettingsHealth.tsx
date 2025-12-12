import { HeartPulse, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SettingsHealth = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Health data</h1>
        <p className="text-muted-foreground">
          Health sync is coming soon. Until native connectors ship, we do not
          read or write any data from Apple Health or Google Fit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Health integrations are disabled
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            We are intentionally holding back health imports until the native
            connectors are ready and privacy reviews are complete. You may see
            banners elsewhere noting that health data is unavailable—this is
            expected.
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
            <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">
                Privacy-first stance
              </p>
              <p>
                We will only request health permissions once the connectors are
                live and audited. No data is pulled from your device today.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-dashed p-3 text-xs">
            Coming soon: step counts, active energy, and resting heart rate
            summaries routed into your Today dashboard.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsHealth;
