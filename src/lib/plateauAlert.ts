import { extractScanMetrics } from "@/lib/scans";

export type PlateauGoal =
  | "lose_fat"
  | "gain_muscle"
  | "recomp"
  | "maintain"
  | "unknown";

export type PlateauScan = {
  id: string;
  date: Date | null;
  raw: unknown;
  showMetrics: boolean;
};

export type PlateauAlert = {
  signature: string;
  goal: Exclude<PlateauGoal, "maintain" | "unknown">;
  metric: "body_fat" | "weight";
  scanCount: number;
  spanDays: number;
  change: number;
  title: string;
  description: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizePlateauGoal(value: unknown): PlateauGoal {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["lose_fat", "fat_loss", "cut", "weight_loss"].includes(normalized)) {
    return "lose_fat";
  }
  if (["gain_muscle", "build_muscle", "hypertrophy", "bulk"].includes(normalized)) {
    return "gain_muscle";
  }
  if (["recomp", "body_recomposition"].includes(normalized)) return "recomp";
  if (["maintain", "maintenance", "general"].includes(normalized)) return "maintain";
  return "unknown";
}

/**
 * Finds a conservative, goal-aware plateau signal. It intentionally avoids
 * predictions: scan estimates fluctuate, so this is a prompt to review the
 * routine rather than a diagnosis or proof that progress has stopped.
 */
export function derivePlateauAlert(
  scans: PlateauScan[],
  goalValue: unknown
): PlateauAlert | null {
  const goal = normalizePlateauGoal(goalValue);
  if (goal === "unknown" || goal === "maintain") return null;

  const usable = scans
    .filter((scan) => scan.showMetrics && scan.date?.getTime())
    .map((scan) => ({
      ...scan,
      date: scan.date as Date,
      metrics: extractScanMetrics(scan.raw),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const preferBodyFat = goal === "lose_fat" || goal === "recomp";
  const bodyFatScans = usable.filter(
    (scan) => scan.metrics.bodyFatPercent != null
  );
  const weightScans = usable.filter((scan) => scan.metrics.weightKg != null);
  const metric = preferBodyFat && bodyFatScans.length >= 3 ? "body_fat" : "weight";
  if (goal === "recomp" && metric !== "body_fat") return null;

  const candidates = (metric === "body_fat" ? bodyFatScans : weightScans).slice(-5);
  if (candidates.length < 3) return null;
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (!first || !last) return null;
  const spanDays = Math.floor(
    (last.date.getTime() - first.date.getTime()) / DAY_MS
  );
  if (spanDays < 21) return null;

  const values = candidates.map((scan) =>
    metric === "body_fat"
      ? (scan.metrics.bodyFatPercent as number)
      : (scan.metrics.weightKg as number)
  );
  const start = values[0];
  const end = values[values.length - 1];
  if (start == null || end == null || start <= 0) return null;
  const range = Math.max(...values) - Math.min(...values);
  const change = end - start;
  const stable =
    metric === "body_fat"
      ? range <= 1
      : (range / start) * 100 <= 1.25;
  if (!stable) return null;

  const metricLabel = metric === "body_fat" ? "body-fat estimate" : "weight";
  return {
    signature: `${goal}:${metric}:${last.id}`,
    goal,
    metric,
    scanCount: candidates.length,
    spanDays,
    change,
    title: "Progress may be leveling off",
    description: `Your ${metricLabel} has stayed within a narrow range across ${candidates.length} scans over ${spanDays} days. Scan estimates can vary, so treat this as a check-in—not proof that progress has stopped.`,
  };
}
