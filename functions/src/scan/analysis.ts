/**
 * Shared scan analysis helpers (OpenAI + sanitization).
 */
import { getStorage } from "../firebase.js";
import { hasOpenAI } from "../lib/env.js";
import {
  OpenAIClientError,
  structuredJsonChat,
  type ChatContentPart,
} from "../openai/client.js";
import type { ScanEstimate, ScanNutritionPlan, ScanWorkoutPlan } from "../types.js";

const storage = getStorage();
const POSES = ["front", "back", "left", "right"] as const;
const OPENAI_MODEL = "gpt-4o-mini";
// Vision + structured output can take longer on cold starts / busy periods.
// Keep this comfortably below the function timeout so we can still map errors cleanly.
const OPENAI_TIMEOUT_MS = 60000;

type Pose = (typeof POSES)[number];

type OpenAIResult = {
  estimate?: Partial<ScanEstimate>;
  workoutPlan?: Partial<ScanWorkoutPlan>;
  nutritionPlan?: Partial<ScanNutritionPlan>;
  recommendations?: unknown;
};

type ParsedAnalysis = {
  estimate: ScanEstimate;
  workoutPlan: ScanWorkoutPlan;
  nutritionPlan: ScanNutritionPlan;
  recommendations: string[];
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function sanitizeEstimate(raw: Partial<ScanEstimate> | undefined): ScanEstimate {
  const source = raw as any;
  const bodyFatPercent = clamp(
    Number(raw?.bodyFatPercent ?? source?.body_fat ?? source?.bodyFat),
    3,
    60
  );
  const bmiRaw = Number(source?.bmi);
  const bmi =
    Number.isFinite(bmiRaw) && bmiRaw > 0 ? Number(bmiRaw.toFixed(1)) : null;
  const notes =
    typeof source?.notes === "string" && source.notes.trim()
      ? source.notes.trim().slice(0, 400)
      : "Visual estimate only. Not medical advice.";
  return {
    bodyFatPercent: Number(bodyFatPercent.toFixed(1)),
    bmi,
    notes,
  };
}

function sanitizeWorkout(raw: Partial<ScanWorkoutPlan> | undefined): ScanWorkoutPlan {
  const weeks = Array.isArray(raw?.weeks) ? raw.weeks : [];
  return {
    summary:
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "Personalized training plan",
    weeks: weeks.map((week, index) => ({
      weekNumber:
        typeof (week as any)?.weekNumber === "number"
          ? (week as any).weekNumber
          : index + 1,
      days: Array.isArray((week as any)?.days)
        ? (week as any).days.map((day: any) => ({
            day: typeof day?.day === "string" ? day.day : "Day",
            focus: typeof day?.focus === "string" ? day.focus : "Full body",
            exercises: Array.isArray(day?.exercises)
              ? day.exercises.map((ex: any) => ({
                  name: typeof ex?.name === "string" ? ex.name : "Exercise",
                  sets: Number.isFinite(ex?.sets) ? Number(ex.sets) : 3,
                  reps: typeof ex?.reps === "string" ? ex.reps : "8-12",
                  notes: typeof ex?.notes === "string" ? ex.notes : undefined,
                }))
              : [],
          }))
        : [],
    })),
  };
}

function sanitizeNutrition(
  raw: Partial<ScanNutritionPlan> | undefined
): ScanNutritionPlan {
  const source = raw as any;
  const calories = clamp(
    Number(raw?.caloriesPerDay ?? source?.calories_per_day),
    1000,
    6000
  );
  const protein = Math.max(
    0,
    Number(raw?.proteinGrams ?? source?.protein_grams ?? 0)
  );
  const carbs = Math.max(0, Number(raw?.carbsGrams ?? source?.carbs_grams ?? 0));
  const fats = Math.max(0, Number(raw?.fatsGrams ?? source?.fats_grams ?? 0));
  const sampleDayRaw = Array.isArray(raw?.sampleDay) ? raw?.sampleDay : [];
  const sampleDay = sampleDayRaw.map((meal: any) => ({
    mealName: typeof meal?.mealName === "string" ? meal.mealName : "Meal",
    description: typeof meal?.description === "string" ? meal.description : "",
    calories: Number.isFinite(meal?.calories) ? Number(meal.calories) : 0,
    proteinGrams: Number.isFinite(meal?.proteinGrams)
      ? Number(meal.proteinGrams)
      : 0,
    carbsGrams: Number.isFinite(meal?.carbsGrams) ? Number(meal.carbsGrams) : 0,
    fatsGrams: Number.isFinite(meal?.fatsGrams) ? Number(meal.fatsGrams) : 0,
  }));

  return {
    caloriesPerDay: Math.round(calories),
    proteinGrams: Math.round(protein),
    carbsGrams: Math.round(carbs),
    fatsGrams: Math.round(fats),
    sampleDay,
  };
}

function sanitizeRecommendations(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/^[\u2022\-*\d.]+\s*/, "").trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 5)
    .map((entry) => entry.slice(0, 180));
  return cleaned;
}

