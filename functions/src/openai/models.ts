export const OPENAI_FEATURE_MODELS = {
  coach: "gpt-5.6-luna",
  gymInventory: "gpt-5.6-luna",
  fridgeInventory: "gpt-5.6-luna",
  fridgeMeals: "gpt-5.6-terra",
  mealPhoto: "gpt-5.6-terra",
  workoutAdjustment: "gpt-5.6-luna",
  workoutPlan: "gpt-5.6-terra",
  bodyScan: "gpt-5.6-sol",
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
