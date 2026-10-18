import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  FRIDGE_ANALYSIS_PROMPT,
  FRIDGE_MEAL_PROMPT,
  validateFridgeAnalysis,
  validateFridgeMealInventory,
} from "../functions/lib/fridgeMeals.js";
import {
  GYM_ANALYSIS_PROMPT,
  validateGymEquipmentAnalysis,
} from "../functions/lib/gymEquipment.js";
import { processMealPhoto } from "../functions/lib/mealPhoto.js";
import { structuredJsonChat } from "../functions/lib/openai/client.js";
import { modelForFeature } from "../functions/lib/openai/models.js";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || !value)
      throw new Error("Use --meal, --fridge, and --gym paths.");
    parsed[key] = resolve(value);
  }
  for (const key of ["meal", "fridge", "gym"]) {
    if (!parsed[key]) throw new Error(`Missing --${key} image path.`);
  }
  return parsed;
}

function imageDataUrl(path) {
  const extension = extname(path).toLowerCase();
  const mime = extension === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

async function analyzeFridge(image) {
  const { data, usage } = await structuredJsonChat({
    systemPrompt: FRIDGE_ANALYSIS_PROMPT,
    userContent: [
      {
        type: "text",
        text: "Review this view and return a conservative inventory.",
      },
      { type: "image_url", image_url: { url: image, detail: "high" } },
    ],
    temperature: 0.1,
    maxTokens: 1_200,
    reasoningEffort: "low",
    model: modelForFeature("fridgeInventory"),
    timeoutMs: 45_000,
    validate: validateFridgeAnalysis,
  });
  const ingredients = [...data.detected, ...data.uncertain]
    .filter((item) => item.confidence >= 0.35)
    .map((item) => item.name)
    .slice(0, 20);
  if (ingredients.length < 2)
    throw new Error("Fridge evaluation detected too few reviewable foods.");

  const mealResult = await structuredJsonChat({
    systemPrompt: FRIDGE_MEAL_PROMPT,
    userContent: JSON.stringify({
      confirmedIngredients: ingredients,
      preferences: {
        diet: "balanced",
        goal: "general wellness",
        allergies: [],
        servings: 2,
        shoppingMode: "staples",
      },
      shoppingGuidance:
        "Optional arrays may contain only water, cooking oil, salt, pepper, or dried seasonings.",
    }),
    temperature: 0.3,
    maxTokens: 1_800,
    reasoningEffort: "low",
    model: modelForFeature("fridgeMeals"),
    timeoutMs: 45_000,
    validate: (value) =>
      validateFridgeMealInventory(value, ingredients, "staples", []),
  });
  return { inventory: data, inventoryUsage: usage, meals: mealResult.data };
}

async function analyzeGym(image) {
  const { data, usage } = await structuredJsonChat({
    systemPrompt: GYM_ANALYSIS_PROMPT,
    userContent: [
      {
        type: "text",
        text: "Review this view and return a conservative equipment inventory.",
      },
      { type: "image_url", image_url: { url: image, detail: "high" } },
    ],
    temperature: 0.1,
    maxTokens: 900,
    reasoningEffort: "low",
    model: modelForFeature("gymInventory"),
    timeoutMs: 45_000,
    validate: validateGymEquipmentAnalysis,
  });
  if (data.detected.length + data.uncertain.length < 1) {
    throw new Error("Gym evaluation detected no reviewable equipment.");
  }
  return { ...data, usage };
}

async function analyzeMeal(image) {
  const result = await processMealPhoto(
    {
      auth: { uid: "offline-vision-eval" },
      data: {
        processingConsent: true,
        image,
        foodHint: "rice with chicken and vegetables",
      },
    },
    {
      authorize: async () => {},
      limit: async () => {},
      analyze: structuredJsonChat,
    }
  );
  const identity = `${result.name} ${result.notes}`.toLowerCase();
  if (
    !identity.includes("rice") ||
    !/carrot|vegetable|cabbage/.test(identity)
  ) {
    throw new Error("Meal evaluation missed visible rice or vegetables.");
  }
  return result;
}

const paths = parseArgs(process.argv.slice(2));
const startedAt = Date.now();
const [meal, fridge, gym] = await Promise.all([
  analyzeMeal(imageDataUrl(paths.meal)),
  analyzeFridge(imageDataUrl(paths.fridge)),
  analyzeGym(imageDataUrl(paths.gym)),
]);

console.log(
  JSON.stringify(
    {
      passed: true,
      elapsedMs: Date.now() - startedAt,
      models: {
        meal: modelForFeature("mealPhoto"),
        mealEscalation: modelForFeature("mealPhotoEscalation"),
        fridge: modelForFeature("fridgeInventory"),
        fridgeMeals: modelForFeature("fridgeMeals"),
        gym: modelForFeature("gymInventory"),
      },
      meal,
      fridge,
      gym,
    },
    null,
    2
  )
);
