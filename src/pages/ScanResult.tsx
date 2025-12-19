/**
 * Pipeline map — Scan results & plan surfacing:
 * - Reads `users/{uid}/scans/{scanId}` via `getScan`, then keeps polling while status is `pending/processing`.
 * - Uses `scanStatusLabel` to translate Firestore `status`, `completedAt`, and `errorMessage` into UI copy.
 * - Once the cloud function writes `estimate` and `nutritionPlan`, renders a polished Evolt-style report.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deserializeScanDocument, getScan, type ScanDocument } from "@/lib/api/scan";
import { scanStatusLabel } from "@/lib/scanStatus";
import { formatDateTime } from "@/lib/time";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useUnits } from "@/hooks/useUnits";
import { formatHeightFromCm, formatWeightFromKg, kgToLb } from "@/lib/units";
import { useAuthUser } from "@/lib/auth";
import { useUserProfile } from "@/hooks/useUserProfile";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref } from "firebase/storage";
import silhouetteFront from "@/assets/silhouette-front.png";

const LONG_PROCESSING_WARNING_MS = 3 * 60 * 1000;
const PROCESSING_STEPS = [
  "Analyzing posture…",
  "Checking symmetry…",
  "Estimating body fat…",
  "Calculating metrics…",
  "Generating your plan…",
] as const;

export default function ScanResultPage() {
  const { scanId = "" } = useParams();
  const nav = useNavigate();
  const [scan, setScan] = useState<ScanDocument | null>(null);
  const [previousScan, setPreviousScan] = useState<ScanDocument | null>(null);
  const [photoUrls, setPhotoUrls] = useState<
    Partial<Record<keyof ScanDocument["photoPaths"], string>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { units } = useUnits();
  const { user } = useAuthUser();
  const { profile, plan } = useUserProfile();
  const [processingStepIdx, setProcessingStepIdx] = useState(0);
  const [showLongProcessing, setShowLongProcessing] = useState(false);
  const lastMeaningfulUpdateRef = useRef<number>(Date.now());

  const needsRefresh = useMemo(() => {
    if (!scan) return false;
    return (
      scan.status === "uploading" ||
      scan.status === "uploaded" ||
      scan.status === "pending" ||
      scan.status === "processing"
    );
  }, [scan]);

  useEffect(() => {
    let cancelled = false;
    const uid = user?.uid;

    // Always perform one HTTP fetch so we can surface API-layer debugIds cleanly.
    (async () => {
      try {
        const result = await getScan(scanId);
        if (cancelled) return;
        if (!result.ok) {
          const debugSuffix = result.error.debugId
            ? ` (ref ${result.error.debugId.slice(0, 8)})`
            : "";
          setError(result.error.message + debugSuffix);
          setLoading(false);
          return;
        }
        setScan(result.data);
        setError(null);
        setLoading(false);
        lastMeaningfulUpdateRef.current = Date.now();
      } catch (err) {
        if (cancelled) return;
        console.error("scanResult: unexpected fetch error", err);
        setError("Unable to load scan.");
        setLoading(false);
      }
    })();

    // Real-time Firestore listener (prevents “stuck processing” from stale polling).
    if (!uid || !scanId) {
      return () => {
        cancelled = true;
      };
    }
    const unsub = onSnapshot(
      doc(db, "users", uid, "scans", scanId),
      (snap) => {
        if (cancelled) return;
        if (!snap.exists()) return;
        const next = deserializeScanDocument(snap.id, uid, snap.data() as any);
        setScan(next);
        setError(null);
        setLoading(false);
        // Track “freshness” for long-processing UI; use updatedAt when available.
        const updatedAtMs =
          next.updatedAt instanceof Date ? next.updatedAt.getTime() : Date.now();
        if (Number.isFinite(updatedAtMs)) {
          lastMeaningfulUpdateRef.current = Math.max(
            lastMeaningfulUpdateRef.current,
            updatedAtMs
          );
        } else {
          lastMeaningfulUpdateRef.current = Date.now();
        }
      },
      (errSnap) => {
        console.warn("scanResult.snapshot_failed", errSnap);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [scanId, user?.uid]);

  useEffect(() => {
    if (!needsRefresh) return;
    const id = setInterval(() => {
      setProcessingStepIdx((prev) => (prev + 1) % PROCESSING_STEPS.length);
    }, 2500);
    return () => clearInterval(id);
  }, [needsRefresh]);

  useEffect(() => {
    if (!needsRefresh) {
      setShowLongProcessing(false);
      return;
    }
    const startAt = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const last = lastMeaningfulUpdateRef.current || startAt;
      const elapsed = now - Math.max(startAt, last);
      setShowLongProcessing(elapsed >= LONG_PROCESSING_WARNING_MS);
    }, 1000);
    return () => window.clearInterval(id);
  }, [needsRefresh]);

  useEffect(() => {
    let cancelled = false;
    async function fetchPhotoUrls(next: ScanDocument | null) {
      if (!next) {
        setPhotoUrls({});
        return;
      }
      const paths = next.photoPaths;
      const entries = (Object.entries(paths) as Array<
        [keyof ScanDocument["photoPaths"], string]
      >).filter(([, path]) => typeof path === "string" && path.trim().length > 0);
      if (!entries.length) {
        setPhotoUrls({});
        return;
      }
      const resolved = await Promise.all(
        entries.map(async ([pose, path]) => {
          try {
            const url = await getDownloadURL(ref(storage, path));
            return [pose, url] as const;
          } catch (err) {
            console.warn("scanResult.photo_url_failed", { pose, path });
            return [pose, ""] as const;
          }
        })
      );
      if (cancelled) return;
      const nextUrls: Partial<Record<keyof ScanDocument["photoPaths"], string>> =
        {};
      for (const [pose, url] of resolved) {
        if (url) nextUrls[pose] = url;
      }
      setPhotoUrls(nextUrls);
    }
    void fetchPhotoUrls(scan);
    return () => {
      cancelled = true;
    };
  }, [scan]);

  useEffect(() => {
    let cancelled = false;
    async function fetchPrevious() {
      try {
        if (!user?.uid || !scan?.createdAt) {
          setPreviousScan(null);
          return;
        }
        const q = query(
          collection(db, "users", user.uid, "scans"),
          orderBy("createdAt", "desc"),
          limit(6)
        );
        const snaps = await getDocs(q);
        if (cancelled) return;
        const docs = snaps.docs
          .map((snap) =>
            deserializeScanDocument(snap.id, user.uid, snap.data() as any)
          )
          .filter((d) => d.status === "complete" || d.status === "completed");
        const prev = docs.find((d) => d.id !== scan.id) ?? null;
        setPreviousScan(prev);
      } catch (err) {
        if (!cancelled) {
          setPreviousScan(null);
        }
      }
    }
    void fetchPrevious();
    return () => {
      cancelled = true;
    };
  }, [scan?.createdAt, scan?.id, user?.uid]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <div className="h-6 w-40 animate-pulse rounded bg-black/10" />
        <div className="h-4 w-64 animate-pulse rounded bg-black/10" />
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm text-red-700">{error || "Scan not found."}</p>
        <Button variant="outline" onClick={() => nav("/scan")}>
          Back to Scan
        </Button>
      </div>
    );
  }

  const statusMeta = scanStatusLabel(
    scan.status,
    scan.completedAt ?? scan.updatedAt ?? scan.createdAt
  );

  if (statusMeta.canonical === "error" || statusMeta.recommendRescan) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm text-red-700">{statusMeta.label}</p>
        <p className="text-xs text-red-700/90">
          {scan.errorMessage ||
            statusMeta.helperText ||
            "We couldn't complete this scan."}
        </p>
        <ScanPhotos photoUrls={photoUrls} />
        <div className="flex gap-2">
          <Button onClick={() => nav("/scan")}>Try again</Button>
          <Button variant="outline" onClick={() => nav("/scan/history")}>
            History
          </Button>
        </div>
      </div>
    );
  }

  if (!statusMeta.showMetrics) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <Card className="border bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">{statusMeta.label}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {statusMeta.helperText ||
                "This usually takes a minute or two. Keep this tab open if you can."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="h-2 w-full rounded-full bg-muted">
                <div className="h-2 w-1/2 animate-pulse rounded-full bg-primary/60" />
              </div>
              <p className="text-sm text-foreground" aria-live="polite">
                {typeof scan.lastStep === "string" && scan.lastStep.trim()
                  ? scan.lastStep
                  : PROCESSING_STEPS[processingStepIdx]}
              </p>
              <p className="text-xs text-muted-foreground">
                We’ll refresh automatically. If your connection changed, you can refresh manually.
              </p>
            </div>
            {showLongProcessing ? (
              <div className="rounded-lg border bg-background/60 p-3">
                <p className="text-sm font-medium">Taking longer than usual</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If this doesn’t finish soon, try refreshing. If it keeps happening, contact support and include your scan id.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Refresh page
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => nav("/scan")}
                  >
                    Back to Scan
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      window.open(
                        `mailto:support@mybodyscanapp.com?subject=MyBodyScan%20Scan%20Stuck&body=${encodeURIComponent(
                          `scanId=${scan.id}\nstatus=${scan.status}\nlastStep=${scan.lastStep ?? ""}\nuid=${user?.uid ?? ""}\nua=${navigator.userAgent}\n`
                        )}`,
                        "_blank"
                      )
                    }
                  >
                    Contact support
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void getScan(scanId).then((result) => {
                    setLoading(false);
                    if (result.ok) {
                      setScan(result.data);
                      setError(null);
                    } else {
                      setError(result.error.message);
                    }
                  });
                }}
              >
                Refresh now
              </Button>
              <Button variant="outline" onClick={() => nav("/scan")}>
                Back to Scan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName =
    (typeof user?.displayName === "string" && user.displayName.trim()) ||
    (typeof user?.email === "string" && user.email.includes("@")
      ? user.email.split("@")[0]
      : null) ||
    "You";

  const sex =
    profile?.sex === "male" || profile?.sex === "female" ? profile.sex : null;
  const age =
    typeof profile?.age === "number" && Number.isFinite(profile.age)
      ? profile.age
      : null;

  const weightKg =
    typeof scan.input?.currentWeightKg === "number" &&
    Number.isFinite(scan.input.currentWeightKg)
      ? scan.input.currentWeightKg
      : typeof profile?.weight_kg === "number" && Number.isFinite(profile.weight_kg)
        ? profile.weight_kg
        : null;

  const bfPct =
    typeof scan.estimate?.bodyFatPercent === "number" &&
    Number.isFinite(scan.estimate.bodyFatPercent)
      ? scan.estimate.bodyFatPercent
      : null;

  const fatMassKg =
    weightKg != null && bfPct != null ? (weightKg * bfPct) / 100 : null;
  const leanMassKg =
    weightKg != null && fatMassKg != null ? weightKg - fatMassKg : null;

  const skeletalMuscleKg =
    leanMassKg != null ? Math.max(0, leanMassKg * 0.52) : null;
  const totalBodyWaterKg =
    leanMassKg != null ? Math.max(0, leanMassKg * 0.73) : null;
  const totalBodyWaterPct =
    totalBodyWaterKg != null && weightKg != null && weightKg > 0
      ? (totalBodyWaterKg / weightKg) * 100
      : null;

  const goalLabel = (() => {
    const goal = profile?.goal;
    if (goal === "lose_fat") return "Fat loss";
    if (goal === "gain_muscle") return "Muscle gain";
    if (goal === "improve_heart") return "Improve health";
    return "Maintain";
  })();

  const computedGoals = deriveNutritionGoals({
    weightKg: weightKg ?? null,
    bodyFatPercent: bfPct ?? null,
    goalWeightKg: scan.input?.goalWeightKg ?? null,
    goal:
      profile?.goal === "lose_fat"
        ? "lose_fat"
        : profile?.goal === "gain_muscle"
          ? "gain_muscle"
          : null,
    activityLevel: profile?.activity_level ?? null,
    overrides: {
      calories:
        typeof plan?.calorieTarget === "number" && Number.isFinite(plan.calorieTarget)
          ? plan.calorieTarget
          : undefined,
      proteinGrams:
        typeof plan?.proteinFloor === "number" && Number.isFinite(plan.proteinFloor)
          ? plan.proteinFloor
          : undefined,
    },
  });

  const bodyAge = (() => {
    if (age == null || bfPct == null) return null;
    const ideal =
      sex === "female" ? 26 : sex === "male" ? 18 : 22;
    const delta = clampNumber((bfPct - ideal) * 0.4, -6, 12);
    return Math.round(age + delta);
  })();

  const bodyScore = (() => {
    // A simple 0–10 score: rewards lower BF% and higher lean mass vs weight.
    if (weightKg == null || bfPct == null || leanMassKg == null) return null;
    const bfScore =
      sex === "female"
        ? mapToScore(18, 34, bfPct, true)
        : mapToScore(10, 26, bfPct, true);
    const leanRatio = leanMassKg / weightKg;
    const leanScore = mapToScore(0.62, 0.82, leanRatio, false);
    return clampNumber(Math.round(((bfScore + leanScore) / 2) * 10) / 10, 0, 10);
  })();

  const recommendations =
    Array.isArray(scan.recommendations) && scan.recommendations.length
      ? scan.recommendations
      : defaultRecommendations(computedGoals);

  const delta = (() => {
    if (!previousScan) return null;
    const prevWeight = previousScan.input?.currentWeightKg;
    const prevBf = previousScan.estimate?.bodyFatPercent;
    const prevWeightOk =
      typeof prevWeight === "number" && Number.isFinite(prevWeight) ? prevWeight : null;
    const prevBfOk =
      typeof prevBf === "number" && Number.isFinite(prevBf) ? prevBf : null;
    if (weightKg == null || bfPct == null || prevWeightOk == null || prevBfOk == null) {
      return null;
    }
    const prevFatKg = (prevWeightOk * prevBfOk) / 100;
    const prevLeanKg = prevWeightOk - prevFatKg;
    return {
      weightKg: weightKg - prevWeightOk,
      bfPct: bfPct - prevBfOk,
      leanKg: (leanMassKg ?? 0) - prevLeanKg,
    };
  })();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <Seo title="Your Body Scan – MyBodyScan" description="Your scan report." />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Your Body Scan</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(scan.completedAt ?? scan.updatedAt)} · {displayName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/scan/history")}>
            History
          </Button>
          <Button onClick={() => nav("/scan")}>New scan</Button>
        </div>
      </header>

      <Card className="border bg-card/60">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Overview</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{goalLabel}</Badge>
            {delta ? (
              <Badge variant="outline">
                vs last scan: {delta.weightKg >= 0 ? "+" : ""}
                {delta.weightKg.toFixed(1)} kg · {delta.bfPct >= 0 ? "+" : ""}
                {delta.bfPct.toFixed(1)}%
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Sex" value={sex ? capitalize(sex) : "—"} />
            <InfoRow label="Age" value={age != null ? String(age) : "—"} />
            <InfoRow
              label="Height"
              value={
                typeof profile?.height_cm === "number" && Number.isFinite(profile.height_cm)
                  ? units === "metric"
                    ? `${Math.round(profile.height_cm)} cm`
                    : formatHeightFromCm(profile.height_cm)
                  : "—"
              }
            />
            <InfoRow
              label="Weight"
              value={weightKg != null ? formatWeightFromKg(weightKg, 1, units === "metric" ? "metric" : "us") : "—"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow
              label="Body fat %"
              value={bfPct != null ? `${bfPct.toFixed(1)}%` : "—"}
            />
            <InfoRow
              label="BMI"
              value={
                typeof scan.estimate?.bmi === "number" && Number.isFinite(scan.estimate.bmi)
                  ? scan.estimate.bmi.toFixed(1)
                  : "—"
              }
            />
            <InfoRow
              label="BMR"
              value={computedGoals.bmr != null ? `${Math.round(computedGoals.bmr)} kcal` : "—"}
            />
            <InfoRow
              label="TDEE"
              value={computedGoals.tdee != null ? `${Math.round(computedGoals.tdee)} kcal` : "—"}
            />
          </div>
        </CardContent>
      </Card>

      <ScanPhotos photoUrls={photoUrls} />

      <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Body composition</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Lean Body Mass"
              value={formatKgLb(leanMassKg, units)}
              hint={leanMassKg != null && weightKg != null ? `${Math.round((leanMassKg / weightKg) * 100)}% of weight` : undefined}
            />
            <MetricCard
              label="Skeletal Muscle Mass"
              value={formatKgLb(skeletalMuscleKg, units)}
              hint="Estimate"
            />
            <MetricCard
              label="Body Fat %"
              value={bfPct != null ? `${bfPct.toFixed(1)}%` : "—"}
            />
            <MetricCard
              label="Body Fat Mass"
              value={formatKgLb(fatMassKg, units)}
            />
            <MetricCard
              label="Total Body Water"
              value={
                totalBodyWaterKg != null
                  ? `${formatKgLbNumber(totalBodyWaterKg, units)}${totalBodyWaterPct != null ? ` · ${Math.round(totalBodyWaterPct)}%` : ""}`
                  : "—"
              }
              hint="Estimate"
            />
            <MetricCard
              label="Visceral fat"
              value={bfPct != null ? visceralLabel(bfPct, sex) : "—"}
              hint="Estimate"
            />
          </CardContent>
        </Card>

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CircleGauge
                label="Body age"
                value={bodyAge != null ? String(bodyAge) : "—"}
                sublabel={age != null ? `Actual: ${age}` : undefined}
                progress={bodyAge != null && age != null ? clampNumber(age / Math.max(bodyAge, 1), 0, 1) : null}
              />
              <CircleGauge
                label="Body score"
                value={bodyScore != null ? `${bodyScore.toFixed(1)}` : "—"}
                sublabel="out of 10"
                progress={bodyScore != null ? clampNumber(bodyScore / 10, 0, 1) : null}
              />
            </div>

            <div className="rounded-lg border bg-background/60 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Segmental analysis
              </div>
              <div className="mt-3 grid grid-cols-[1fr,auto,1fr] items-center gap-3">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Upper lean</span>
                    <span className="font-medium">
                      {leanMassKg != null ? formatKgLbNumber(leanMassKg * 0.55, units) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Lower lean</span>
                    <span className="font-medium">
                      {leanMassKg != null ? formatKgLbNumber(leanMassKg * 0.45, units) : "—"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-center">
                  <img
                    src={silhouetteFront}
                    alt="Body silhouette"
                    className="h-40 w-auto opacity-90"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">BMR</span>
                    <span className="font-medium">
                      {computedGoals.bmr != null ? `${Math.round(computedGoals.bmr)} kcal` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">TDEE</span>
                    <span className="font-medium">
                      {computedGoals.tdee != null ? `${Math.round(computedGoals.tdee)} kcal` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Your nutrition</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Calories"
              value={`${rangeText(computedGoals.calories)} kcal`}
              hint={computedGoals.tdee != null ? `TDEE ~${Math.round(computedGoals.tdee)} kcal` : undefined}
            />
            <MetricCard
              label="Protein"
              value={`${Math.round(computedGoals.proteinGrams)} g`}
              hint={`${Math.round(computedGoals.proteinPct)}%`}
            />
            <MetricCard
              label="Carbs"
              value={`${Math.round(computedGoals.carbsGrams)} g`}
              hint={`${Math.round(computedGoals.carbsPct)}%`}
            />
            <MetricCard
              label="Fat"
              value={`${Math.round(computedGoals.fatGrams)} g`}
              hint={`${Math.round(computedGoals.fatPct)}%`}
            />
          </CardContent>
        </Card>

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Coach recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm text-foreground">
              {recommendations.map((item, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {typeof scan.estimate?.notes === "string" && scan.estimate.notes.trim() ? (
              <>
                <Separator />
                <p className="text-xs text-muted-foreground">{scan.estimate.notes}</p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScanPhotos({
  photoUrls,
}: {
  photoUrls: Partial<Record<"front" | "back" | "left" | "right", string>>;
}) {
  const entries = (Object.entries(photoUrls) as Array<
    ["front" | "back" | "left" | "right", string]
  >).filter(([, url]) => typeof url === "string" && url.length > 0);
  if (!entries.length) return null;
  const label: Record<string, string> = {
    front: "Front",
    back: "Back",
    left: "Left",
    right: "Right",
  };
  return (
    <Card className="border bg-card/60">
      <CardHeader>
        <CardTitle className="text-lg">Your photos</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(([pose, url]) => (
          <a
            key={pose}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-lg border bg-background/60"
            aria-label={`Open ${label[pose] ?? pose} photo`}
          >
            <img
              src={url}
              alt={`${label[pose] ?? pose} photo`}
              loading="lazy"
              className="h-48 w-full object-cover transition group-hover:scale-[1.02]"
            />
            <div className="p-2 text-center text-xs font-medium text-muted-foreground">
              {label[pose] ?? pose}
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function CircleGauge({
  label,
  value,
  sublabel,
  progress,
}: {
  label: string;
  value: string;
  sublabel?: string;
  progress: number | null;
}) {
  const pct = progress != null ? clampNumber(progress, 0, 1) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = c - c * pct;
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
          <circle
            cx="42"
            cy="42"
            r={r}
            strokeWidth="8"
            className="fill-none stroke-muted"
          />
          <circle
            cx="42"
            cy="42"
            r={r}
            strokeWidth="8"
            className="fill-none stroke-primary"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={dash}
            strokeLinecap="round"
            transform="rotate(-90 42 42)"
          />
        </svg>
        <div>
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          {sublabel ? (
            <div className="text-xs text-muted-foreground">{sublabel}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatKgLb(valueKg: number | null, units: "metric" | "us") {
  if (valueKg == null || !Number.isFinite(valueKg)) return "—";
  const kg = valueKg;
  const lb = kgToLb(kg);
  return units === "metric"
    ? `${kg.toFixed(1)} kg · ${lb.toFixed(1)} lb`
    : `${lb.toFixed(1)} lb · ${kg.toFixed(1)} kg`;
}

function formatKgLbNumber(valueKg: number, units: "metric" | "us") {
  const kg = valueKg;
  const lb = kgToLb(kg);
  return units === "metric" ? `${kg.toFixed(1)} kg` : `${lb.toFixed(1)} lb`;
}

function clampNumber(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function mapToScore(min: number, max: number, value: number, lowerIsBetter: boolean) {
  const v = clampNumber((value - min) / (max - min), 0, 1);
  return lowerIsBetter ? 1 - v : v;
}

function rangeText(calories: number) {
  const base = Math.round(calories);
  const lo = Math.max(0, base - 50);
  const hi = base + 50;
  return `${lo.toLocaleString()}–${hi.toLocaleString()}`;
}

function visceralLabel(bfPct: number, sex: "male" | "female" | null) {
  // Lightweight heuristic label for display only.
  const thresholds = sex === "female" ? [30, 38] : [20, 28];
  if (bfPct < thresholds[0]!) return "Low";
  if (bfPct < thresholds[1]!) return "Moderate";
  return "High";
}

function defaultRecommendations(goals: ReturnType<typeof deriveNutritionGoals>): string[] {
  const protein = Math.round(goals.proteinGrams);
  const calories = Math.round(goals.calories);
  return [
    `Aim for ~${protein}g protein per day to support recovery.`,
    `Keep calories around ~${calories} kcal/day and adjust based on weekly progress.`,
    "Train 3–5x/week with progressive overload and prioritize sleep (7–9h).",
    "Hit a daily step baseline (e.g. 7–10k) to support energy balance.",
  ].slice(0, 5);
}
