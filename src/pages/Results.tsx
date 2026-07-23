import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Dumbbell,
  RotateCcw,
  CalendarDays,
  ChevronRight,
  Info,
  Target,
  Utensils,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import { updateDoc } from "@/lib/dbWrite";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemo } from "@/lib/demoFlag";
import { demoLatestScan } from "@/lib/demoDataset";
import { scanStatusLabel } from "@/lib/scanStatus";
import {
  buildScanResultViewModel,
  buildScanComparisonViewModel,
  formatKgForUnits,
} from "@/lib/scanResultViewModel";
import { retryScanProcessingClient, type ScanDocument } from "@/lib/api/scan";
import { useUnits } from "@/hooks/useUnits";
import { demoToast } from "@/lib/demoToast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isSuccessfulPersistedScan } from "@/lib/scanContract";
import { kgToLb } from "@/lib/units";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { isNative } from "@/lib/platform";

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

const toMillis = (timestamp: any): number | null => {
  if (!timestamp) return null;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.toDate === "function")
    return timestamp.toDate().getTime();
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const value = date.getTime();
  return Number.isFinite(value) ? value : null;
};

const nextRescanDate = (timestamp: any) => {
  const millis = toMillis(timestamp);
  if (millis == null) return "10+ days after this scan";
  return new Date(millis + 10 * 24 * 60 * 60 * 1000).toLocaleDateString();
};

const signed = (value: number | null, suffix = "") => {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
};

const signedWeight = (valueKg: number | null, units: "metric" | "us") => {
  if (valueKg == null) return "—";
  return units === "us"
    ? signed(Number(kgToLb(valueKg).toFixed(1)), " lb")
    : signed(Number(valueKg.toFixed(1)), " kg");
};

const SourceTag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
    {children}
  </span>
);

