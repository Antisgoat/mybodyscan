import test from "node:test";
import assert from "node:assert/strict";

import {
  OPENAI_FEATURE_MODELS,
  modelForCoachMessage,
  modelForFeature,
} from "../lib/openai/models.js";
import { monthlyQuotaDocumentPath } from "../lib/middleware/monthlyQuota.js";

test("routes routine features to lower-cost models and preserves flagship body scans", () => {
  assert.equal(OPENAI_FEATURE_MODELS.coach, "gpt-5.6-luna");
  assert.equal(OPENAI_FEATURE_MODELS.gymInventory, "gpt-5.6-terra");
  assert.equal(OPENAI_FEATURE_MODELS.fridgeInventory, "gpt-5.6-terra");
  assert.equal(OPENAI_FEATURE_MODELS.fridgeMeals, "gpt-5.6-terra");
  assert.equal(OPENAI_FEATURE_MODELS.mealPhoto, "gpt-5.6-sol");
  assert.equal(OPENAI_FEATURE_MODELS.mealPhotoEscalation, "gpt-6-astra");
  assert.equal(OPENAI_FEATURE_MODELS.coachComplex, "gpt-5.6-terra");
  assert.equal(OPENAI_FEATURE_MODELS.workoutAdjustment, "gpt-5.6-terra");
  assert.equal(OPENAI_FEATURE_MODELS.workoutPlan, "gpt-5.6-sol");
  assert.equal(OPENAI_FEATURE_MODELS.bodyScan, "gpt-6-astra");
  assert.equal(OPENAI_FEATURE_MODELS.transformation, "gpt-image-2.5-sunburst");
});

test("escalates only coaching requests that need plan-level reasoning", () => {
  assert.equal(
    modelForCoachMessage("How many ounces are in a cup?"),
    "gpt-5.6-luna"
  );
  assert.equal(
    modelForCoachMessage("Adjust my workout because my shoulder is sore."),
    "gpt-5.6-terra"
  );
});

test("allows a narrow per-feature production override", () => {
  process.env.OPENAI_MODEL_COACH = "gpt-test-coach";
  assert.equal(modelForFeature("coach"), "gpt-test-coach");
  delete process.env.OPENAI_MODEL_COACH;
});

test("monthly quotas use private, sanitized, calendar-scoped documents", () => {
  assert.equal(
    monthlyQuotaDocumentPath(
      "member-1",
      "gym scans",
      new Date("2026-09-08T12:00:00Z")
    ),
    "users/member-1/private/monthlyQuota_gym_scans_2026-09"
  );
});
