/**
 * Shared scan analysis helpers (OpenAI + sanitization).
 */
import { getStorage } from "../firebase.js";
import {
  OpenAIClientError,
  structuredJsonChat,
  type ChatContentPart,
} from "../openai/client.js";
import type { EngineConfig } from "./engineConfig.js";
import type { ScanEstimate, ScanNutritionPlan, ScanWorkoutPlan } from "../types.js";

const storage = getStorage();
const POSES = ["front", "back", "left", "right"] as const;
// Vision + structured output can take longer on cold starts / busy periods.
// Keep this comfortably below the function timeout so we can still map errors cleanly.
const OPENAI_TIMEOUT_MS = 90000;

type Pose = (typeof POSES)[number];

type OpenAIResult = {
  estimate?: Partial<ScanEstimate>;
  workoutPlan?: Partial<ScanWorkoutPlan>;
  nutritionPlan?: Partial<ScanNutritionPlan>;
  recommendations?: unknown;
  goalRecommendations?: unknown;
  keyObservations?: unknown;
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
  const bmiCategory =
    typeof source?.bmiCategory === "string"
      ? source.bmiCategory.trim()
      : typeof source?.bmi_category === "string"
        ? source.bmi_category.trim()
        : null;
  const keyObservationsRaw =
    (Array.isArray(source?.keyObservations) ? source.keyObservations : null) ??
    (Array.isArray(source?.key_observations) ? source.key_observations : null) ??
    [];
  const keyObservations = (keyObservationsRaw as unknown[])
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/^[\u2022\-*\d.]+\s*/, "").trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 5);
  const goalRecommendations = sanitizeRecommendations(
    (source as any)?.goalRecommendations ?? (source as any)?.goal_recommendations
  );
  return {
    bodyFatPercent: Number(bodyFatPercent.toFixed(1)),
    bmi,
    notes,
    bmiCategory,
    keyObservations,
    goalRecommendations,
  };
}

