import { HeartPulse, Smartphone, MonitorSmartphone } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { connectMock, syncDayMock } from "@/lib/healthShim";

export default function HealthSync() {
  const handleUnavailable = async (provider?: string) => {
    try {
      // Surface the intentional block so users are not misled by fake data.
      await connectMock((provider as any) || "manual");
    } catch (error: any) {
      toast({
        title: "Health sync coming soon",
        description:
          error?.message ||
          "We don't connect to Apple Health or Google Fit yet.",
        variant: "destructive",
      });
    }
  };

  const handleSync = async () => {
    try {
      await syncDayMock("today");
    } catch (error: any) {
      toast({
        title: "Health sync unavailable",
        description: error?.message || "We'll ship health integrations soon.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Health Connect - MyBodyScan"
        description="Link HealthKit or Health Connect"
      />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <HeartPulse className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Health integrations
          </h1>
          <p className="text-sm text-muted-foreground">
            Pull in steps, calories, and sleep to power Today’s dashboard.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connect a source</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="outline"
              disabled
              onClick={() => handleUnavailable("apple-health")}
              className="flex items-center justify-center gap-2"
            >
              <Smartphone className="h-4 w-4" />
              Connect Apple HealthKit (coming soon)
            </Button>
            <Button
              variant="outline"
              disabled
              onClick={() => handleUnavailable("google-health-connect")}
              className="flex items-center justify-center gap-2"
            >
              <MonitorSmartphone className="h-4 w-4" />
              Connect Health Connect (coming soon)
            </Button>
            <Button
              variant="ghost"
              disabled
              onClick={() => handleUnavailable("manual")}
            >
              Mock web data source (disabled)
            </Button>
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              Health sync is gated until native connectors ship. No data is sent
              to or read from Apple Health or Google Fit yet.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync a day</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={handleSync} variant="default" disabled>
              Sync today (disabled)
            </Button>
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              Real health imports will land once native connectors are wired.
              Nothing is being synced right now.
            </div>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
