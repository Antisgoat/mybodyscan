import assert from "node:assert/strict";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "demo-test";

const { buildAnalysisFromResult, buildPlanMarkdown } = await import("../lib/scan/analysis.js");
const { deriveDeterministicNutritionPlan, deriveDeterministicWorkoutPlan } = await import("../lib/scan/worker.js");

test("a valid visual estimate does not require model nutrition or workout JSON", () => {
  const analysis = buildAnalysisFromResult({ estimate: { bodyFatPercent: 21, notes: "Visual estimate." } });
  assert.equal(analysis.estimate.bodyFatPercent, 21);
  assert.deepEqual(analysis.estimate.keyObservations, [
    "Photo quality was sufficient for a visual body composition estimate.",
  ]);
});

test("missing and invalid body fat remain hard failures", () => {
  assert.throws(() => buildAnalysisFromResult({ estimate: {} }), /invalid_body_fat_percent/);
  assert.throws(() => buildAnalysisFromResult({ estimate: { bodyFatPercent: 61 } }), /invalid_body_fat_percent/);
});

test("deterministic plans are complete and default to three training days", () => {
  const nutrition = deriveDeterministicNutritionPlan({ currentWeightKg: 80, bodyFatPercent: 20 });
  assert.ok(nutrition.caloriesPerDay >= 1200 && nutrition.caloriesPerDay <= 4500);
  assert.ok(nutrition.proteinGrams > 0);
  assert.equal(nutrition.sampleDay.length, 4);
  assert.ok(nutrition.trainingDay && nutrition.restDay);

  const workout = deriveDeterministicWorkoutPlan({});
  assert.equal(workout.weeks.length, 8);
  assert.equal(workout.weeks[0].days.length, 3);
  assert.doesNotMatch(workout.summary, /6-day|push\/pull\/legs/i);
  assert.equal(deriveDeterministicWorkoutPlan({ trainingDaysPerWeek: 6 }).weeks[0].days.length, 6);
});

test("successful plan markdown never labels the estimate as fallback", () => {
  const estimate = buildAnalysisFromResult({ estimate: { bodyFatPercent: 21 } }).estimate;
  const nutrition = deriveDeterministicNutritionPlan({ currentWeightKg: 80, goalWeightKg: 75, bodyFatPercent: 21 });
  const workout = deriveDeterministicWorkoutPlan({});
  const markdown = buildPlanMarkdown({ estimate, nutritionPlan: nutrition, workoutPlan: workout, recommendations: [], input: { currentWeightKg: 80, goalWeightKg: 75 }, usedFallback: false });
  assert.doesNotMatch(markdown, /fallback/i);
});
