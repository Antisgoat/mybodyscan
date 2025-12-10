import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getScan, type ScanDocument } from "@/lib/api/scan";
import { scanStatusLabel } from "@/lib/scanStatus";

const REFRESH_INTERVAL_MS = 7000;

export default function ScanResultPage() {
  const { scanId = "" } = useParams();
  const nav = useNavigate();
  const [scan, setScan] = useState<ScanDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const needsRefresh = useMemo(() => {
    if (!scan) return false;
    return scan.status === "pending" || scan.status === "processing";
  }, [scan]);

  useEffect(() => {
    let cancelled = false;
    async function fetchScan() {
      try {
        const result = await getScan(scanId);
        if (cancelled) return;
        if (!result.ok) {
          const debugSuffix = result.error.debugId ? ` (ref ${result.error.debugId.slice(0, 8)})` : "";
          setError(result.error.message + debugSuffix);
          setLoading(false);
          return;
        }
        setScan(result.data);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("scanResult: unexpected fetch error", err);
        setError("Unable to load scan.");
        setLoading(false);
      }
    }

    fetchScan();
    if (needsRefresh) {
      const id = setInterval(fetchScan, REFRESH_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [scanId, needsRefresh]);

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
        <button className="rounded border px-3 py-2 text-sm" onClick={() => nav("/scan")}>Back to Scan</button>
      </div>
    );
  }

  const statusMeta = scanStatusLabel(scan.status, scan.completedAt ?? scan.updatedAt ?? scan.createdAt);

  if (statusMeta.canonical === "error" || statusMeta.recommendRescan) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm text-red-700">{statusMeta.label}</p>
        <p className="text-xs text-red-700/90">
          {scan.errorMessage || statusMeta.helperText || "We couldn't complete this scan."}
        </p>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-2 text-sm" onClick={() => nav("/scan")}>Try again</button>
          <button className="rounded border px-3 py-2 text-sm" onClick={() => nav("/history")}>History</button>
        </div>
      </div>
    );
  }

  if (!statusMeta.showMetrics) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-sm">{statusMeta.label}</p>
        <p className="text-xs text-muted-foreground">{statusMeta.helperText}</p>
        <div className="h-2 w-1/2 animate-pulse bg-black/10" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Scan result</h1>
        <p className="text-sm text-muted-foreground">
          Generated on {scan.updatedAt.toLocaleString()} from your recent photos.
        </p>
      </header>

      {scan.estimate && (
        <section className="rounded-lg border p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Body composition</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric label="Body fat" value={`${scan.estimate.bodyFatPercent.toFixed(1)}%`} />
            <Metric label="BMI" value={scan.estimate.bmi != null ? scan.estimate.bmi.toFixed(1) : "—"} />
            <Metric label="Goal" value={`${scan.input.goalWeightKg.toFixed(1)} kg`} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{scan.estimate.notes}</p>
        </section>
      )}

      {scan.workoutPlan && (
        <section className="space-y-3 rounded-lg border p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Workout plan</h2>
          <p className="text-sm text-muted-foreground">{scan.workoutPlan.summary}</p>
          <div className="space-y-3">
            {scan.workoutPlan.weeks.map((week) => (
              <div key={week.weekNumber} className="rounded-md border p-3">
                <h3 className="text-sm font-semibold">Week {week.weekNumber}</h3>
                <div className="mt-2 space-y-2">
                  {week.days.map((day) => (
                    <div key={`${week.weekNumber}-${day.day}`} className="rounded border p-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{day.day}</span>
                        <span className="text-muted-foreground">{day.focus}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {day.exercises.map((ex, idx) => (
                          <li key={`${ex.name}-${idx}`} className="flex flex-col rounded bg-muted/40 p-2">
                            <span className="font-semibold">{ex.name}</span>
                            <span className="text-xs text-muted-foreground">{ex.sets} sets · {ex.reps}</span>
                            {ex.notes && <span className="text-xs text-muted-foreground">{ex.notes}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {scan.nutritionPlan && (
        <section className="space-y-3 rounded-lg border p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Nutrition plan</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Calories" value={`${scan.nutritionPlan.caloriesPerDay} kcal`} />
            <Metric label="Protein" value={`${scan.nutritionPlan.proteinGrams} g`} />
            <Metric label="Carbs" value={`${scan.nutritionPlan.carbsGrams} g`} />
            <Metric label="Fats" value={`${scan.nutritionPlan.fatsGrams} g`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Sample day</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {scan.nutritionPlan.sampleDay.map((meal, idx) => (
                <div key={`${meal.mealName}-${idx}`} className="rounded border p-3">
                  <div className="text-sm font-semibold">{meal.mealName}</div>
                  <p className="text-sm text-muted-foreground">{meal.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {meal.calories} kcal · P {meal.proteinGrams}g · C {meal.carbsGrams}g · F {meal.fatsGrams}g
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <button className="rounded border px-3 py-2 text-sm" onClick={() => nav("/scan")}>New scan</button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => nav("/history")}>History</button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
