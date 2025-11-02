import scanData from "@/demo/scan.json";
import mealsData from "@/demo/meals.json";
import coachData from "@/demo/coach.json";

export type DemoTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
};

function toTimestamp(iso: string | undefined): DemoTimestamp {
  const date = iso ? new Date(iso) : new Date();
  const seconds = Math.floor(date.getTime() / 1000);
  return {
    seconds,
    nanoseconds: (date.getTime() - seconds * 1000) * 1e6,
    toDate: () => new Date(date.getTime()),
  };
}

type DemoScanMetrics = {
  bodyFatPct: number;
  weightLb: number;
  bmi: number;
};

type RawScanEntry = {
  id: string;
  status?: string;
  takenAt?: string;
  completedAt: string;
  createdAt?: string;
  notes?: string;
  metrics: DemoScanMetrics;
  thumbnails?: Record<string, string>;
  method?: string;
  confidence?: number;
};

type ScanJson = {
  latest: RawScanEntry;
  history: RawScanEntry[];
};

function normalizeScan(entry: RawScanEntry) {
  const createdAt = entry.createdAt ?? entry.takenAt ?? entry.completedAt;
  const weightKg = Number.isFinite(entry.metrics.weightLb)
    ? Number((entry.metrics.weightLb / 2.20462).toFixed(1))
    : null;
  return {
    id: entry.id,
    status: entry.status ?? "completed",
    takenAt: entry.takenAt ?? entry.completedAt,
    completedAt: toTimestamp(entry.completedAt),
    createdAt: toTimestamp(createdAt),
    charged: true,
    mode: "4" as const,
    note: entry.notes,
    notes: entry.notes,
    metrics: {
      bodyFatPct: entry.metrics.bodyFatPct,
      weightLb: entry.metrics.weightLb,
      weight_lb: entry.metrics.weightLb,
      weightKg,
      weight_kg: weightKg ?? undefined,
      bmi: entry.metrics.bmi,
    },
    results: {
      bodyFatPct: entry.metrics.bodyFatPct,
      weightLb: entry.metrics.weightLb,
      weight_kg: weightKg ?? undefined,
      bmi: entry.metrics.bmi,
    },
    measurements: {
      bodyFatPct: entry.metrics.bodyFatPct,
      weightLb: entry.metrics.weightLb,
      weightKg,
      bmi: entry.metrics.bmi,
    },
    method: entry.method ?? "photo",
    confidence: entry.confidence ?? 0.86,
    analysis: {},
    thumbnails: entry.thumbnails ?? {},
  };
}

const scanJson = scanData as ScanJson;

const normalizedHistory = scanJson.history.map(normalizeScan);
export const demoScanHistory = normalizedHistory;
export const demoLatestScan = normalizeScan(scanJson.latest);

export function getDemoScanById(id: string) {
  if (id === demoLatestScan.id) return demoLatestScan;
  return normalizedHistory.find((entry) => entry.id === id) ?? null;
}

export const demoMeals = mealsData;

export const demoCoach = coachData;
