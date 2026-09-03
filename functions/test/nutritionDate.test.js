import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNutritionDate } from "../lib/lib/nutritionDate.js";

test("selected diary dates never shift across timezones or DST offsets", () => {
  for (const date of ["2026-09-01", "2026-01-01", "2026-03-08", "2024-02-29"]) {
    for (const offset of [-840, -330, 0, 240, 300, 720]) {
      assert.equal(normalizeNutritionDate(date, offset), date);
    }
  }
});

test("legacy timestamps convert to the member's calendar day", () => {
  assert.equal(normalizeNutritionDate("2026-09-02T02:00:00Z", 240), "2026-09-01");
  assert.equal(normalizeNutritionDate("2026-09-01T22:00:00Z", -330), "2026-09-02");
  assert.equal(normalizeNutritionDate("2026-09-01T23:00:00Z", 0), "2026-09-01");
  assert.equal(normalizeNutritionDate("2026-09-01T23:00:00Z", NaN), "2026-09-01");
});

test("invalid or rolled-over diary dates return an input error", () => {
  for (const value of [null, {}, "", "bad-date", "2026-02-29", "2026-02-30", "2026-13-01"]) {
    assert.throws(() => normalizeNutritionDate(value, 240), {code: "invalid-argument"});
  }
  assert.throws(() => normalizeNutritionDate("2026-09-01T23:00:00Z", 10000), {code: "invalid-argument"});
});
