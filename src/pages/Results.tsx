import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Lock,
  Dumbbell,
  Apple,
  Flame,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import { updateDoc } from "@/lib/dbWrite";
import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemo } from "@/lib/demoFlag";
import { demoLatestScan } from "@/lib/demoDataset";
import { scanStatusLabel } from "@/lib/scanStatus";
import {
  buildScanResultViewModel,
  formatKgForUnits,
} from "@/lib/scanResultViewModel";
import { retryScanProcessingClient } from "@/lib/api/scan";
import { useUnits } from "@/hooks/useUnits";
import { demoToast } from "@/lib/demoToast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { hasPro } from "@/lib/entitlements/pro";
import { useEntitlements } from "@/lib/entitlements/store";

const formatDate = (timestamp: any) => {
  if (!timestamp) return "—";
  if (timestamp.toDate) return timestamp.toDate().toLocaleString();
  if (timestamp instanceof Date) return timestamp.toLocaleString();
  if (typeof timestamp === "number" || typeof timestamp === "string") {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }
  return "—";
};

const Results = () => {
  const navigate = useNavigate();
  const { scanId } = useParams();
  const { scan, loading, error, user } = useLatestScanForUser(scanId);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const demo = isDemo();
  const readOnlyDemo = demo && !user;
  const activeScan = scan ?? (demo ? (demoLatestScan as any) : null);
  const { units } = useUnits();
  const { profile, plan } = useUserProfile();
  const { entitlements } = useEntitlements();
  const pro = hasPro(entitlements);

  useEffect(() => {
    if (activeScan?.note) setNote(activeScan.note);
  }, [activeScan?.note]);

  const onSaveNote = async () => {
    if (!user || !scan || !note.trim()) return;
    setSaving(true);
    try {
      const scanRef = doc(db, "users", user.uid, "scans", scan.id);
      await updateDoc(scanRef, {
        note: note.trim(),
        noteUpdatedAt: serverTimestamp(),
      });
      toast({ title: "Note saved" });
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const statusMeta = activeScan
    ? scanStatusLabel(
        activeScan.status,
        activeScan.completedAt ?? activeScan.updatedAt ?? activeScan.createdAt
      )
    : null;
  const vm = activeScan
    ? buildScanResultViewModel({ scan: activeScan as any, profile, plan })
    : null;

  const onRetryProcessing = async () => {
    if (!activeScan?.id || readOnlyDemo) return;
    const result = await retryScanProcessingClient(activeScan.id);
    if (result.ok) toast({ title: "Scan retry queued" });
    else
      toast({
        title: "Unable to retry scan",
        description: result.error.message,
        variant: "destructive",
      });
  };

  if (!user && !demo && !loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </main>
    );
  }

  if (loading && !demo) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo
          title="Results – MyBodyScan"
          description="Review scan results."
          canonical={window.location.href}
        />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (error || !activeScan) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto space-y-4">
        <Seo
          title="Results – MyBodyScan"
          description="Review scan results."
          canonical={window.location.href}
        />
        <DemoBanner />
        <Card>
          <CardContent className="pt-6">Unable to load results.</CardContent>
        </Card>
        <Button
          onClick={() => navigate(readOnlyDemo ? "/auth" : "/scan/new")}
          className="w-full"
        >
          {readOnlyDemo ? "Sign in to start" : "Start a Scan"}
        </Button>
      </main>
    );
  }

  if (!vm) return null;

  if (vm.isFailedOrFallback) {
    return (
      <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Seo
          title="Scan recovery – MyBodyScan"
          description="Recover a failed scan."
          canonical={window.location.href}
        />
        <DemoBanner />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{vm.failureTitle}</CardTitle>
              <Badge variant="destructive">{vm.sourceLabel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>{vm.failureMessage}</p>
            <div className="rounded-lg border bg-background/80 p-3 text-xs text-muted-foreground">
              status={activeScan.status || "unknown"} · provider=
              {vm.diagnostics.provider || "unknown"} · error=
              {vm.diagnostics.errorCode || "none"} · credit=
              {vm.diagnostics.refunded
                ? "refunded"
                : vm.diagnostics.charged
                  ? "charged"
                  : "not charged"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={onRetryProcessing} disabled={readOnlyDemo}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry processing
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(readOnlyDemo ? "/auth" : "/scan/new")}
              >
                Re-upload scan
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Seo
        title="Your Body Scan – MyBodyScan"
        description="Premium body composition results."
        canonical={window.location.href}
      />
      <DemoBanner />

      <Card className="bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-zinc-800 text-zinc-100">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl">Your Body Scan</CardTitle>
              <p className="text-xs text-zinc-400 mt-1">
                {formatDate(activeScan.completedAt || activeScan.createdAt)} ·{" "}
                {vm.sourceLabel}
              </p>
            </div>
            <Badge variant={statusMeta?.badgeVariant}>
              {statusMeta?.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {vm.isValidResult ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-semibold">
                      {vm.primary.bodyFatPercent != null
                        ? `${vm.primary.bodyFatPercent.toFixed(1)}%`
                        : "—"}
                    </div>
                    <div className="text-xs text-zinc-400">Est. body fat</div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-semibold">
                      {formatKgForUnits(vm.primary.weightKg, units)}
                    </div>
                    <div className="text-xs text-zinc-400">Weight</div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-semibold">
                      {vm.primary.bmi ?? "—"}
                    </div>
                    <div className="text-xs text-zinc-400">BMI</div>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/70 border-zinc-800">
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-semibold">
                      {formatKgForUnits(vm.primary.leanMassKg, units)}
                    </div>
                    <div className="text-xs text-zinc-400">Lean mass</div>
                  </CardContent>
                </Card>
              </div>
              <p className="text-xs text-zinc-400">
                {vm.primary.goalProgressText}
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              {statusMeta?.helperText || "Your scan is processing."}
            </p>
          )}
        </CardContent>
      </Card>

      {vm.isValidResult && (
        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardHeader>
            <CardTitle className="text-base text-zinc-100">
              Transformation Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 mt-0.5 text-primary" />
              <p>
                See a realistic motivational visualization of your goal physique
                once your scan and plan are ready.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() =>
                navigate(`/results/${activeScan.id}/transformation-preview`)
              }
              variant={pro ? "default" : "secondary"}
            >
              {pro ? "Open not-ready preview" : "Unlock Transformation Preview"}
              {pro ? (
                <ArrowRight className="ml-2 h-4 w-4" />
              ) : (
                <Lock className="ml-2 h-4 w-4" />
              )}
            </Button>
            <p className="text-xs text-zinc-500">
              Premium scaffold only — no generated image until scan reliability
              is proven.
            </p>
          </CardContent>
        </Card>
      )}

      {vm.isValidResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nutrition targets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4" />
                  Calories
                </div>
                <div className="text-lg font-semibold">
                  {vm.nutrition.calories ?? "—"} kcal
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4" />
                  Protein
                </div>
                <div className="text-lg font-semibold">
                  {vm.nutrition.proteinGrams ?? "—"}g
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Apple className="h-4 w-4" />
                  Carbs / fats
                </div>
                <div className="text-lg font-semibold">
                  {vm.nutrition.carbsGrams ?? "—"}g /{" "}
                  {vm.nutrition.fatsGrams ?? "—"}g
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {vm.isValidResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">{vm.plan.summary}</p>
            {vm.plan.setupNeeded ? (
              <Button
                variant="outline"
                onClick={() => navigate("/coach/onboarding")}
              >
                Complete plan setup
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate("/programs")}>
                View full plan
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {vm.isValidResult && (
        <Card>
          <CardContent className="pt-6 text-sm">
            Next scan: rescan in 10 days under similar lighting and time of day.
          </CardContent>
        </Card>
      )}

      {vm.isValidResult && (
        <details className="rounded-lg border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            View full report
          </summary>
          <pre className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
            {activeScan.planMarkdown || "Detailed report unavailable."}
          </pre>
        </details>
      )}

      {vm.isValidResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for your next check-in..."
            />
            <DemoWriteButton
              onClick={onSaveNote}
              disabled={!note.trim() || saving || readOnlyDemo}
              className="w-full"
            >
              {saving ? "Saving..." : "Save Note"}
            </DemoWriteButton>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Fitness estimates only. Not medical advice.
      </p>
      <Separator />
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => navigate("/")}>
          Home
        </Button>
        <Button variant="secondary" onClick={() => navigate("/history")}>
          History
        </Button>
        <Button
          variant="outline"
          onClick={() => (readOnlyDemo ? demoToast() : navigate("/scan/new"))}
        >
          New Scan
        </Button>
      </div>
    </main>
  );
};

export default Results;
