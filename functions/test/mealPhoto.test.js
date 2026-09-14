import assert from "node:assert/strict";
import test from "node:test";
import {
  processMealPhoto,
  validateMealPhotoInput,
  validateMealEstimate,
} from "../lib/mealPhoto.js";

const data = {
  processingConsent: true,
  image: "data:image/jpeg;base64,/9j/AA==",
};
const result = {
  name: "Chicken and rice",
  protein: 30,
  carbs: 50,
  fat: 10,
  grams: 300,
  notes: "Portion and oil are uncertain.",
};
test("meal image rejects missing consent, remote URLs, invalid headers and oversized payloads", () => {
  for (const input of [
    { ...data, processingConsent: false },
    { ...data, image: "https://example.com/photo.jpg" },
    { ...data, image: "data:image/jpeg;base64,AAAA" },
    { ...data, image: `data:image/jpeg;base64,${"A".repeat(700000)}` },
  ])
    assert.throws(() => validateMealPhotoInput(input));
  assert.equal(validateMealPhotoInput(data), data.image);
});
test("meal output rejects invented or invalid totals", () => {
  for (const output of [
    { error: "no_meal" },
    { ...result, protein: -1 },
    { ...result, carbs: "50" },
    { ...result, fat: Infinity },
    { ...result, grams: 1 },
  ])
    assert.throws(() => validateMealEstimate(output));
  assert.equal(validateMealEstimate(result).reviewRequired, true);
});
test("auth, membership, off switch and quota all run before a paid request", async () => {
  const previous = process.env.MEAL_PHOTO_ENABLED;
  let calls = 0;
  const deps = {
    authorize: async () => {},
    limit: async () => {},
    analyze: async () => {
      calls++;
      return { data: result };
    },
  };
  try {
    process.env.MEAL_PHOTO_ENABLED = "true";
    await assert.rejects(processMealPhoto({ data }, deps), /Sign in/);
    await assert.rejects(
      processMealPhoto(
        { auth: { uid: "guest" }, data },
        {
          ...deps,
          authorize: async () => {
            throw new Error("not a member");
          },
        }
      ),
      /not a member/
    );
    await assert.rejects(
      processMealPhoto(
        { auth: { uid: "member" }, data },
        {
          ...deps,
          limit: async () => {
            throw new Error("quota");
          },
        }
      ),
      /quota/
    );
    process.env.MEAL_PHOTO_ENABLED = "false";
    await assert.rejects(
      processMealPhoto({ auth: { uid: "member" }, data }, deps),
      /not available yet/
    );
    assert.equal(calls, 0);
    process.env.MEAL_PHOTO_ENABLED = "true";
    const estimate = await processMealPhoto(
      { auth: { uid: "member" }, data },
      {
        ...deps,
        limit: async (config) => {
          assert.equal(config.limit, 3);
          assert.equal(config.windowMs, 86400000);
        },
      }
    );
    assert.equal(calls, 1);
    assert.equal(estimate.name, result.name);
    assert.ok(estimate.requestId);
  } finally {
    if (previous === undefined) delete process.env.MEAL_PHOTO_ENABLED;
    else process.env.MEAL_PHOTO_ENABLED = previous;
  }
});
