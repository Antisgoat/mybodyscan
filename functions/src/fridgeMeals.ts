import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

import { requireProEntitlement } from "./lib/proEntitlements.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import {
  OpenAIClientError,
  structuredJsonChat,
  type ChatContentPart,
} from "./openai/client.js";
import { openAiSecretParam } from "./openai/keys.js";
import { onCallWithOptionalAppCheck } from "./util/callable.js";

export type FridgeIngredient = {
  name: string;
  confidence: number;
  evidence: string;
};

export type FridgeAnalysis = {
  detected: FridgeIngredient[];
  uncertain: FridgeIngredient[];
  notes: string;
};

export type FridgeMeal = {
  title: string;
  summary: string;
  uses: string[];
  optional: string[];
  steps: string[];
  estimatedMinutes: number;
  whyItFits: string;
  safetyNote: string;
};

export type FridgeMealSuggestions = { meals: FridgeMeal[]; notes: string };

const DATA_URL_PATTERN =
  /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_FRAMES = 4;
const MAX_FRAME_CHARS = 700_000;
const MAX_TOTAL_CHARS = 2_400_000;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function normalizeIngredient(value: unknown): FridgeIngredient | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 80);
  if (!name) return null;
  const number = Number(raw.confidence);
  const confidence = Number.isFinite(number)
    ? Math.max(0, Math.min(1, number))
    : 0;
  const evidence =
    cleanText(raw.evidence, 140) || "Visible in the submitted kitchen view.";
  return { name, confidence, evidence };
}

function uniqueIngredients(value: unknown, max = 30): FridgeIngredient[] {
  if (!Array.isArray(value)) return [];
  const ingredients = new Map<string, FridgeIngredient>();
  for (const item of value) {
    const normalized = normalizeIngredient(item);
    if (!normalized) continue;
    const key = normalized.name.toLocaleLowerCase("en-US");
    const previous = ingredients.get(key);
    if (!previous || normalized.confidence > previous.confidence) {
      ingredients.set(key, normalized);
    }
  }
  return Array.from(ingredients.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max);
}

export function validateFridgeAnalysis(value: unknown): FridgeAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_fridge_analysis");
  }
  const raw = value as Record<string, unknown>;
  const detected = uniqueIngredients(raw.detected);
  const detectedNames = new Set(
    detected.map((item) => item.name.toLocaleLowerCase("en-US"))
  );
  const uncertain = uniqueIngredients(raw.uncertain, 15).filter(
    (item) => !detectedNames.has(item.name.toLocaleLowerCase("en-US"))
  );
  return { detected, uncertain, notes: cleanText(raw.notes, 300) };
}

export function validateFridgeFrames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FRAMES) {
    throw new HttpsError(
      "invalid-argument",
      `Add between 1 and ${MAX_FRAMES} kitchen photos.`
    );
  }
  const frames = value.map((item) => cleanText(item, MAX_FRAME_CHARS + 1));
  if (
    frames.some(
      (frame) =>
        !frame ||
        frame.length > MAX_FRAME_CHARS ||
        !DATA_URL_PATTERN.test(frame)
    ) ||
    frames.reduce((sum, frame) => sum + frame.length, 0) > MAX_TOTAL_CHARS
  ) {
    throw new HttpsError(
      "invalid-argument",
      "One or more kitchen photos could not be processed. Try fewer photos."
    );
  }
  return frames;
}

export function normalizeConfirmedIngredients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, string>();
  for (const item of value) {
    const name = cleanText(item, 80);
    if (!name) continue;
    result.set(name.toLocaleLowerCase("en-US"), name);
  }
  return Array.from(result.values()).slice(0, 30);
}

function stringList(
  value: unknown,
  maxItems: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeMeal(value: unknown): FridgeMeal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const title = cleanText(raw.title, 90);
  const summary = cleanText(raw.summary, 220);
  const steps = stringList(raw.steps, 6, 180);
  if (!title || !summary || !steps.length) return null;
  const minuteNumber = Number(raw.estimatedMinutes);
  return {
    title,
    summary,
    uses: stringList(raw.uses, 15, 80),
    optional: stringList(raw.optional, 8, 80),
    steps,
    estimatedMinutes: Number.isFinite(minuteNumber)
      ? Math.max(5, Math.min(120, Math.round(minuteNumber)))
      : 25,
    whyItFits: cleanText(raw.whyItFits, 220),
    safetyNote:
      cleanText(raw.safetyNote, 220) ||
      "Confirm ingredients, labels, freshness, and cooking temperatures before eating.",
  };
}

export function validateFridgeMealSuggestions(
  value: unknown
): FridgeMealSuggestions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_fridge_meals");
  }
  const raw = value as Record<string, unknown>;
  const meals = Array.isArray(raw.meals)
    ? raw.meals
        .map(normalizeMeal)
        .filter((item): item is FridgeMeal => !!item)
        .slice(0, 3)
    : [];
  if (!meals.length) throw new Error("missing_fridge_meals");
  return { meals, notes: cleanText(raw.notes, 300) };
}

