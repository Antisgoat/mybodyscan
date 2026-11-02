import { describe, it, expect } from "vitest";
import { readMealPhotoEstimate, mealPhotoPortion } from "./mealPhotoReview";

const estimate = {
  name: "Meal",
  notes: "Review oil",
  requestId: "request-1",
  confidence: 0.8,
  grams: 300,
  protein: 20,
  carbs: 50,
  fat: 10,
};

describe("meal photo review", () => {
  it("validates only expected fields and trims visible strings", () => {
    expect(
      readMealPhotoEstimate({ ...estimate, name: " Meal ", extra: "ignored" })
    ).toEqual(estimate);
  });
  it.each([
    null,
    {},
    { ...estimate, confidence: NaN },
    { ...estimate, protein: "20" },
    { ...estimate, carbs: -1 },
    { ...estimate, fat: Infinity },
    { ...estimate, grams: 1 },
    { ...estimate, requestId: "<script>" },
  ])("rejects malformed network results %#", (value) => {
    expect(() => readMealPhotoEstimate(value)).toThrow();
  });
  it("scales half, whole and double portions deterministically", () => {
    expect(mealPhotoPortion(estimate, 50)).toEqual({
      protein: 10,
      carbs: 25,
      fat: 5,
      calories: 185,
    });
    expect(mealPhotoPortion(estimate, 100).calories).toBe(370);
    expect(mealPhotoPortion(estimate, 200).calories).toBe(740);
  });
  it.each([0, -1, 30, NaN, Infinity])(
    "rejects unsupported portion %s",
    (percent) => {
      expect(() => mealPhotoPortion(estimate, percent)).toThrow();
    }
  );
});