function sanitizeWorkout(raw: Partial<ScanWorkoutPlan> | undefined): ScanWorkoutPlan {
  const weeks = Array.isArray(raw?.weeks) ? raw.weeks : [];
  const progressionRules = Array.isArray((raw as any)?.progressionRules)
    ? (raw as any).progressionRules
    : [];
  const cleanedRules = progressionRules
    .map((rule: any) => (typeof rule === "string" ? rule.trim() : ""))
    .filter((rule: string) => rule.length > 0)
    .slice(0, 6);
  return {
    summary:
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "Personalized training plan",
    progressionRules:
      cleanedRules.length > 0
        ? cleanedRules
        : [
            "Add reps weekly until you hit the top of the range.",
            "Increase load 2–5% once all sets hit the top range.",
            "Deload every 4–6 weeks if performance stalls.",
          ],
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
  const adjustmentRules = Array.isArray(source?.adjustmentRules)
    ? source.adjustmentRules
    : Array.isArray(source?.adjustments)
      ? source.adjustments
      : [];
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

  const cleanedAdjustments = adjustmentRules
    .map((rule: any) => (typeof rule === "string" ? rule.trim() : ""))
    .filter((rule: string) => rule.length > 0)
    .slice(0, 6);

  return {
    caloriesPerDay: Math.round(calories),
    proteinGrams: Math.round(protein),
    carbsGrams: Math.round(carbs),
    fatsGrams: Math.round(fats),
    adjustmentRules:
      cleanedAdjustments.length > 0
        ? cleanedAdjustments
        : [
            "If weekly change is <0.25 kg, reduce calories by 150–200.",
            "If losing >1% body weight/week, add 150–200 calories.",
            "Keep protein steady; adjust carbs/fats first.",
          ],
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
    goalRecommendations: (payload as any).goalRecommendations ?? (payload as any).goal_recommendations,
    keyObservations: (payload as any).keyObservations ?? (payload as any).key_observations,
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
  requestId: string,
  engine: EngineConfig
): Promise<OpenAIResult> {
  const systemPrompt = [
    "You are a fitness coach who analyzes body photos to estimate body fat percentage, BMI, and training needs.",
    "Respond with strict JSON matching:",
    [
      "{",
      '  "estimate": {',
      '    "bodyFatPercent": number,',
      '    "bmi": number|null,',
      '    "bmiCategory": string|null,',
      '    "notes": string,',
      '    "keyObservations": string[],',
      '    "goalRecommendations": string[]',
      "  },",
      '  "workoutPlan": { "summary": string, "progressionRules": string[], "weeks": Week[] },',
      '  "nutritionPlan": { "caloriesPerDay": number, "proteinGrams": number, "carbsGrams": number, "fatsGrams": number, "adjustmentRules": string[], "sampleDay": Meal[] },',
      '  "recommendations": string[]',
      "}",
    ].join("\n"),
    "Workout plans should default to a 6-day push/pull/legs split with a rest day (8-week horizon).",
    "Nutrition plans must include macro targets plus clear adjustment rules.",
    "Use concise language for an intermediate trainee.",
  ].join("\n");

  const userText = [
    `Current weight: ${input.currentWeightKg} kg`,
    `Goal weight: ${input.goalWeightKg} kg`,
    "Use the four photos (front, back, left, right) to inform the estimate and plans.",
    "BMI can be null if unreliable. Notes must remind this is only an estimate.",
    "Key observations should capture posture/muscle balance/general notes (no medical diagnosis).",
    "Goal recommendations should give actionable habit changes (bullets).",
    "Workout plan should span multiple weeks with daily splits and include progressionRules (3-6 bullets).",
    "Nutrition plan must include daily calories/macros, adjustmentRules (3-6 bullets), and a sample day of meals.",
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
    model: engine.model,
    apiKey: engine.apiKey,
    baseUrl: engine.baseUrl ?? undefined,
    validate: validateVisionPayload,
  });

  return data;
}

export function buildAnalysisFromResult(raw: OpenAIResult): ParsedAnalysis {
  try {
    const estimate = sanitizeEstimate(raw.estimate);
    const workoutPlan = sanitizeWorkout(raw.workoutPlan);
    const nutritionPlan = sanitizeNutrition(raw.nutritionPlan);
    const primaryRecommendations = sanitizeRecommendations(
      raw.goalRecommendations ?? raw.recommendations
    );
    const fallbackRecommendations = sanitizeRecommendations(raw.recommendations);
    const recommendations = primaryRecommendations.length ? primaryRecommendations : fallbackRecommendations;
    return { estimate, workoutPlan, nutritionPlan, recommendations };
  } catch (error) {
    throw new Error(`openai_parse_failed:${(error as Error)?.message ?? "unknown"}`);
  }
}

export function buildPlanMarkdown(params: {
  estimate: ScanEstimate;
  workoutPlan: ScanWorkoutPlan;
  nutritionPlan: ScanNutritionPlan;
  recommendations: string[];
  input: { currentWeightKg: number; goalWeightKg: number };
  usedFallback?: boolean;
}): string {
  const lines: string[] = [];
  const lean = Number.isFinite(params.estimate.leanMassKg ?? NaN)
    ? `${params.estimate.leanMassKg?.toFixed(1)} kg lean mass (est.)`
    : null;
  const fat = Number.isFinite(params.estimate.fatMassKg ?? NaN)
    ? `${params.estimate.fatMassKg?.toFixed(1)} kg fat mass (est.)`
    : null;
  const bodyFat = params.estimate.bodyFatPercent;
  const lowRange = Math.max(3, bodyFat - 1.5).toFixed(1);
  const highRange = Math.min(60, bodyFat + 1.5).toFixed(1);

  lines.push("# Scan Results");
  lines.push("");
  lines.push("## Body Metrics");
  lines.push(`- Current weight: ${params.input.currentWeightKg} kg`);
  lines.push(`- Goal weight: ${params.input.goalWeightKg} kg`);
  if (lean) lines.push(`- ${lean}`);
  if (fat) lines.push(`- ${fat}`);
  lines.push("");
  lines.push("## Estimated Body Fat Range");
  lines.push(
    `- Visual estimate: ${bodyFat.toFixed(1)}% (${lowRange}–${highRange}% range${
      params.usedFallback ? ", fallback" : ""
    })`
  );
  lines.push(`- Notes: ${params.estimate.notes}`);
  lines.push("");
  lines.push("## BMI");
  lines.push(
    params.estimate.bmi != null
      ? `- BMI: ${params.estimate.bmi.toFixed(1)}`
      : "- BMI: Not enough data to provide BMI reliably."
  );
  if (params.estimate.bmiCategory) {
    lines.push(`- BMI category: ${params.estimate.bmiCategory}`);
  }
  if (params.estimate.keyObservations?.length) {
    lines.push("");
    lines.push("## Key observations");
    params.estimate.keyObservations.slice(0, 5).forEach((obs) => lines.push(`- ${obs}`));
  }
  if (params.estimate.goalRecommendations?.length) {
    lines.push("");
    lines.push("## Goal recommendations");
    params.estimate.goalRecommendations.slice(0, 5).forEach((rec) => lines.push(`- ${rec}`));
  }
  lines.push("");
  lines.push("## 8-Week Workout Program");
  const weekCount = params.workoutPlan.weeks?.length ?? 0;
  lines.push(`- Programming weeks available: ${weekCount || "coach generated as needed"}`);
  const renderWeeks = params.workoutPlan.weeks?.slice(0, 8) ?? [];
  if (!renderWeeks.length) {
    lines.push("- Weeks 1-8: Push/Pull/Legs rotation with 4-6 days per week. Progress load weekly.");
  } else {
    for (const week of renderWeeks) {
      lines.push(`- Week ${week.weekNumber}:`);
      for (const day of week.days.slice(0, 7)) {
        const exerciseSummary = day.exercises
          .slice(0, 5)
          .map((ex) => `${ex.name} ${ex.sets}×${ex.reps}`)
          .join("; ");
        lines.push(
          `  - ${day.day || "Day"} (${day.focus || "Focus"}): ${exerciseSummary || "See app for details"}`
        );
      }
    }
  }
  const rules = params.workoutPlan.progressionRules?.slice(0, 6) ?? [];
  if (rules.length) {
    lines.push("  - Progression rules:");
    for (const rule of rules) {
      lines.push(`    - ${rule}`);
    }
  }
  lines.push("");
  lines.push("## Nutrition Targets (Macros)");
  lines.push(
    `- Daily targets: ${params.nutritionPlan.caloriesPerDay} kcal · ${params.nutritionPlan.proteinGrams}g protein · ${params.nutritionPlan.carbsGrams}g carbs · ${params.nutritionPlan.fatsGrams}g fats`
  );
  lines.push("- Adjustment rules:");
  const adjustments = params.nutritionPlan.adjustmentRules?.slice(0, 6) ?? [];
  adjustments.forEach((rule) => lines.push(`  - ${rule}`));
  if (params.nutritionPlan.sampleDay?.length) {
    lines.push("- Sample day:");
    params.nutritionPlan.sampleDay.slice(0, 5).forEach((meal) => {
      lines.push(
        `  - ${meal.mealName}: ${meal.description || ""} (${meal.calories} kcal · ${meal.proteinGrams}P/${meal.carbsGrams}C/${meal.fatsGrams}F)`
      );
    });
  }
  if (params.recommendations.length) {
    lines.push("");
    lines.push("### Quick habits");
    params.recommendations.forEach((tip) => lines.push(`- ${tip}`));
  }
  return lines.join("\n");
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
