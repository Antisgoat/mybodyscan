import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { History as HistoryIcon, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { auth } from "@/lib/firebase";
import { watchScans } from "@/lib/scan";
import { isDemoGuest } from "@/lib/demoFlag";

export default function History() {
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = watchScans(uid, setScans);
    return unsub;
  }, []);

  const handleSelectScan = (scanId: string, checked: boolean) => {
    if (checked) {
      setSelectedScans(prev => [...prev, scanId]);
    } else {
      setSelectedScans(prev => prev.filter(id => id !== scanId));
    }
  };

  const canCompare = selectedScans.length === 2;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="History - MyBodyScan" description="Your body scan results and progress" />
        <AppHeader />
        <main className="max-w-md mx-auto p-6 space-y-6">
          {isDemoGuest() && (
            <div className="rounded bg-muted p-2 text-center text-xs">Demo scans — create an account to save your scans.</div>
          )}
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-semibold">{t('history.title')}</h1>
          </div>
          {scans.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              disabled={!canCompare}
              className="flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              {t('history.compare')}
            </Button>
          )}
        </div>

        {scans.length > 0 ? (
          <div className="space-y-4">
            {scans.map((scan) => (
              <Card key={scan.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {scans.length > 1 && (
                        <Checkbox
                          checked={selectedScans.includes(scan.id)}
                          onCheckedChange={(checked) => handleSelectScan(scan.id, !!checked)}
                          disabled={!canCompare && selectedScans.length >= 2 && !selectedScans.includes(scan.id)}
                        />
                      )}
                      <CardTitle className="text-base">
                        {scan.createdAt?.toDate ? scan.createdAt.toDate().toLocaleDateString() : ""}
                      </CardTitle>
                    </div>
                    <Badge variant={scan.status === "ready" ? "default" : "secondary"}>
                      {scan.status}
                    </Badge>
                  </div>
                </CardHeader>
                {scan.status === "ready" && scan.measurements?.bodyFat && (
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-semibold">{scan.measurements.bodyFat}%</div>
                        <div className="text-xs text-muted-foreground">Body Fat</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold">{scan.muscleMass}kg</div>
                        <div className="text-xs text-muted-foreground">Muscle Mass</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold">{scan.visceralFat}</div>
                        <div className="text-xs text-muted-foreground">Visceral Fat</div>
                      </div>
                    </div>
                  </CardContent>
                )}
                {scan.status === "Processing" && (
                  <CardContent>
                    <div className="text-center py-4">
                      <div className="animate-pulse text-sm text-muted-foreground">
                        Your scan is being processed...
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <HistoryIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">{t('history.noScans')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Take your first scan to start tracking your progress
              </p>
              <Button onClick={() => window.location.href = '/scan'}>
                Start Your First Scan
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}