const ANALYSIS_PROMPT = [
  "You inspect refrigerator, freezer, pantry, and countertop photos to draft a food inventory.",
  "Ignore people, faces, addresses, receipts, screens, and other identifying details.",
  "Report only food or cooking ingredients clearly supported by the images.",
  "Use common ingredient names. Do not identify a brand unless its package name is plainly readable and necessary.",
  "Do not infer freshness, safety, expiration, allergens, nutrition values, quantities, or hidden package contents.",
  'Return JSON as {"detected":[{"name":"eggs","confidence":0.95,"evidence":"egg carton is visible"}],"uncertain":[{"name":"plain yogurt","confidence":0.45,"evidence":"partly obscured tub"}],"notes":"coverage note"}.',
  "Put clear items in detected and ambiguous items in uncertain. Confidence is 0 to 1.",
].join("\n");

export const analyzeFridge = onCallWithOptionalAppCheck(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    await requireProEntitlement(uid);
    await enforceRateLimit({
      uid,
      key: "analyzeFridge",
      limit: 6,
      windowMs: 60 * 60 * 1000,
    });
    const frames = validateFridgeFrames(request.data?.frames);
    const requestId = randomUUID();
    const content: ChatContentPart[] = [
      {
        type: "text",
        text: `Review all ${frames.length} photos together and return one deduplicated draft inventory.`,
      },
      ...frames.map((url): ChatContentPart => ({
        type: "image_url",
        image_url: { url, detail: "low" },
      })),
    ];
    try {
      const { data } = await structuredJsonChat<FridgeAnalysis>({
        systemPrompt: ANALYSIS_PROMPT,
        userContent: content,
        temperature: 0.1,
        maxTokens: 1_200,
        userId: uid,
        requestId,
        timeoutMs: 30_000,
        validate: validateFridgeAnalysis,
      });
      return { ...data, reviewRequired: true, requestId };
    } catch (error) {
      console.error("fridge_analysis_failed", {
        uid,
        requestId,
        code:
          error instanceof OpenAIClientError
            ? error.code
            : "fridge_analysis_failed",
        status: error instanceof OpenAIClientError ? error.status : 500,
      });
      throw new HttpsError(
        error instanceof OpenAIClientError && error.status === 429
          ? "resource-exhausted"
          : "unavailable",
        "We could not review those photos. Try clearer views or enter ingredients manually."
      );
    }
  },
  {
    region: "us-central1",
    secrets: [openAiSecretParam],
    timeoutSeconds: 60,
    memory: "512MiB",
  }
);

const MEAL_PROMPT = [
  "You create practical meal ideas from a member-confirmed ingredient list.",
  "Return exactly three distinct ideas. Favor confirmed ingredients but allow a short optional list of ordinary staples.",
  "Respect the stated diet and avoid ingredients matching stated allergies or restrictions.",
  "Never claim a meal is allergen-free or medically appropriate. Tell the member to verify every current package label and cross-contact statement.",
  "Never infer freshness or safety. Include ordinary food-safety guidance when raw meat, fish, poultry, or eggs are involved.",
  "Do not provide precise calories or macros because quantities and labels are unknown. Do not prescribe a medical diet.",
  'Return JSON as {"meals":[{"title":"...","summary":"...","uses":["..."],"optional":["..."],"steps":["..."],"estimatedMinutes":25,"whyItFits":"...","safetyNote":"..."}],"notes":"..."}.',
].join("\n");

export const suggestFridgeMeals = onCallWithOptionalAppCheck(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    await requireProEntitlement(uid);
    await enforceRateLimit({
      uid,
      key: "suggestFridgeMeals",
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
    const ingredients = normalizeConfirmedIngredients(
      request.data?.ingredients
    );
    if (!ingredients.length) {
      throw new HttpsError(
        "invalid-argument",
        "Confirm at least one ingredient first."
      );
    }
    const preferences = {
      diet: cleanText(request.data?.diet, 40) || "balanced",
      goal: cleanText(request.data?.goal, 40) || "general wellness",
      allergies: stringList(request.data?.allergies, 12, 40),
      allergyNotes: cleanText(request.data?.allergyNotes, 280),
      servings: Math.max(
        1,
        Math.min(8, Math.round(Number(request.data?.servings) || 2))
      ),
    };
    const requestId = randomUUID();
    try {
      const { data } = await structuredJsonChat<FridgeMealSuggestions>({
        systemPrompt: MEAL_PROMPT,
        userContent: JSON.stringify({
          confirmedIngredients: ingredients,
          preferences,
        }),
        temperature: 0.4,
        maxTokens: 1_800,
        userId: uid,
        requestId,
        timeoutMs: 30_000,
        validate: validateFridgeMealSuggestions,
      });
      return {
        ...data,
        requestId,
        confirmedIngredientCount: ingredients.length,
      };
    } catch (error) {
      console.error("fridge_meal_suggestions_failed", {
        uid,
        requestId,
        code:
          error instanceof OpenAIClientError
            ? error.code
            : "fridge_meal_suggestions_failed",
        status: error instanceof OpenAIClientError ? error.status : 500,
      });
      throw new HttpsError(
        error instanceof OpenAIClientError && error.status === 429
          ? "resource-exhausted"
          : "unavailable",
        "Meal ideas are busy right now. Your confirmed ingredients are still available to retry."
      );
    }
  },
  {
    region: "us-central1",
    secrets: [openAiSecretParam],
    timeoutSeconds: 60,
    memory: "512MiB",
  }
);
