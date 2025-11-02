const DAY = 24 * 60 * 60 * 1000;

function createDemoTimestamp(iso: string) {
  const date = new Date(iso);
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => new Date(date.getTime()),
    value: date,
  } as const;
}

const NOW = new Date("2024-05-15T12:00:00.000Z");

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function buildHistoryEntry(id: string, iso: string, metrics: { bodyFatPct: number; weightLb: number; bmi: number }) {
  const timestamp = createDemoTimestamp(iso);
  return {
    id,
    status: "completed" as const,
    charged: true,
    mode: "4" as const,
    completedAt: timestamp,
    createdAt: timestamp,
    takenAt: iso,
    metrics: {
      bodyFatPct: metrics.bodyFatPct,
      weight_lb: metrics.weightLb,
      bmi: metrics.bmi,
    },
  };
}

export const DEMO_SCAN_HISTORY = [
  buildHistoryEntry("demo-001", isoDaysAgo(58), { bodyFatPct: 23.1, weightLb: 184.2, bmi: 25.8 }),
  buildHistoryEntry("demo-002", isoDaysAgo(36), { bodyFatPct: 22.4, weightLb: 182.6, bmi: 25.5 }),
  buildHistoryEntry("demo-003", isoDaysAgo(12), { bodyFatPct: 22.1, weightLb: 181.9, bmi: 25.3 }),
] as const;

const LATEST_ISO = DEMO_SCAN_HISTORY[2]!.takenAt;
const CREATED_AT = createDemoTimestamp(LATEST_ISO);

export const DEMO_LATEST_RESULT = {
  id: "demo-003",
  status: "completed" as const,
  takenAt: LATEST_ISO,
  createdAt: CREATED_AT,
  completedAt: CREATED_AT,
  method: "photo" as const,
  notes: "Demo result. Read-only.",
  note: "Demo result. Read-only.",
  charged: true,
  metrics: {
    bodyFatPct: 22.1,
    weight_lb: 181.9,
    weightKg: 82.5,
    bmi: 25.3,
    waist_cm: 87.4,
    hip_cm: 98.9,
  },
  results: {
    bodyFatPct: 22.1,
    weightLb: 181.9,
    bmi: 25.3,
  },
  measurements: {
    waistCm: 87.4,
    hipCm: 98.9,
  },
  analysis: {
    waist_cm: 87.4,
    hip_cm: 98.9,
    neck_cm: 39.1,
  },
} as const;

export type DemoScanResult = typeof DEMO_LATEST_RESULT;

export const DEMO_COACH_MESSAGES = [
  {
    id: "welcome",
    text: "Coach, what should I focus on this month?",
    response:
      "Welcome to the demo! We'll keep things simple: aim for 0.7–1.0g protein per lb, strength train 3x/week, and walk 10–12k steps daily.",
    createdAt: new Date(NOW.getTime() - 2 * DAY),
    usedLLM: true,
  },
  {
    id: "followup",
    text: "Any nutrition reminders?",
    response: "Prioritize whole foods, track meals for awareness, and hydrate with ~3L water. Demo mode keeps everything read-only.",
    createdAt: new Date(NOW.getTime() - DAY),
    usedLLM: true,
  },
] as const;
