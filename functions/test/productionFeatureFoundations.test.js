import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "demo-test";

const { buildTransformationPrompt } = await import(
  "../lib/transformationPreview.js"
);
const { buildPlateauMulticastMessage, deriveServerPlateauSignature } = await import(
  "../lib/pushNotifications.js"
);
const {
  fromOpenFoodFacts,
  fromUsdaFood,
  nutritionHttpErrorResponse,
} = await import(
  "../lib/nutritionSearch.js"
);
const { HttpError } = await import("../lib/util/http.js");
const { inferCoachAdaptation } = await import("../lib/coachChat.js");
const { applyWorkoutAdjustment, resolveAdjustmentDate } = await import(
  "../lib/workouts.js"
);

test("transformation prompt is restrained and prohibits predictive or revealing output", () => {
  const prompt = buildTransformationPrompt({
    goal: "recomp",
    timelineWeeks: 12,
  });
  assert.match(prompt, /realistic/i);
  assert.match(prompt, /not as a guaranteed outcome/i);
  assert.match(prompt, /fully clothed/i);
  assert.match(prompt, /same smile or serious expression/i);
  assert.match(prompt, /Do not beautify.*change the face/i);
  assert.match(prompt, /Do not add.*measurements/i);
  assert.doesNotMatch(prompt, /exact body fat|exact weight/i);
});

test("USDA labeled serving nutrients are converted before being shown per 100 g", () => {
  const item = fromUsdaFood({
    fdcId: 123,
    description: "Branded chicken",
    servingSize: 50,
    servingSizeUnit: "g",
    householdServingFullText: "1 piece (50 g)",
    labelNutrients: {
      calories: { value: 100 },
      protein: { value: 10 },
      carbohydrates: { value: 2 },
      fat: { value: 5 },
    },
    foodNutrients: [],
  });
  assert.equal(item.basePer100g.kcal, 200);
  assert.equal(item.basePer100g.protein, 20);
  assert.equal(item.per_serving.kcal, 100);
  assert.equal(item.serving.text, "1 piece (50 g)");
});

test("liquid servings preserve labeled milliliters without assuming density", () => {
  const item = fromOpenFoodFacts({
    code: "0123456789012",
    product_name: "Test drink",
    serving_size: "0.25 l",
    nutriments: {
      "energy-kcal_100g": 40,
      proteins_100g: 0,
      carbohydrates_100g: 10,
      fat_100g: 0,
      "energy-kcal_serving": 100,
      proteins_serving: 0,
      carbohydrates_serving: 25,
      fat_serving: 0,
    },
  });
  assert.equal(item.serving.qty, 250);
  assert.equal(item.serving.unit, "ml");
  assert.equal(item.per_serving.kcal, 100);

  const incomplete = fromOpenFoodFacts({
    code: "0123456789013",
    product_name: "Drink without serving nutrients",
    serving_size: "250 ml",
    nutriments: {
      "energy-kcal_100g": 40,
      carbohydrates_100g: 10,
    },
  });
  assert.equal(incomplete.serving.qty, 250);
  assert.equal(incomplete.per_serving.kcal, null);
});

test("coach recovery language adapts workouts but severe symptoms do not auto-mutate plans", () => {
  assert.deepEqual(inferCoachAdaptation("My shoulder is very sore today"), {
    bodyFeel: "sore",
  });
  assert.deepEqual(
    inferCoachAdaptation("I played pickleball after work"),
    {
      bodyFeel: "tired",
      mods: { intensity: 0, volume: -1 },
      extraActivity: true,
    }
  );
  assert.equal(
    inferCoachAdaptation("I have sharp pain and numbness in my arm"),
    null
  );
});

test("daily workout adjustments change both volume and intensity guidance", () => {
  const adjusted = applyWorkoutAdjustment(
    {
      day: "Mon",
      exercises: [
        { id: "bench", name: "Bench press", sets: 3, reps: "8-12 @ RPE 7" },
      ],
    },
    { intensity: -1, volume: -1 }
  );
  assert.equal(adjusted.exercises[0].sets, 2);
  assert.equal(adjusted.exercises[0].reps, "8-12 @ RPE 6");
  assert.match(adjusted.coachGuidance, /5–10% less load/i);
});

test("a rest-day coach check-in schedules the adjustment for the next workout day", () => {
  assert.equal(
    resolveAdjustmentDate("2026-07-24", "Fri", "Mon"),
    "2026-07-27"
  );
  assert.equal(
    resolveAdjustmentDate("2026-07-24", "Fri", "Fri"),
    "2026-07-24"
  );
});

test("transformation preview requires the canonical Pro entitlement", () => {
  const source = readFileSync(
    new URL("../src/transformationPreview.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /await requireProEntitlement\(uid\)/);
  assert.doesNotMatch(source, /paidScan|eligible paid scan/);
});

test("nutrition subscription failures remain 403 instead of looking like upstream outages", () => {
  const response = nutritionHttpErrorResponse(
    new HttpError(403, "permission_denied", "subscription_required"),
    "request-id"
  );
  assert.equal(response.status, 403);
  assert.equal(response.body.reason, "subscription_required");
  assert.equal(response.body.code, "permission_denied");
});

test("server plateau detector uses current scan schema and rejects failed scans", () => {
  const timestamp = (day) => ({ toMillis: () => Date.UTC(2026, 0, 1 + day) });
  const valid = (id, day, bf) => ({
    id,
    data: {
      status: "complete",
      createdAt: timestamp(day),
      input: { currentWeightKg: 80 },
      estimate: { bodyFatPercent: bf },
      resultSource: "ai",
    },
  });
  assert.equal(
    deriveServerPlateauSignature(
      [valid("a", 0, 25), valid("b", 14, 24.8), valid("c", 28, 24.9)],
      "lose_fat"
    ),
    "lose_fat:body_fat:c"
  );
  const failed = valid("b", 14, 24.8);
  failed.data.usedFallback = true;
  assert.equal(
    deriveServerPlateauSignature(
      [valid("a", 0, 25), failed, valid("c", 28, 24.9)],
      "lose_fat"
    ),
    null
  );
});

test("plateau push uses data-only web delivery and visible APNs delivery", () => {
  const web = buildPlateauMulticastMessage("web", ["web-token"]);
  assert.equal(web.notification, undefined);
  assert.equal(web.data.url, "/history");

  const ios = buildPlateauMulticastMessage("ios", ["ios-token"]);
  assert.equal(ios.notification.title, "Progress check-in");
  assert.equal(ios.apns.payload.aps.sound, "default");
  assert.match(ios.notification.body, /coaching prompt/i);
});

test("RevenueCat credit grants keep bucket totals as the balance source of truth", () => {
  const source = readFileSync(
    new URL("../src/revenueCatWebhook.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /grantCreditBuckets/);
  assert.doesNotMatch(source, /currentCredits/);
  assert.doesNotMatch(source, /credits:\s*currentCredits/);
});

test("USDA search filters are sent as JSON arrays for search and barcode fallback", () => {
  const searchSource = readFileSync(
    new URL("../src/nutritionSearch.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    searchSource,
    /method:\s*"POST"[\s\S]*dataType:\s*USDA_DATA_TYPES/
  );
  assert.doesNotMatch(searchSource, /searchParams\.set\("dataType"/);

  const barcodeSource = readFileSync(
    new URL("../src/nutritionBarcode.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    barcodeSource,
    /method:\s*"POST"[\s\S]*dataType:\s*\["Branded"\]/
  );
  assert.doesNotMatch(barcodeSource, /searchParams\.set\("dataType"/);
});
