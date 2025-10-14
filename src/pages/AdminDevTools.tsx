import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";
import { clearDemoFlags } from "@/lib/demoFlag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Seo } from "@/components/Seo";

function formatClaims(claims: Record<string, unknown> | null): string {
  if (!claims || Object.keys(claims).length === 0) {
    return "{}";
  }
  return JSON.stringify(claims, null, 2);
}

export default function AdminDevTools() {
  const { user } = useAuthUser();
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!user) {
      setClaims(null);
      return;
    }
    void user
      .getIdTokenResult()
      .then((token) => setClaims(token.claims ?? {}))
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.warn("[dev-tools] unable to load claims", error);
        }
      });
  }, [user?.uid]);

  const unlimitedActive = useMemo(() => claims?.unlimitedCredits === true, [claims]);
  const isDeveloper = user?.email?.toLowerCase() === "developer@adlrlabs.com";

  const handleRefreshClaims = async () => {
    if (!user) return;
    setBusy(true);
    setStatus("Refreshing claims…");
    try {
      await httpsCallable(functions, "refreshClaims")({});
      const token = await user.getIdTokenResult(true);
      setClaims(token.claims ?? {});
      setStatus("Claims refreshed");
    } catch (error: any) {
      const message = typeof error?.message === "string" ? error.message : "Failed to refresh claims";
      setStatus(message);
      if (import.meta.env.DEV) {
        console.warn("[dev-tools] refreshClaims failed", error);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClearDemoFlags = () => {
    clearDemoFlags();
    window.location.reload();
  };

  const handleToggleInfo = async () => {
    if (!user) return;
    setShowInfo((prev) => !prev);
    if (showInfo) return;
    try {
      const token = await user.getIdTokenResult();
      setClaims(token.claims ?? {});
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[dev-tools] getIdTokenResult failed", error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo title="Dev Tools" description="Runtime utilities for MyBodyScan developers" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Developer Tools</h1>
          <p className="text-sm text-muted-foreground">
            Refresh authentication claims, clear local demo flags, and inspect the current session.
          </p>
          {isDeveloper && unlimitedActive && (
            <Badge variant="secondary">Unlimited credits active</Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Claims</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleRefreshClaims} disabled={busy || !user}>
              {busy ? "Refreshing…" : "Refresh claims"}
            </Button>
            {status && <p className="text-xs text-muted-foreground">{status}</p>}
            <pre className="overflow-x-auto rounded bg-muted p-4 text-xs text-muted-foreground">
              {formatClaims(claims)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local demo flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Clears <code>mbs.demo</code> and <code>mbs.readonly</code> from local storage and reloads the page.
            </p>
            <Button variant="outline" onClick={handleClearDemoFlags}>
              Clear local demo flags
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="secondary" onClick={handleToggleInfo} disabled={!user}>
              {showInfo ? "Hide auth info" : "Show auth info"}
            </Button>
            {showInfo && user && (
              <div className="space-y-2 text-sm">
                <div className="grid gap-1">
                  <span className="font-medium">Email</span>
                  <span className="text-muted-foreground">{user.email ?? "(none)"}</span>
                </div>
                <Separator />
                <div className="grid gap-1">
                  <span className="font-medium">UID</span>
                  <span className="text-muted-foreground">{user.uid}</span>
                </div>
                <Separator />
                <div className="grid gap-1">
                  <span className="font-medium">Anonymous</span>
                  <span className="text-muted-foreground">{user.isAnonymous ? "Yes" : "No"}</span>
                </div>
                <Separator />
                <div className="grid gap-1">
                  <span className="font-medium">Claims</span>
                  <pre className="overflow-x-auto rounded bg-muted p-4 text-xs text-muted-foreground">
                    {formatClaims(claims)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
