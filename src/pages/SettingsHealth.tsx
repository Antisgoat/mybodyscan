import { useCallback, useEffect, useState } from "react";
import {
  HeartPulse,
  Loader2,
  RefreshCw,
  Shield,
  Smartphone,
  Unplug,
  Watch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disconnectWhoop,
  getWhoopStatus,
  startWhoopConnection,
  syncWhoopRecovery,
  type WhoopConnectionStatus,
  type WhoopRecovery,
} from "@/lib/health/whoop";
import { openExternalUrl } from "@/lib/platform";

const SettingsHealth = () => {
  const [whoop, setWhoop] = useState<WhoopConnectionStatus | null>(null);
  const [whoopBusy, setWhoopBusy] = useState(false);
  const [whoopError, setWhoopError] = useState<string | null>(null);
  const [latestRecovery, setLatestRecovery] = useState<WhoopRecovery | null>(
    null
  );

  const refreshWhoop = useCallback(async () => {
    try {
      const next = await getWhoopStatus();
      setWhoop(next);
      setWhoopError(null);
    } catch {
      setWhoopError("WHOOP status could not be loaded. Try again shortly.");
    }
  }, []);

  useEffect(() => {
    void refreshWhoop();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshWhoop();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshWhoop]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("whoop");
    if (result === "connected") {
      setWhoopError(null);
      void refreshWhoop();
    } else if (result === "error") {
      setWhoopError(
        "WHOOP authorization was not completed. You can try again."
      );
    }
  }, [refreshWhoop]);

  const connect = async () => {
    setWhoopBusy(true);
    setWhoopError(null);
    try {
      const authorizationUrl = await startWhoopConnection();
      await openExternalUrl(authorizationUrl);
    } catch (error) {
      setWhoopError(
        error instanceof Error
          ? error.message
          : "WHOOP connection could not be started."
      );
    } finally {
      setWhoopBusy(false);
    }
  };

  const sync = async () => {
    setWhoopBusy(true);
    setWhoopError(null);
    try {
      const result = await syncWhoopRecovery();
      setLatestRecovery(result.recovery);
      await refreshWhoop();
    } catch {
      setWhoopError("WHOOP recovery could not be synced. Try again shortly.");
    } finally {
      setWhoopBusy(false);
    }
  };

  const disconnect = async () => {
    setWhoopBusy(true);
    setWhoopError(null);
    try {
      await disconnectWhoop();
      setLatestRecovery(null);
      await refreshWhoop();
    } catch {
      setWhoopError("WHOOP could not be disconnected. Try again shortly.");
    } finally {
      setWhoopBusy(false);
    }
  };

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

          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Watch className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">WHOOP</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add recovery, resting heart rate, and HRV context after you
                    explicitly authorize read-only access. Provider credentials
                    and refresh tokens remain on the server.
                  </p>
                </div>
              </div>
              <Badge
                variant={whoop?.connected ? "default" : "outline"}
                className="shrink-0"
              >
                {whoop?.connected
                  ? "Connected"
                  : whoop?.configured
                    ? "Available"
                    : "Planned"}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pl-0 sm:pl-8">
              {!whoop ? (
                <Button variant="outline" disabled>
                  <Loader2 className="animate-spin" /> Checking availability
                </Button>
              ) : whoop.connected ? (
                <>
                  <Button onClick={() => void sync()} disabled={whoopBusy}>
                    {whoopBusy ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    Sync recovery
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void disconnect()}
                    disabled={whoopBusy}
                  >
                    <Unplug /> Disconnect
                  </Button>
                </>
              ) : whoop.configured ? (
                <Button onClick={() => void connect()} disabled={whoopBusy}>
                  {whoopBusy ? <Loader2 className="animate-spin" /> : <Watch />}
                  Connect WHOOP
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connection will appear after the approved WHOOP OAuth client
                  is configured for MyBodyScan.
                </p>
              )}
            </div>
            {whoop?.lastSyncedAtMs ? (
              <p className="mt-3 pl-0 text-xs text-muted-foreground sm:pl-8">
                Last synced {new Date(whoop.lastSyncedAtMs).toLocaleString()}
              </p>
            ) : null}
            {latestRecovery ? (
              <p className="mt-2 pl-0 text-sm text-muted-foreground sm:pl-8">
                Latest recovery: {latestRecovery.recoveryScore ?? "not scored"}
                {latestRecovery.restingHeartRate != null
                  ? ` · Resting HR ${latestRecovery.restingHeartRate} bpm`
                  : ""}
                {latestRecovery.hrvRmssdMs != null
                  ? ` · HRV ${Math.round(latestRecovery.hrvRmssdMs)} ms`
                  : ""}
              </p>
            ) : null}
            {whoopError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {whoopError}
              </p>
            ) : null}
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
                MyBodyScan requests only the permissions needed for features you
                choose to enable. A provider is never shown as connected until
                authorization succeeds, and you can disconnect it here.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsHealth;
