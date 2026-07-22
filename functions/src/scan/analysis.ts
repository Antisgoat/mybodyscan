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
import type {
  ScanEstimate,
  ScanNutritionPlan,
  ScanWorkoutPlan,
} from "../types.js";
import { scanPhotosPrefix } from "./paths.js";
import { isValidBodyFatPercent } from "./contract.js";

const storage = getStorage();
const POSES = ["front", "back", "left", "right"] as const;
// Vision + structured output can take longer on cold starts / busy periods.
// Keep this comfortably below the function timeout so we can still map errors cleanly.
const OPENAI_TIMEOUT_MS = 90_000;

type Pose = (typeof POSES)[number];

type OpenAIResult = {
  estimate?: Partial<ScanEstimate>;
  recommendations?: unknown;
  improvementAreas?: unknown;
};

type ParsedAnalysis = {
  estimate: ScanEstimate;
  recommendations: string[];
  improvementAreas: string[];
};

const VISUAL_OBSERVATION_KEYS = [
  "muscularDevelopment",
  "upperBodyDevelopment",
  "lowerBodyDevelopment",
  "midsectionDefinition",
  "postureObservation",
  "balanceObservation",
  "strongestAreas",
  "priorityAreas",
  "shouldersChest",
  "arms",
  "torsoCore",
  "hips",
  "legs",
] as const;

const UNSUPPORTED_PHOTO_HEALTH_CLAIM =
  /\b(diagnos(?:is|ed)|injur(?:y|ed)|tear|disease|disorder|syndrome|condition|scoliosis|kyphosis|lordosis|inflammation|hernia|surgery|tumou?r|lesion|fracture|arthritis|pain|visceral|subcutaneous|internal\s+(?:fat|tissue|organ))\b/i;
const UNSUPPORTED_PHOTO_MEASUREMENT =
  /\d+(?:\.\d+)?\s*(?:%|percent\b|kg\b|kilograms?\b|lb\b|lbs\b|pounds?\b)/i;

function sanitizePhotoObservationText(
  value: unknown,
  maxLength = 160
): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  if (
    !text ||
    UNSUPPORTED_PHOTO_HEALTH_CLAIM.test(text) ||
    UNSUPPORTED_PHOTO_MEASUREMENT.test(text)
  ) {
    return null;
  }
  return text;
}

function sanitizeVisualObservations(
  raw: unknown
): NonNullable<ScanEstimate["visualObservations"]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const cleaned: NonNullable<ScanEstimate["visualObservations"]> = {};
  for (const key of VISUAL_OBSERVATION_KEYS) {
    const text = sanitizePhotoObservationText(source[key]);
    if (!text) continue;
    cleaned[key] = text;
  }
  return cleaned;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function sanitizeEstimate(
  raw: Partial<ScanEstimate> | undefined
): ScanEstimate {
  const source = raw as any;
  const rawBodyFatPercent = Number(
    raw?.bodyFatPercent ?? source?.body_fat ?? source?.bodyFat
  );
  if (!isValidBodyFatPercent(rawBodyFatPercent)) {
    throw new Error("invalid_body_fat_percent");
  }
  const bodyFatPercent = rawBodyFatPercent;
  const bmiRaw = Number(source?.bmi);
  const bmi =
    Number.isFinite(bmiRaw) && bmiRaw > 0 ? Number(bmiRaw.toFixed(1)) : null;
  const notes =
    sanitizePhotoObservationText(source?.notes, 400) ??
    "Visual estimate only. Not medical advice.";
  const bmiCategory =
    typeof source?.bmiCategory === "string"
      ? source.bmiCategory.trim()
      : typeof source?.bmi_category === "string"
        ? source.bmi_category.trim()
        : null;
  const keyObservationsRaw =
    (Array.isArray(source?.keyObservations) ? source.keyObservations : null) ??
    (Array.isArray(source?.key_observations)
      ? source.key_observations
      : null) ??
    [];
  const keyObservations = (keyObservationsRaw as unknown[])
    .map((entry) =>
      typeof entry === "string"
        ? entry.replace(/^[\u2022\-*\d.]+\s*/, "").trim()
        : ""
    )
    .map((entry) => sanitizePhotoObservationText(entry))
    .filter((entry): entry is string => entry != null)
    .slice(0, 5);
  const goalRecommendations = sanitizeRecommendations(
    (source as any)?.goalRecommendations ??
      (source as any)?.goal_recommendations
  );
  const visualObservations = sanitizeVisualObservations(
    source?.visualObservations ?? source?.visual_observations
  );
  return {
    bodyFatPercent: Number(bodyFatPercent.toFixed(1)),
    bmi,
    notes,
    bmiCategory,
    keyObservations: keyObservations.length
      ? keyObservations
      : [
          "Photo quality was sufficient for a visual body composition estimate.",
        ],
    goalRecommendations: goalRecommendations.length
      ? goalRecommendations
      : [
          "Use consistent training, nutrition, sleep, and periodic scans to track progress.",
        ],
    ...(Object.keys(visualObservations).length > 0
      ? { visualObservations }
      : {}),
  };
}

