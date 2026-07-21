import assert from "node:assert/strict";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "demo-test";

const { buildAnalysisFromResult, buildPlanMarkdown } = await import(
  "../lib/scan/analysis.js"
);
const { deriveDeterministicNutritionPlan, deriveDeterministicWorkoutPlan } =
  await import("../lib/scan/worker.js");

test("a valid visual estimate does not require model nutrition or workout JSON", () => {
  const analysis = buildAnalysisFromResult({
    estimate: { bodyFatPercent: 21, notes: "Visual estimate." },
  });
  assert.equal(analysis.estimate.bodyFatPercent, 21);
  assert.deepEqual(analysis.estimate.keyObservations, [
    "Photo quality was sufficient for a visual body composition estimate.",
  ]);
});

test("missing and invalid body fat remain hard failures", () => {
  assert.throws(
    () => buildAnalysisFromResult({ estimate: {} }),
    /invalid_body_fat_percent/
  );
  assert.throws(
    () => buildAnalysisFromResult({ estimate: { bodyFatPercent: 61 } }),
    /invalid_body_fat_percent/
  );
});

test("deterministic plans are complete and default to three training days", () => {
  const nutrition = deriveDeterministicNutritionPlan({
    currentWeightKg: 80,
    bodyFatPercent: 20,
  });
  assert.ok(
    nutrition.caloriesPerDay >= 1200 && nutrition.caloriesPerDay <= 4500
  );
  assert.ok(nutrition.proteinGrams > 0);
  assert.equal(nutrition.sampleDay.length, 4);
  assert.ok(nutrition.trainingDay && nutrition.restDay);

  const workout = deriveDeterministicWorkoutPlan({});
  assert.equal(workout.weeks.length, 8);
  assert.equal(workout.weeks[0].days.length, 3);
  assert.doesNotMatch(workout.summary, /6-day|push\/pull\/legs/i);
  assert.equal(
    deriveDeterministicWorkoutPlan({ training_days_per_week: 2 }).weeks[0].days
      .length,
    2
  );
  assert.equal(
    deriveDeterministicWorkoutPlan({ training_days_per_week: 4 }).weeks[0].days
      .length,
    4
  );
});

test("six-day PPL requires experience, resistance equipment, and no injuries", () => {
  const focuses = (profile) =>
    deriveDeterministicWorkoutPlan(profile).weeks[0].days.map(
      (day) => day.focus
    );
  const ppl = ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"];

  assert.notDeepEqual(
    focuses({
      training_days_per_week: 6,
      experience: "beginner",
      equipment: "full gym",
    }),
    ppl
  );
  assert.deepEqual(
    focuses({
      training_days_per_week: 6,
      experience: "intermediate",
      equipment: ["full_gym"],
      injuries: [],
    }),
    ppl
  );
  assert.notDeepEqual(
    focuses({
      training_days_per_week: 6,
      experience: "advanced",
      equipment: "bodyweight",
    }),
    ppl
  );
  assert.notDeepEqual(
    focuses({
      training_days_per_week: 6,
      experience: "intermediate",
      programPreferences: { equipment: "full gym" },
      injuries: ["knee"],
    }),
    ppl
  );
});

test("five-day beginners receive a balanced strength and recovery schedule", () => {
  const plan = deriveDeterministicWorkoutPlan({
    training_days_per_week: 5,
    experience: "beginner",
  });
  assert.deepEqual(
    plan.weeks[0].days.map((day) => day.focus),
    [
      "Upper",
      "Lower",
      "Full Body",
      "Low-impact conditioning",
      "Mobility/recovery",
    ]
  );
  assert.match(plan.summary, /mixed strength, conditioning, and recovery/i);
});

test("successful plan markdown never labels the estimate as fallback", () => {
  const estimate = buildAnalysisFromResult({
    estimate: { bodyFatPercent: 21 },
  }).estimate;
  const nutrition = deriveDeterministicNutritionPlan({
    currentWeightKg: 80,
    goalWeightKg: 75,
    bodyFatPercent: 21,
  });
  const workout = deriveDeterministicWorkoutPlan({});
  const markdown = buildPlanMarkdown({
    estimate,
    nutritionPlan: nutrition,
    workoutPlan: workout,
    recommendations: [],
    input: { currentWeightKg: 80, goalWeightKg: 75 },
    usedFallback: false,
  });
  assert.doesNotMatch(markdown, /fallback/i);
});
