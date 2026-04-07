import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sparkles, ArrowRight, Lock, Dumbbell, Apple, Flame } from "lucide-react";
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
import { extractScanMetrics } from "@/lib/scans";
import { summarizeScanMetrics } from "@/lib/scanDisplay";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemo } from "@/lib/demoFlag";
import { demoLatestScan } from "@/lib/demoDataset";
import { scanStatusLabel } from "@/lib/scanStatus";
import { useUnits } from "@/hooks/useUnits";
import { kgToLb } from "@/lib/units";
import { demoToast } from "@/lib/demoToast";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
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
      await updateDoc(scanRef, { note: note.trim(), noteUpdatedAt: serverTimestamp() });
      toast({ title: "Note saved" });
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const metrics = extractScanMetrics(activeScan || {});
  const summary = summarizeScanMetrics(metrics, units);
  const statusMeta = activeScan
    ? scanStatusLabel(activeScan.status, activeScan.completedAt ?? activeScan.updatedAt ?? activeScan.createdAt)
    : null;

  const nutritionGoals = useMemo(
    () =>
      deriveNutritionGoals({
        weightKg: profile?.weight_kg ?? null,
        heightCm: profile?.height_cm ?? null,
        age: profile?.age ?? null,
        sex: profile?.sex ?? null,
        goalWeightKg: profile?.goal_weight_kg ?? null,
        goal:
          profile?.goal === "lose_fat"
            ? "lose_fat"
            : profile?.goal === "gain_muscle"
              ? "gain_muscle"
              : null,
        activityLevel: profile?.activity_level ?? null,
        overrides: {
          calories: plan?.calorieTarget,
          proteinGrams: plan?.proteinFloor,
        },
      }),
    [plan?.calorieTarget, plan?.proteinFloor, profile]
  );

  if (!user && !demo && !loading) {
    return <main className="min-h-screen p-6 max-w-md mx-auto"><Button onClick={() => navigate("/auth")}>Sign In</Button></main>;
  }

  if (loading && !demo) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review scan results." canonical={window.location.href} />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (error || !activeScan) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto space-y-4">
        <Seo title="Results – MyBodyScan" description="Review scan results." canonical={window.location.href} />
        <DemoBanner />
        <Card><CardContent className="pt-6">Unable to load results.</CardContent></Card>
        <Button onClick={() => navigate(readOnlyDemo ? "/auth" : "/scan/new")} className="w-full">
          {readOnlyDemo ? "Sign in to start" : "Start a Scan"}
        </Button>
      </main>
    );
  }

  const leanMassKg = Number((activeScan as any)?.estimate?.leanMassKg ?? (activeScan as any)?.metrics?.leanMassKg);
  const fatMassKg = Number((activeScan as any)?.estimate?.fatMassKg ?? (activeScan as any)?.metrics?.fatMassKg);

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Seo title="Results – MyBodyScan" description="Premium body composition results." canonical={window.location.href} />
      <DemoBanner />

      <Card className="bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-zinc-800 text-zinc-100">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl">Scan Results</CardTitle>
            <Badge variant={statusMeta?.badgeVariant}>{statusMeta?.label}</Badge>
          </div>
          <p className="text-xs text-zinc-400">{formatDate(activeScan.completedAt || activeScan.createdAt)}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusMeta?.showMetrics ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Card className="bg-zinc-900/70 border-zinc-800"><CardContent className="py-4 text-center"><div className="text-2xl font-semibold">{summary.bodyFatPercent != null ? `${summary.bodyFatPercent.toFixed(1)}%` : "—"}</div><div className="text-xs text-zinc-400">Body Fat</div></CardContent></Card>
                <Card className="bg-zinc-900/70 border-zinc-800"><CardContent className="py-4 text-center"><div className="text-2xl font-semibold">{summary.weightText}</div><div className="text-xs text-zinc-400">Weight</div></CardContent></Card>
                <Card className="bg-zinc-900/70 border-zinc-800"><CardContent className="py-4 text-center"><div className="text-2xl font-semibold">{summary.bmiText}</div><div className="text-xs text-zinc-400">BMI</div></CardContent></Card>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                <Card className="bg-zinc-900/60 border-zinc-800"><CardContent className="py-3">Lean mass: {Number.isFinite(leanMassKg) ? (units === "us" ? `${kgToLb(leanMassKg).toFixed(1)} lb` : `${leanMassKg.toFixed(1)} kg`) : "—"}</CardContent></Card>
                <Card className="bg-zinc-900/60 border-zinc-800"><CardContent className="py-3">Fat mass: {Number.isFinite(fatMassKg) ? (units === "us" ? `${kgToLb(fatMassKg).toFixed(1)} lb` : `${fatMassKg.toFixed(1)} kg`) : "—"}</CardContent></Card>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-400">{statusMeta?.helperText || "Your scan is processing."}</p>
          )}
        </CardContent>
      </Card>

      {statusMeta?.showMetrics && (
        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardHeader>
            <CardTitle className="text-base text-zinc-100">Transformation Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 mt-0.5 text-primary" />
              <p>
                Realistic premium projection based on your scan metrics, goal timeline, and current program. Same person, same look, same context.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => navigate(`/results/${activeScan.id}/transformation-preview`)}
              variant={pro ? "default" : "secondary"}
            >
              {pro ? "Open Transformation Preview" : "Unlock Transformation Preview"}
              {pro ? <ArrowRight className="ml-2 h-4 w-4" /> : <Lock className="ml-2 h-4 w-4" />}
            </Button>
            <p className="text-xs text-zinc-500">Motivational projection. Not a medical prediction.</p>
          </CardContent>
        </Card>
      )}

      {statusMeta?.showMetrics && (
        <Card>
          <CardHeader><CardTitle className="text-base">Plan summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-md border p-3"><div className="flex items-center gap-2"><Flame className="h-4 w-4" />Calories</div><div className="text-lg font-semibold">{nutritionGoals.calories ?? "—"}</div></div>
              <div className="rounded-md border p-3"><div className="flex items-center gap-2"><Dumbbell className="h-4 w-4" />Protein</div><div className="text-lg font-semibold">{nutritionGoals.proteinGrams ?? "—"}g</div></div>
              <div className="rounded-md border p-3"><div className="flex items-center gap-2"><Apple className="h-4 w-4" />Carb/Fat</div><div className="text-lg font-semibold">{nutritionGoals.carbsGrams ?? 0}g / {nutritionGoals.fatGrams ?? 0}g</div></div>
            </div>
            {activeScan.planMarkdown ? <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{activeScan.planMarkdown}</pre> : null}
          </CardContent>
        </Card>
      )}

      {statusMeta?.showMetrics && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for your next check-in..." />
            <DemoWriteButton onClick={onSaveNote} disabled={!note.trim() || saving || readOnlyDemo} className="w-full">
              {saving ? "Saving..." : "Save Note"}
            </DemoWriteButton>
          </CardContent>
        </Card>
      )}

      <Separator />
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => navigate("/")}>Home</Button>
        <Button variant="secondary" onClick={() => navigate("/history")}>History</Button>
        <Button variant="outline" onClick={() => (readOnlyDemo ? demoToast() : navigate("/scan/new"))}>New Scan</Button>
      </div>
    </main>
  );
};

export default Results;
