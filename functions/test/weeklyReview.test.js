import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyRecommendation } from "../lib/weeklyReview.js";

function inputs(overrides = {}) {
  return {
    hunger: 3,
    energy: 3,
    sleep: 3,
    soreness: 2,
    stress: 3,
    adherence: 85,
    trend: "on_track",
    goal: "lose_fat",
    notes: null,
    localDate: "2026-07-27",
    dayId: "Mon",
    ...overrides,
  };
}

test("weekly review does not change calories when adherence is low", () => {
  const result = buildWeeklyRecommendation(
    inputs({ adherence: 60, trend: "stalled" })
  );
  assert.equal(result.calorieDelta, 0);
  assert.match(result.reasons.join(" "), /consistency/i);
});

test("weekly review makes only a small loss-target adjustment", () => {
  const result = buildWeeklyRecommendation(
    inputs({ adherence: 90, trend: "stalled", goal: "lose_fat" })
  );
  assert.equal(result.calorieDelta, -100);
  assert.ok(Math.abs(result.calorieDelta) <= 100);
});

test("high hunger prevents an automatic calorie reduction", () => {
  const result = buildWeeklyRecommendation(
    inputs({
      adherence: 95,
      trend: "stalled",
      goal: "lose_fat",
      hunger: 5,
    })
  );
  assert.equal(result.calorieDelta, 0);
});

test("poor recovery reduces workout stress and adds a pain caution", () => {
  const result = buildWeeklyRecommendation(
    inputs({ sleep: 2, energy: 2, soreness: 5 })
  );
  assert.equal(result.intensityDelta, -1);
  assert.equal(result.volumeDelta, -1);
  assert.match(result.caution ?? "", /medical guidance/i);
});
