import scanData from "@/demo/scan.json";
import mealsData from "@/demo/meals.json";
import coachData from "@/demo/coach.json";
import type { CoachProfile } from "@/lib/coach/types";

export type DemoEpochMs = number;

export type DemoScanMetrics = {
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
  updatedAt?: string;
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

export type DemoScanFixture = {
  id: string;
  status: string;
  takenAt?: string;
  completedAt: DemoEpochMs;
  createdAt: DemoEpochMs;
  updatedAt: DemoEpochMs;
  note?: string;
  notes?: string;
  method: string;
  confidence: number;
  thumbnails: Record<string, string>;
  metrics: {
    bodyFatPct: number;
    weightLb: number;
    weight_lb: number;
    weightKg: number | null;
    weight_kg?: number;
    bmi: number;
  };
  results: {
    bodyFatPct: number;
    weightLb: number;
    weight_kg?: number;
    bmi: number;
  };
  measurements: {
    bodyFatPct: number;
    weightLb: number;
    weightKg: number | null;
    bmi: number;
  };
  analysis: Record<string, unknown>;
  charged: true;
  mode: "4";
};

function toEpochMs(value: string | number | null | undefined): DemoEpochMs {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function lbToKg(lb: number): number | null {
  if (!Number.isFinite(lb)) return null;
  return Number((lb / 2.20462).toFixed(1));
}

function normalizeScan(entry: RawScanEntry): DemoScanFixture {
  const createdAtIso = entry.createdAt ?? entry.takenAt ?? entry.completedAt;
  const completedAtMs = toEpochMs(entry.completedAt);
  const createdAtMs = toEpochMs(createdAtIso);
  const updatedAtMs = toEpochMs(entry.updatedAt ?? entry.completedAt ?? createdAtIso);
  const weightKg = lbToKg(entry.metrics.weightLb);
  return {
    id: entry.id,
    status: entry.status ?? "complete",
    takenAt: entry.takenAt ?? entry.completedAt,
    completedAt: completedAtMs,
    createdAt: createdAtMs,
    updatedAt: updatedAtMs,
    charged: true,
    mode: "4",
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
export const DEMO_SCAN_HISTORY: DemoScanFixture[] = scanJson.history.map(normalizeScan);
export const DEMO_LATEST_SCAN: DemoScanFixture = normalizeScan(scanJson.latest);

export function getDemoScanById(id: string): DemoScanFixture | null {
  if (id === DEMO_LATEST_SCAN.id) return DEMO_LATEST_SCAN;
  return DEMO_SCAN_HISTORY.find((entry) => entry.id === id) ?? null;
}

export const DEMO_MEALS = mealsData as any;
export const DEMO_COACH_THREAD = coachData as any;

export const DEMO_USER_PROFILE: CoachProfile = {
  sex: "male",
  age: 34,
  height_cm: 178,
  heightCm: 178,
  weight_kg: 82.7,
  weightKg: 82.7,
  unit: "us",
  goal: "lose_fat",
  activity_level: "moderate",
  currentProgramId: "demo-balanced",
  activeProgramId: "demo-balanced",
  currentWeekIdx: 0,
  currentDayIdx: 1,
};

