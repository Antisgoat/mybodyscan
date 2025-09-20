import { useState } from "react";
import { HeartPulse, Smartphone, MonitorSmartphone } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { connectMock, syncDayMock, type MockHealthConnection, type MockSyncResult } from "@/lib/healthShim";
import { toast } from "@/hooks/use-toast";

export default function HealthSync() {
  const [connection, setConnection] = useState<MockHealthConnection | null>(null);
  const [sync, setSync] = useState<MockSyncResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = async (provider: MockHealthConnection['provider']) => {
    setLoading(true);
    try {
      const response = await connectMock(provider);
      setConnection(response);
      toast({ title: "Connected", description: `${provider} linked for demo data.` });
    } catch (error: any) {
      toast({ title: "Connection failed", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (day: 'today' | 'yesterday') => {
    try {
      const result = await syncDayMock(day);
      setSync(result);
      toast({ title: `Synced ${day}`, description: `${result.steps} steps imported.` });
    } catch (error: any) {
      toast({ title: "Sync failed", description: error?.message || "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Health Connect - MyBodyScan" description="Link HealthKit or Health Connect" />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <HeartPulse className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Health integrations</h1>
          <p className="text-sm text-muted-foreground">Pull in steps, calories, and sleep to power Today’s dashboard.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connect a source</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => handleConnect('apple-health')}
              className="flex items-center justify-center gap-2"
            >
              <Smartphone className="h-4 w-4" />
              Connect Apple HealthKit
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => handleConnect('google-health-connect')}
              className="flex items-center justify-center gap-2"
            >
              <MonitorSmartphone className="h-4 w-4" />
              Connect Health Connect
            </Button>
            <Button variant="ghost" disabled={loading} onClick={() => handleConnect('manual')}>
              Mock web data source
            </Button>
            {connection && (
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Connected to {connection.provider} · {new Date(connection.connectedAt).toLocaleTimeString()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync a day</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => handleSync('today')} variant="default">
              Sync today
            </Button>
            <Button onClick={() => handleSync('yesterday')} variant="outline">
              Sync yesterday
            </Button>
            {sync && (
              <div className="grid grid-cols-3 gap-3 rounded-md border border-border p-3 text-center text-xs">
                <div>
                  <div className="text-muted-foreground">Steps</div>
                  <div className="text-lg font-semibold">{sync.steps}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Active kcal</div>
                  <div className="text-lg font-semibold">{sync.activeCalories}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Sleep</div>
                  <div className="text-lg font-semibold">{sync.sleepHours}h</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
