export const OPENAI_FEATURE_MODELS = {
  coach: "gpt-6-luna",
  gymInventory: "gpt-6.1-sol",
  fridgeInventory: "gpt-6.1-sol",
  fridgeMeals: "gpt-6.1-sol",
  mealPhoto: "gpt-6.1-sol",
  mealPhotoEscalation: "gpt-6-astra",
  coachComplex: "gpt-6.1-sol",
  workoutAdjustment: "gpt-6.1-sol",
  workoutPlan: "gpt-6.1-sol",
  bodyScan: "gpt-6-astra",
  transformation: "gpt-image-2.5-sunburst",
} as const;

export type OpenAIFeature = keyof typeof OPENAI_FEATURE_MODELS;

/**
 * Keep model routing explicit by workload. A per-feature environment override
 * lets production change one route without silently upgrading every request.
 */
export function modelForFeature(feature: OpenAIFeature): string {
  const key = `OPENAI_MODEL_${feature.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
  return (process.env[key] || "").trim() || OPENAI_FEATURE_MODELS[feature];
}

const COMPLEX_COACH_PATTERN =
  /\b(adjust|change|create|design|rebuild|revise|swap|plateau|program|plan|workout|training|macro|calorie|nutrition|diet|injur|pain|sore|recovery|deload)\b/i;

export function modelForCoachMessage(message: string): string {
  const normalized = message.trim();
  return COMPLEX_COACH_PATTERN.test(normalized) || normalized.length > 360
    ? modelForFeature("coachComplex")
    : modelForFeature("coach");
}