const Metric = ({
  label,
  value,
  source,
  estimated = false,
}: {
  label: string;
  value: string;
  source: string;
  estimated?: boolean;
}) => (
  <div
    className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
    data-primary-metric="true"
  >
    <div className="text-xs text-zinc-400">
      {estimated ? `Estimated ${label.toLowerCase()}` : label}
    </div>
    <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
      {value}
    </div>
    <div className="mt-3">
      <SourceTag>{source}</SourceTag>
    </div>
  </div>
);

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
  const subscriberFeaturesAvailable = demo || hasPro(entitlements);
  const [previousScan, setPreviousScan] = useState<ScanDocument | null>(null);
  const sampleDay = useMemo(() => {
    const meals = (activeScan as ScanDocument | null)?.nutritionPlan?.sampleDay;
    if (!Array.isArray(meals)) return [];
    return meals.filter(
      (meal) =>
        meal &&
        typeof meal.mealName === "string" &&
        typeof meal.description === "string"
    );
  }, [activeScan]);
  const subscriptionDestination = isNative()
    ? "/paywall?reason=pro"
    : "/plans?reason=pro";

  useEffect(() => {
    if (!user?.uid || !activeScan?.id || demo) {
      setPreviousScan(null);
      return undefined;
    }
    const scansQuery = query(
      collection(db, "users", user.uid, "scans"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    return onSnapshot(
      scansQuery,
      (snapshot) => {
        const scans = snapshot.docs.map(
          (row) => ({ id: row.id, ...row.data() }) as ScanDocument
        );
        const currentIndex = scans.findIndex(
          (candidate) => candidate.id === activeScan.id
        );
        const currentMillis = toMillis(
          activeScan.completedAt ?? activeScan.createdAt
        );
        const candidates =
          currentIndex >= 0 ? scans.slice(currentIndex + 1) : scans;
        const previous = candidates.find((candidate) => {
          if (!isSuccessfulPersistedScan(candidate)) return false;
          const candidateMillis = toMillis(
            candidate.completedAt ?? candidate.createdAt
          );
          return (
            currentMillis == null ||
            candidateMillis == null ||
            candidateMillis < currentMillis
          );
        });
        setPreviousScan(previous ?? null);
      },
      () => setPreviousScan(null)
    );
  }, [
    activeScan?.completedAt,
    activeScan?.createdAt,
    activeScan?.id,
    demo,
    user?.uid,
  ]);

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
  const comparison = useMemo(
    () =>
      activeScan && previousScan
        ? buildScanComparisonViewModel(activeScan as ScanDocument, previousScan)
        : null,
    [activeScan, previousScan]
  );

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
            {vm.diagnostics.refunded ? (
              <div className="rounded-lg border bg-background/80 p-3 text-sm text-muted-foreground">
                Your scan credit has been returned.
              </div>
            ) : null}
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

  if (!vm.isValidResult) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4 md:p-6">
        <Seo
          title="Scan processing – MyBodyScan"
          description="Your scan is still processing."
          canonical={window.location.href}
        />
        <Card>
          <CardHeader>
            <CardTitle>Your scan is still processing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Results will appear only after a complete, supported estimate is
              saved.
            </p>
            <Button onClick={() => navigate(`/scans/${activeScan.id}`)}>
              View processing status
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d10] text-zinc-100">
      <Seo
        title="Your Body Scan – MyBodyScan"
        description="Premium body composition results."
        canonical={window.location.href}
      />
      <DemoBanner />
      <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 md:p-8">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#132329] via-[#10171b] to-[#0b0f12] p-5 shadow-2xl shadow-black/30 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                MyBodyScan
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                MyBodyScan Report
              </h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                <CalendarDays className="h-4 w-4" />
                {formatDate(activeScan.completedAt || activeScan.createdAt)}
              </p>
            </div>
            <span className="rounded-full bg-cyan-300 px-3 py-1 text-xs font-semibold text-slate-950">
              {statusMeta?.label}
            </span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-zinc-500">Goal</div>
              <div className="mt-1 capitalize">
                {String((profile as any)?.goal || "Not set").replace(/_/g, " ")}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Current phase</div>
              <div className="mt-1">{vm.plan.focus}</div>
            </div>
            <div>
              <div className="text-zinc-500">Training</div>
              <div className="mt-1">
                {vm.plan.daysPerWeek
                  ? `${vm.plan.daysPerWeek} days / week`
                  : "Setup needed"}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Trend guidance</div>
              <div className="mt-1">
                Rescan{" "}
                {nextRescanDate(activeScan.completedAt ?? activeScan.createdAt)}
              </div>
            </div>
          </div>
        </header>

        <section aria-labelledby="primary-metrics">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-cyan-300">
                At a glance
              </p>
              <h2 id="primary-metrics" className="mt-1 text-xl font-semibold">
                Primary metrics
              </h2>
            </div>
            <span className="text-xs text-zinc-500">
              Supported results only
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {vm.primary.bodyFatPercent != null && (
              <Metric
                label="Body fat"
                value={`${vm.primary.bodyFatPercent.toFixed(1)}%`}
                source="photo estimate"
                estimated
              />
            )}
            {vm.primary.weightKg != null && (
              <Metric
                label="Current weight"
                value={formatKgForUnits(vm.primary.weightKg, units)}
                source="user input"
              />
            )}
            {vm.primary.leanMassKg != null && (
              <Metric
                label="Lean body mass"
                value={formatKgForUnits(vm.primary.leanMassKg, units)}
                source="calculated"
                estimated
              />
            )}
            {vm.primary.fatMassKg != null && (
              <Metric
                label="Fat mass"
                value={formatKgForUnits(vm.primary.fatMassKg, units)}
                source="calculated"
                estimated
              />
            )}
            {vm.primary.bmi != null && (
              <Metric
                label="BMI"
                value={String(vm.primary.bmi)}
                source="calculated"
              />
            )}
            {vm.nutrition.calories != null && (
              <Metric
                label="Daily calorie target"
                value={`${vm.nutrition.calories} kcal`}
                source="calculated"
              />
            )}
            {vm.nutrition.proteinGrams != null && (
              <Metric
                label="Protein target"
                value={`${vm.nutrition.proteinGrams} g`}
                source="calculated"
              />
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
            <div className="flex items-center gap-2 text-cyan-300">
              <Target className="h-4 w-4" />
              <span className="text-xs uppercase tracking-widest">
                Goal progress
              </span>
            </div>
            <p className="mt-3 text-xl font-medium">
              {vm.primary.goalProgressText}
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              For a more consistent trend, repeat scans at least 10 days apart
              under similar lighting, pose, clothing, and hydration conditions.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs uppercase tracking-widest text-cyan-300">
              Recommended training
            </div>
            <p className="mt-3 text-lg font-medium">{vm.plan.summary}</p>
          </div>
        </section>

        {comparison && (
          <section
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
            aria-labelledby="comparison-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-cyan-300">
                  Progress comparison
                </p>
                <h2
                  id="comparison-heading"
                  className="mt-1 text-xl font-semibold"
                >
                  Since your previous valid scan
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  {comparison.daysSincePrevious != null
                    ? `${comparison.daysSincePrevious} days between scans`
                    : "Previous valid scan"}
                  . Photo-derived changes remain estimates.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-white/20 bg-transparent text-white"
                onClick={() =>
                  navigate(
                    `/scans/compare/${comparison.previousScanId}/${activeScan.id}`
                  )
                }
              >
                Compare scans
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric
                label="Weight change"
                value={signedWeight(comparison.weightDeltaKg, units)}
                source="user input trend"
              />
              <Metric
                label="Body-fat change"
                value={signed(comparison.bodyFatDeltaPoints, " pts")}
                source="photo estimate trend"
                estimated
              />
              <Metric
                label="Fat-mass change"
                value={signedWeight(comparison.fatMassDeltaKg, units)}
                source="calculated trend"
                estimated
              />
              <Metric
                label="Lean-mass change"
                value={signedWeight(comparison.leanMassDeltaKg, units)}
                source="calculated trend"
                estimated
              />
              <Metric
                label="Calorie-target change"
                value={signed(comparison.calorieTargetDelta, " kcal")}
                source="calculated trend"
              />
            </div>
          </section>
        )}

        <details
          className="group rounded-2xl border border-white/10 bg-[#0f1518]"
          data-full-report
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between p-5 text-base font-semibold">
            View Full Report{" "}
            <ChevronRight className="h-5 w-5 transition group-open:rotate-90" />
          </summary>
          <div className="space-y-8 border-t border-white/10 p-5 md:p-7">
            <section>
              <h2 className="text-xl font-semibold">Body composition</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Measured inputs, photo estimates, and derived calculations are
                identified separately.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vm.composition.heightCm != null && (
                  <Metric
                    label="Height"
                    value={`${vm.composition.heightCm} cm`}
                    source="user input"
                  />
                )}
                {vm.composition.age != null && (
                  <Metric
                    label="Age"
                    value={String(vm.composition.age)}
                    source="user input"
                  />
                )}
                {vm.composition.goalWeightKg != null && (
                  <Metric
                    label="Goal weight"
                    value={formatKgForUnits(vm.composition.goalWeightKg, units)}
                    source="user input"
                  />
                )}
                {vm.composition.profileCategory && (
                  <Metric
                    label="Profile category"
                    value={vm.composition.profileCategory}
                    source="user input"
                  />
                )}
                {vm.composition.maintenanceCalories != null && (
                  <Metric
                    label="Maintenance calories"
                    value={`${vm.composition.maintenanceCalories} kcal`}
                    source="calculated"
                  />
                )}
                {vm.composition.confidence && (
                  <Metric
                    label="Confidence"
                    value={vm.composition.confidence}
                    source="photo estimate"
                    estimated
                  />
                )}
                {vm.composition.estimateRange && (
                  <Metric
                    label="Body-fat range"
                    value={vm.composition.estimateRange}
                    source="photo estimate"
                    estimated
                  />
                )}
                {vm.composition.scanQuality && (
                  <Metric
                    label="Scan quality"
                    value={vm.composition.scanQuality}
                    source="photo estimate"
                  />
                )}
              </div>
            </section>

            {(vm.observations.length > 0 || vm.regions.length > 0) && (
              <section>
                <h2 className="text-xl font-semibold">Visual observations</h2>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    {vm.observations.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-white/10 p-3"
                      >
                        <div className="flex justify-between gap-3 text-xs text-zinc-400">
                          <span>{item.label}</span>
                          <SourceTag>visual observation</SourceTag>
                        </div>
                        <p className="mt-2 text-sm">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {vm.regions.length > 0 && (
                    <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
                      <div
                        aria-hidden="true"
                        className="mx-auto mb-5 h-44 w-20 rounded-[45%] border border-cyan-300/40 bg-gradient-to-b from-cyan-300/10 to-transparent"
                      />
                      <div className="grid gap-2">
                        {vm.regions.map((region) => (
                          <div
                            key={region.label}
                            className="flex justify-between gap-4 border-t border-white/10 pt-2 text-sm"
                          >
                            <span className="text-zinc-400">
                              {region.label}
                            </span>
                            <span>{region.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2">
                <Utensils className="h-5 w-5 text-cyan-300" />
                <h2 className="text-xl font-semibold">Nutrition</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {vm.nutrition.calories != null && (
                  <Metric
                    label="Calories"
                    value={`${vm.nutrition.calories} kcal`}
                    source="calculated"
                  />
                )}
                {vm.nutrition.proteinGrams != null && (
                  <Metric
                    label="Protein"
                    value={`${vm.nutrition.proteinGrams} g`}
                    source="calculated"
                  />
                )}
                {vm.nutrition.carbsGrams != null && (
                  <Metric
                    label="Carbohydrates"
                    value={`${vm.nutrition.carbsGrams} g`}
                    source="calculated"
                  />
                )}
                {vm.nutrition.fatsGrams != null && (
                  <Metric
                    label="Fat"
                    value={`${vm.nutrition.fatsGrams} g`}
                    source="calculated"
                  />
                )}
                {vm.nutrition.fiberGrams != null && (
                  <Metric
                    label="Fiber"
                    value={`${vm.nutrition.fiberGrams} g`}
                    source="calculated"
                  />
                )}
                {vm.nutrition.trainingDayCalories != null && (
                  <Metric
                    label="Training-day target"
                    value={`${vm.nutrition.trainingDayCalories} kcal`}
                    source="calculated"
                  />
                )}
                {vm.nutrition.restDayCalories != null && (
                  <Metric
                    label="Rest-day target"
                    value={`${vm.nutrition.restDayCalories} kcal`}
                    source="calculated"
                  />
                )}
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                Hydration guidance: drink regularly and increase fluids around
                training, heat, and heavy perspiration. Targets adjust based on
                your weight trend and future scans.
              </p>
              {vm.nutrition.adjustmentRule && (
                <p className="mt-2 text-sm">
                  Adjustment rule: {vm.nutrition.adjustmentRule}
                </p>
              )}
              {sampleDay.length > 0 && (
                <div className="mt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-zinc-200">
                      Sample day included with this scan
                    </h3>
                    <SourceTag>calculated plan</SourceTag>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {sampleDay.map((meal, index) => (
                      <div
                        key={`${meal.mealName}-${index}`}
                        className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                      >
                        <div className="font-medium text-white">
                          {meal.mealName}
                        </div>
                        <p className="mt-1 text-sm text-zinc-300">
                          {meal.description}
                        </p>
                        <p className="mt-2 text-xs text-zinc-400">
                          {meal.calories} kcal · {meal.proteinGrams}g protein ·{" "}
                          {meal.carbsGrams}g carbs · {meal.fatsGrams}g fat
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    navigate(
                      subscriberFeaturesAvailable
                        ? "/meals/plan"
                        : subscriptionDestination
                    )
                  }
                >
                  {subscriberFeaturesAvailable
                    ? "Open 7-day meal plan"
                    : "Unlock interactive meal planning"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="border-white/20 bg-transparent text-white"
                  onClick={() =>
                    navigate(
                      subscriberFeaturesAvailable
                        ? "/meals"
                        : subscriptionDestination
                    )
                  }
                >
                  {subscriberFeaturesAvailable
                    ? "Open meal diary"
                    : "Unlock nutrition tracking"}
                </Button>
              </div>
              {!subscriberFeaturesAvailable && (
                <p className="mt-3 text-xs text-zinc-400">
                  Your purchased scan report and sample plan stay available.
                  Monthly or yearly Pro adds ongoing meal planning, search,
                  barcode insights, and tracking.
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-cyan-300" />
                <h2 className="text-xl font-semibold">Training</h2>
              </div>
              <p className="mt-3">{vm.plan.summary}</p>
              {vm.plan.detailLines.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                  {vm.plan.detailLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {vm.plan.exercisePriorities.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-zinc-200">
                    Exercise priorities
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                    {vm.plan.exercisePriorities.map((exercise) => (
                      <li key={exercise}>{exercise}</li>
                    ))}
                  </ul>
                </div>
              )}
              {vm.plan.progressionRules.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-zinc-200">
                    Progression method
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                    {vm.plan.progressionRules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 text-sm text-zinc-400">
                Recovery guidance: use planned rest days, consistent sleep, and
                manageable progression. Stop and seek qualified care for pain or
                injury concerns.
              </p>
              <Button
                variant="outline"
                className="mt-4 border-white/20 bg-transparent text-white"
                onClick={() =>
                  navigate(
                    vm.plan.setupNeeded ? "/coach/onboarding" : "/programs"
                  )
                }
              >
                {vm.plan.setupNeeded
                  ? "Complete plan setup"
                  : "View training plan"}
              </Button>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-cyan-300" />
                <h2 className="text-lg font-semibold">
                  How this estimate works
                </h2>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                <li>
                  Four submitted photos are evaluated for visible
                  body-composition patterns.
                </li>
                <li>
                  Current weight and profile information support derived
                  calculations.
                </li>
                <li>
                  Body-fat percentage is an AI-assisted visual wellness
                  estimate. Lean and fat mass are calculated from weight and
                  that estimate.
                </li>
                <li>
                  Nutrition and training guidance come from deterministic app
                  logic.
                </li>
                <li>
                  Results are not equivalent to DXA, BIA, clinical imaging, or
                  medical testing.
                </li>
                <li>
                  Lighting, pose, clothing, camera angle, hydration, and image
                  quality can affect results. Repeat scans under similar
                  conditions for better trend consistency.
                </li>
              </ul>
              <p className="mt-4 text-sm font-medium text-zinc-200">
                General wellness information only. Not medical advice or
                diagnosis.
              </p>
            </section>
          </div>
        </details>

        {vm.isValidResult && (
          <Card className="border-cyan-400/20 bg-cyan-400/[0.06] text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-cyan-300" /> Future-goal
                visualization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <p>
                Create an optional, private AI illustration of a realistic goal
                direction. It is motivational—not a prediction or guarantee.
              </p>
              <Button
                onClick={() =>
                  navigate(`/results/${activeScan.id}/transformation-preview`)
                }
              >
                Open goal visualization <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {vm.isValidResult && (
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <label htmlFor="scan-note" className="text-sm text-zinc-300">
                Private note for this scan
              </label>
              <Textarea
                id="scan-note"
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
      </div>
    </main>
  );
};

export default Results;