function sanitizeWorkout(
  raw: Partial<ScanWorkoutPlan> | undefined
): ScanWorkoutPlan {
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
  const caloriesRaw = Number(raw?.caloriesPerDay ?? source?.calories_per_day);
  const proteinRaw = Number(raw?.proteinGrams ?? source?.protein_grams);
  const carbsRaw = Number(raw?.carbsGrams ?? source?.carbs_grams);
  const fatsRaw = Number(raw?.fatsGrams ?? source?.fats_grams);
  if (
    !Number.isFinite(caloriesRaw) ||
    caloriesRaw < 800 ||
    caloriesRaw > 8000
  ) {
    throw new Error("invalid_calories");
  }
  if (!Number.isFinite(proteinRaw) || proteinRaw <= 0) {
    throw new Error("invalid_protein");
  }
  if (
    !Number.isFinite(carbsRaw) ||
    carbsRaw < 0 ||
    !Number.isFinite(fatsRaw) ||
    fatsRaw < 0
  ) {
    throw new Error("invalid_macros");
  }
  const calories = clamp(caloriesRaw, 1000, 6000);
  const protein = Math.max(0, proteinRaw);
  const carbs = Math.max(0, carbsRaw);
  const fats = Math.max(0, fatsRaw);
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

  const sanitizeDay = (
    dayRaw: any,
    fallback: {
      calories: number;
      proteinGrams: number;
      carbsGrams: number;
      fatsGrams: number;
    }
  ) => {
    const day = {
      calories: clamp(
        Number(dayRaw?.calories ?? dayRaw?.caloriesPerDay ?? dayRaw?.kcal),
        800,
        8000
      ),
      proteinGrams: Number(
        dayRaw?.proteinGrams ?? dayRaw?.protein ?? fallback.proteinGrams
      ),
      carbsGrams: Number(
        dayRaw?.carbsGrams ?? dayRaw?.carbs ?? fallback.carbsGrams
      ),
      fatsGrams: Number(dayRaw?.fatsGrams ?? dayRaw?.fat ?? fallback.fatsGrams),
    };
    return {
      calories: Math.round(
        Number.isFinite(day.calories) ? day.calories : fallback.calories
      ),
      proteinGrams: Math.round(
        Number.isFinite(day.proteinGrams)
          ? day.proteinGrams
          : fallback.proteinGrams
      ),
      carbsGrams: Math.round(
        Number.isFinite(day.carbsGrams) ? day.carbsGrams : fallback.carbsGrams
      ),
      fatsGrams: Math.round(
        Number.isFinite(day.fatsGrams) ? day.fatsGrams : fallback.fatsGrams
      ),
    };
  };

  const baseDay = {
    calories: Math.round(calories),
    proteinGrams: Math.round(protein),
    carbsGrams: Math.round(carbs),
    fatsGrams: Math.round(fats),
  };

  const restFallback = {
    calories: clamp(baseDay.calories - 150, 800, 8000),
    proteinGrams: baseDay.proteinGrams,
    carbsGrams: Math.max(0, Math.round(baseDay.carbsGrams * 0.85)),
    fatsGrams: Math.max(0, Math.round(baseDay.fatsGrams + 8)),
  };

  return {
    caloriesPerDay: Math.round(calories),
    proteinGrams: Math.round(protein),
    carbsGrams: Math.round(carbs),
    fatsGrams: Math.round(fats),
    trainingDay: sanitizeDay(
      source?.trainingDay ?? source?.training_day,
      baseDay
    ),
    restDay: sanitizeDay(source?.restDay ?? source?.rest_day, restFallback),
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
    recommendations: payload.recommendations,
    improvementAreas:
      (payload as any).improvementAreas ?? (payload as any).improvement_areas,
  };
}