function validateVisionPayload(raw: unknown): OpenAIResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_analysis_payload");
  }
  const payload = raw as Record<string, unknown>;
  const coerce = (value: unknown) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  return {
    estimate: coerce(payload.estimate),
    workoutPlan: coerce(payload.workoutPlan),
    nutritionPlan: coerce(payload.nutritionPlan),
    recommendations: payload.recommendations,
  };
}

export async function buildImageInputs(
  uid: string,
  paths: Record<Pose, string>
): Promise<Array<{ pose: Pose; url: string }>> {
  const bucket = storage.bucket();
  const entries: Array<{ pose: Pose; url: string }> = [];
  for (const pose of POSES) {
    const path = paths[pose];
    if (!path || !path.startsWith(`user_uploads/${uid}/scans/`)) {
      throw new Error(`invalid_photo_path_${pose}`);
    }
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`missing_photo_${pose}`);
    }
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });
    entries.push({ pose, url });
  }
  return entries;
}

export async function callOpenAI(
  images: Array<{ pose: Pose; url: string }>,
  input: { currentWeightKg: number; goalWeightKg: number; uid: string },
  requestId: string
): Promise<OpenAIResult> {
  if (!hasOpenAI()) {
    throw new OpenAIClientError(
      "openai_missing_key",
      401,
      "Scan engine not configured."
    );
  }
  const systemPrompt = [
    "You are a fitness coach who analyzes body photos to estimate body fat percentage and BMI.",
    'Respond with JSON matching {"estimate": ScanEstimate, "workoutPlan": ScanWorkoutPlan, "nutritionPlan": ScanNutritionPlan, "recommendations": string[]}.',
    "Use concise language and realistic programming for an intermediate trainee.",
  ].join("\n");

  const userText = [
    `Current weight: ${input.currentWeightKg} kg`,
    `Goal weight: ${input.goalWeightKg} kg`,
    "Use the four photos (front, back, left, right) to inform the estimate and plans.",
    "BMI can be null if unreliable. Notes must remind this is only an estimate.",
    "Workout plan should span multiple weeks with daily splits.",
    "Nutrition plan must include daily calories/macros and a sample day of meals.",
    "Recommendations must be 3-5 short bullets (no numbering), focused on next steps for training and nutrition.",
    "Respond with JSON only. Do not include markdown fences.",
  ].join("\n");

  const imageParts: ChatContentPart[] = images.map(({ url }) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));
  const userContent: ChatContentPart[] = [
    { type: "text", text: userText },
    ...imageParts,
  ];

  const { data } = await structuredJsonChat<OpenAIResult>({
    systemPrompt,
    userContent,
    temperature: 0.4,
    maxTokens: 900,
    userId: input.uid,
    requestId,
    timeoutMs: OPENAI_TIMEOUT_MS,
    model: OPENAI_MODEL,
    validate: validateVisionPayload,
  });

  return data;
}

export function buildAnalysisFromResult(raw: OpenAIResult): ParsedAnalysis {
  try {
    const estimate = sanitizeEstimate(raw.estimate);
    const workoutPlan = sanitizeWorkout(raw.workoutPlan);
    const nutritionPlan = sanitizeNutrition(raw.nutritionPlan);
    const recommendations = sanitizeRecommendations(raw.recommendations);
    return { estimate, workoutPlan, nutritionPlan, recommendations };
  } catch (error) {
    throw new Error(`openai_parse_failed:${(error as Error)?.message ?? "unknown"}`);
  }
}

export function deriveErrorReason(error: unknown): string {
  if (error instanceof OpenAIClientError) {
    return error.code;
  }
  if (error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  const message = (error as Error)?.message;
  return typeof message === "string" && message
    ? message.slice(0, 80)
    : "unknown_error";
}

export { OpenAIClientError };
