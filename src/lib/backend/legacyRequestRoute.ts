const LEGACY_HTTP_FUNCTIONS = new Set([
  "getPlan",
  "getWorkouts",
  "applyCatalogPlan",
  "generateWorkoutPlan",
  "applyCustomPlan",
  "updateWorkoutPlan",
  "setWorkoutPlanStatus",
  "markExerciseDone",
  "logWorkoutExercise",
  "weeklyReview",
  "addMeal",
  "deleteMeal",
]);

export function requestFunctionPath(name: string, native: boolean): string {
  if (!LEGACY_HTTP_FUNCTIONS.has(name)) return `/${name}`;
  // Hosting only rewrites /api/**. Native bundles can reach the standalone
  // HTTP functions directly without an extra gateway hop.
  return native ? `/${name}` : `/api/${name}`;
}

export function unwrapRequestFunctionResponse<T>(name: string, value: unknown): T {
  if (
    LEGACY_HTTP_FUNCTIONS.has(name) &&
    value &&
    typeof value === "object" &&
    "ok" in value &&
    value.ok === true &&
    "data" in value
  ) {
    return value.data as T;
  }
  return value as T;
}
