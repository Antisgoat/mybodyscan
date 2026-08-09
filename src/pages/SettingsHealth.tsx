import { HeartPulse, Shield, Smartphone, Watch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SettingsHealth = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Health data</h1>
        <p className="text-muted-foreground">
          Bring recovery and activity context into MyBodyScan without turning
          your health data into another feed to manage.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" /> Health integrations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <div className="flex min-w-0 items-start gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Apple Health</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Planned primary iPhone health source for activity, heart-rate,
                  sleep, and recovery context when supported by the device.
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">
              Priority
            </Badge>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <div className="flex min-w-0 items-start gap-3">
              <Watch className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">WHOOP</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Direct recovery integration is prepared as a separate source.
                  Connection stays disabled until approved OAuth credentials are
                  configured and the privacy review is complete.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">
              Planned
            </Badge>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <div className="flex min-w-0 items-start gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Health Connect</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Planned Android health source for compatible activity and
                  wellness data.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">
              Planned
            </Badge>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Privacy first</p>
              <p>
                No health provider is connected by this screen today. MyBodyScan
                will request only the permissions needed for features the user
                chooses to enable, and a provider will never be shown as
                connected until authorization succeeds.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsHealth;