export async function buildImageInputs(
  uid: string,
  paths: Record<Pose, string>
): Promise<Array<{ pose: Pose; dataUrl: string; contentType: string }>> {
  const bucket = storage.bucket();
  const prefix = scanPhotosPrefix(uid);
  const results = await Promise.all(
    POSES.map(async (pose) => {
      const path = paths[pose];
      if (!path || !path.startsWith(prefix)) {
        throw new Error(`invalid_photo_path_${pose}`);
      }
      const file = bucket.file(path);
      try {
        // Download is the fastest "exists + read" check; it will throw if missing.
        const [[metadata], [buffer]] = await Promise.all([
          file.getMetadata(),
          file.download(),
        ]);
        const contentType =
          typeof metadata?.contentType === "string" &&
          metadata.contentType.startsWith("image/")
            ? metadata.contentType
            : "image/jpeg";
        const base64 = buffer.toString("base64");
        const dataUrl = `data:${contentType};base64,${base64}`;
        return { pose, dataUrl, contentType };
      } catch (err: any) {
        // Normalize to the worker's existing error mapping.
        throw new Error(`missing_photo_${pose}`);
      }
    })
  );
  return results;
}

export async function callOpenAI(
  images: Array<{ pose: Pose; dataUrl: string }>,
  input: {
    currentWeightKg: number;
    goalWeightKg: number;
    uid: string;
    heightCm?: number | null;
  },
  requestId: string,
  engine: EngineConfig
): Promise<OpenAIResult> {
  const systemPrompt = [
    "You analyze four body photos to provide a cautious visual body-fat estimate and observations. Do not diagnose medical conditions.",
    "Respond with strict JSON matching:",
    [
      "{",
      '  "estimate": {',
      '    "bodyFatPercent": number,',
      '    "notes": string,',
      '    "keyObservations": string[],',
      '    "goalRecommendations": string[],',
      '    "visualObservations": {',
      '      "muscularDevelopment": string,',
      '      "upperBodyDevelopment": string,',
      '      "lowerBodyDevelopment": string,',
      '      "midsectionDefinition": string,',
      '      "postureObservation": string,',
      '      "balanceObservation": string,',
      '      "strongestAreas": string,',
      '      "priorityAreas": string,',
      '      "shouldersChest": string,',
      '      "arms": string,',
      '      "torsoCore": string,',
      '      "hips": string,',
      '      "legs": string',
      "    }",
      "  },",
      '  "recommendations": string[],',
      '  "improvementAreas": string[]',
      "}",
    ].join("\n"),
    "Return only the visual estimate; the server computes BMI, nutrition, and training plans deterministically.",
  ].join("\n");

  const userText = [
    `Current weight: ${input.currentWeightKg} kg`,
    `Goal weight: ${input.goalWeightKg} kg`,
    ...(Number.isFinite(input.heightCm ?? NaN) && (input.heightCm as number) > 0
      ? [`Height: ${(input.heightCm as number).toFixed(0)} cm`]
      : []),
    "Use all four photos (front, back, left, right) to inform only the visual estimate.",
    "Notes must remind this is only an estimate.",
    "Key observations should capture posture/muscle balance/general notes (no medical diagnosis).",
    "For visualObservations, describe only what is visibly apparent with cautious qualitative wording.",
    "Region values may describe visible development, visual balance, or training priority; never give regional fat or muscle amounts.",
    "Do not infer injuries, health conditions, internal tissue, or exact regional composition from photos.",
    "Provide improvementAreas as 3-5 short bullets on what to work on first.",
    "Goal recommendations should give actionable habit changes (bullets).",
    "Recommendations must be 3-5 short, safe next-step bullets (no numbering).",
    "Respond with JSON only. Do not include markdown fences.",
  ].join("\n");

  const imageParts: ChatContentPart[] = images.map(({ dataUrl }) => ({
    type: "image_url" as const,
    // Speed-first: "low" significantly reduces latency/cost for 4-image inputs.
    image_url: { url: dataUrl, detail: "low" as const },
  }));
  const userContent: ChatContentPart[] = [
    { type: "text", text: userText },
    ...imageParts,
  ];

  const { data } = await structuredJsonChat<OpenAIResult>({
    systemPrompt,
    userContent,
    temperature: 0.4,
    maxTokens: 1_100,
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
    const primaryRecommendations = sanitizeRecommendations(
      raw.estimate?.goalRecommendations ?? raw.recommendations
    );
    const fallbackRecommendations = sanitizeRecommendations(
      raw.recommendations
    );
    const recommendations = primaryRecommendations.length
      ? primaryRecommendations
      : fallbackRecommendations;
    const improvementAreas = sanitizeRecommendations(
      (raw as any).improvementAreas ??
        raw.estimate?.keyObservations ??
        raw.estimate?.goalRecommendations ??
        raw.recommendations
    ).flatMap((entry) => {
      const safe = sanitizePhotoObservationText(entry);
      return safe ? [safe] : [];
    });
    return {
      estimate,
      recommendations: recommendations.length
        ? recommendations
        : [
            "Follow the generated nutrition and training targets consistently, then reassess.",
          ],
      improvementAreas: improvementAreas.length
        ? improvementAreas
        : [
            "Build consistency with progressive training, recovery, and nutrition.",
          ],
    };
  } catch (error) {
    throw new Error(
      `openai_parse_failed:${(error as Error)?.message ?? "unknown"}`
    );
  }
}

export function buildPlanMarkdown(params: {
  estimate: ScanEstimate;
  workoutPlan: ScanWorkoutPlan;
  nutritionPlan: ScanNutritionPlan;
  recommendations: string[];
  improvementAreas?: string[];
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
  const trainingDay = params.nutritionPlan.trainingDay ?? {
    calories: params.nutritionPlan.caloriesPerDay,
    proteinGrams: params.nutritionPlan.proteinGrams,
    carbsGrams: params.nutritionPlan.carbsGrams,
    fatsGrams: params.nutritionPlan.fatsGrams,
  };
  const restDay = params.nutritionPlan.restDay ?? {
    calories: Math.max(
      1200,
      Math.round(params.nutritionPlan.caloriesPerDay - 150)
    ),
    proteinGrams: params.nutritionPlan.proteinGrams,
    carbsGrams: Math.max(0, Math.round(params.nutritionPlan.carbsGrams * 0.85)),
    fatsGrams: Math.max(0, Math.round(params.nutritionPlan.fatsGrams + 8)),
  };

  lines.push("# 8-Week Body Plan");
  lines.push("");
  lines.push("## 1) Body Metrics Snapshot");
  lines.push(`- Current weight: ${params.input.currentWeightKg} kg`);
  lines.push(`- Goal weight: ${params.input.goalWeightKg} kg`);
  lines.push(
    `- Visual body fat: ${bodyFat.toFixed(1)}% (${lowRange}–${highRange}% range${
      params.usedFallback ? ", fallback" : ""
    })`
  );
  if (fat) lines.push(`- Fat mass (est.): ${fat}`);
  if (lean) lines.push(`- Lean mass (est.): ${lean}`);
  lines.push(
    params.estimate.bmi != null
      ? `- BMI: ${params.estimate.bmi.toFixed(1)}${
          params.estimate.bmiCategory ? ` (${params.estimate.bmiCategory})` : ""
        }`
      : "- BMI: Not enough data to provide BMI reliably."
  );
  lines.push(`- Notes: ${params.estimate.notes}`);
  if (params.estimate.keyObservations?.length) {
    lines.push("- Key observations:");
    params.estimate.keyObservations
      .slice(0, 5)
      .forEach((obs) => lines.push(`  - ${obs}`));
  }
  if (params.improvementAreas?.length) {
    lines.push("- Improvement areas:");
    params.improvementAreas
      .slice(0, 5)
      .forEach((area) => lines.push(`  - ${area}`));
  }

  lines.push("");
  lines.push("## 2) Training Plan");
  lines.push(`- Summary: ${params.workoutPlan.summary}`);
  const weekCount = params.workoutPlan.weeks?.length ?? 0;
  lines.push(
    `- Programming weeks available: ${weekCount || "coach generated as needed"}`
  );
  const renderWeeks = params.workoutPlan.weeks?.slice(0, 8) ?? [];
  if (!renderWeeks.length) {
    lines.push(
      "- Detailed training days are only shown after a matched plan is available."
    );
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
    lines.push("- Progression rules:");
    for (const rule of rules) {
      lines.push(`  - ${rule}`);
    }
  }

  lines.push("");
  lines.push("## 3) Nutrition Plan");
  lines.push(
    `- Baseline: ${params.nutritionPlan.caloriesPerDay} kcal · ${params.nutritionPlan.proteinGrams}g protein · ${params.nutritionPlan.carbsGrams}g carbs · ${params.nutritionPlan.fatsGrams}g fats`
  );
  lines.push(
    `- Training day: ${trainingDay.calories} kcal · ${trainingDay.proteinGrams}P/${trainingDay.carbsGrams}C/${trainingDay.fatsGrams}F`
  );
  lines.push(
    `- Rest day: ${restDay.calories} kcal · ${restDay.proteinGrams}P/${restDay.carbsGrams}C/${restDay.fatsGrams}F`
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

  lines.push("");
  lines.push("## 4) Notes + Next Steps");
  if (params.recommendations.length) {
    params.recommendations.forEach((tip) => lines.push(`- ${tip}`));
  }
  lines.push("- Re-scan in 4–6 weeks to track progress.");
  lines.push("- Estimates only. Not medical advice.");
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
