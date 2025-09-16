import { Timestamp } from "firebase-admin/firestore";
import { db, functions, getSecret } from "./admin";
import { requireCallableAuth } from "./auth";
import { PlanMeta, PlanWeek, WorkoutBlock, WorkoutDay } from "./types";
import * as crypto from "node:crypto";

interface GeneratePlanInput {
  lengthWeeks: number;
  daysPerWeek: number;
  sessionMins: number;
  equipment?: string[];
  weakSpots?: string[];
  injuries?: string;
  goal: string;
}

interface WeeklyCheckInInput {
  avgWeightNow: number;
  avgWeightPrev: number;
  nutritionAdherence: number;
  proteinAdherence: number;
  workoutAdherence: number;
  recoveryScore: number;
  avgSleepHours: number;
  cardioFeedback?: string;
  injuriesNote?: string;
  preference?: string;
}

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const OPENAI_MODEL = "gpt-4o-mini";

function goalCategory(goal: string): "cut" | "gain" | "recomp" {
  const lowered = goal.toLowerCase();
  if (lowered.includes("cut") || lowered.includes("fat") || lowered.includes("loss")) {
    return "cut";
  }
  if (lowered.includes("gain") || lowered.includes("bulk") || lowered.includes("muscle")) {
    return "gain";
  }
  return "recomp";
}

function defaultWeightKg(): number {
  return 78;
}

function estimateMaintenanceCalories(weightKg: number): number {
  const weightLb = weightKg * 2.20462;
  return Math.round(weightLb * 15);
}

function buildWorkoutBlocks(equipment: string[] | undefined, weakSpots: string[] | undefined, goal: string): WorkoutBlock[] {
  const hasBarbell = equipment?.some((item) => item.toLowerCase().includes("barbell"));
  const hasDumbbell = equipment?.some((item) => item.toLowerCase().includes("dumbbell"));
  const hasBands = equipment?.some((item) => item.toLowerCase().includes("band"));
  const blocks: WorkoutBlock[] = [];
  blocks.push({ type: "warmup", name: "Dynamic Mobility", sets: 1, reps: "5-8 min", restSec: 30, tips: "Focus on hips and thoracic spine." });
  if (hasBarbell) {
    blocks.push({ type: "main", name: "Barbell Squat", sets: 4, reps: goalCategory(goal) === "gain" ? "6-8" : "8-10", rir: 2, restSec: 120 });
    blocks.push({ type: "main", name: "Barbell Bench Press", sets: 4, reps: "6-10", rir: 2, restSec: 120 });
  } else if (hasDumbbell) {
    blocks.push({ type: "main", name: "Dumbbell Goblet Squat", sets: 3, reps: "10-12", rir: 2, restSec: 90 });
    blocks.push({ type: "main", name: "Dumbbell Bench Press", sets: 3, reps: "8-12", rir: 2, restSec: 90 });
  } else {
    blocks.push({ type: "main", name: "Bodyweight Split Squat", sets: 4, reps: "12", rir: 1, restSec: 60 });
    blocks.push({ type: "main", name: "Push-up Variations", sets: 4, reps: "AMRAP", rir: 1, restSec: 60 });
  }
  if (weakSpots?.includes("back")) {
    blocks.push({ type: "accessory", name: "Single Arm Row", sets: 3, reps: "12-15", rir: 2, restSec: 75 });
  } else {
    blocks.push({ type: "accessory", name: "Lat Pulldown or Pull-up", sets: 3, reps: "8-12", rir: 2, restSec: 90 });
  }
  if (weakSpots?.includes("glutes")) {
    blocks.push({ type: "accessory", name: "Hip Thrust", sets: 3, reps: "12-15", rir: 2, restSec: 75 });
  }
  if (hasBands) {
    blocks.push({ type: "conditioning", name: "Band-Resisted Conditioning", sets: 5, reps: "1 min", restSec: 45 });
  } else {
    blocks.push({ type: "conditioning", name: "Low Impact Conditioning", sets: 5, reps: "1 min", restSec: 45, tips: "Use bike, brisk walk or jump rope." });
  }
  return blocks;
}

function buildPlanWeeks(input: GeneratePlanInput, planId: string, meta: PlanMeta): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  for (let week = 1; week <= input.lengthWeeks; week += 1) {
    const days: WorkoutDay[] = [];
    for (let dayIndex = 0; dayIndex < input.daysPerWeek; dayIndex += 1) {
      const dayOfWeek = dayIndex % WEEKDAY_LABELS.length;
      const blocks = buildWorkoutBlocks(input.equipment, input.weakSpots, input.goal).map((block) => ({ ...block }));
      days.push({
        name: WEEKDAY_LABELS[dayOfWeek],
        dayOfWeek,
        blocks,
      });
    }
    weeks.push({ number: week, days });
  }
  return weeks;
}

async function buildPlanWithOpenAI(
  input: GeneratePlanInput,
  meta: PlanMeta,
  uid: string,
  requestId: string
): Promise<PlanWeek[] | null> {
  const apiKey = getSecret("OPENAI_API_KEY");
  if (!apiKey) {
    return null;
  }
  try {
    const prompt = `Create a ${meta.lengthWeeks}-week strength and conditioning plan. ` +
      `The athlete can train ${meta.daysPerWeek} days per week with sessions around ${meta.sessionMins} minutes. ` +
      `Equipment available: ${input.equipment?.join(", ") || "bodyweight"}. ` +
      `Goal: ${input.goal}. Weak spots: ${input.weakSpots?.join(", ") || "none"}. ` +
      `Return JSON only with weeks->days->blocks. Each block needs type, name, sets, reps, optional rir, restSec, tips.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a certified strength coach. Respond only with valid JSON matching the schema for weeks/days/blocks.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "plan",
            schema: {
              type: "object",
              properties: {
                weeks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "integer" },
                      days: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            dayOfWeek: { type: "integer" },
                            blocks: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  type: { type: "string" },
                                  name: { type: "string" },
                                  sets: { type: "integer" },
                                  reps: { type: "string" },
                                  rir: { type: "integer" },
                                  restSec: { type: "integer" },
                                  tips: { type: "string" },
                                },
                                required: ["type", "name", "sets", "reps"],
                              },
                            },
                          },
                          required: ["blocks"],
                        },
                      },
                    },
                    required: ["days"],
                  },
                },
              },
              required: ["weeks"],
            },
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI status ${response.status}`);
    }
    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    let text = "";
    if (typeof rawContent === "string") {
      text = rawContent;
    } else if (Array.isArray(rawContent)) {
      text = rawContent
        .map((part: any) => (typeof part === "string" ? part : part?.text ?? ""))
        .join("");
    }
    if (!text) {
      throw new Error("OpenAI response missing content");
    }
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.weeks)) {
      throw new Error("OpenAI plan missing weeks");
    }
    const normalized: PlanWeek[] = parsed.weeks.map((week: any, index: number) => {
      const days = Array.isArray(week.days) ? week.days : [];
      const normalizedDays: WorkoutDay[] = days.map((day: any, dayIndex: number) => {
        const blocks = Array.isArray(day.blocks) ? day.blocks : [];
        return {
          name: typeof day.name === "string" && day.name.length ? day.name : WEEKDAY_LABELS[dayIndex % WEEKDAY_LABELS.length],
          dayOfWeek:
            typeof day.dayOfWeek === "number" && day.dayOfWeek >= 0 ? day.dayOfWeek : dayIndex % WEEKDAY_LABELS.length,
          blocks: blocks
            .map((block: any) => ({
              type: block.type ?? "main",
              name: block.name ?? "Exercise",
              sets: typeof block.sets === "number" && block.sets > 0 ? block.sets : 3,
              reps: block.reps ?? "8-12",
              rir: block.rir,
              restSec: block.restSec,
              tips: block.tips,
            }))
            .filter((block: WorkoutBlock) => !!block.name),
        };
      });
      return {
        number: typeof week.number === "number" ? week.number : index + 1,
        days: normalizedDays,
        changes: Array.isArray(week.changes) ? week.changes.filter((c: any) => typeof c === "string") : undefined,
      };
    });
    return normalized.length ? normalized : null;
  } catch (error) {
    functions.logger.warn("openai_plan_fallback", { uid, requestId, error });
    return null;
  }
}

function calculateNutritionTargets(goal: string, weightKg: number): { calories: number; protein: number; carbs: number; fat: number } {
  const maintenance = estimateMaintenanceCalories(weightKg);
  const category = goalCategory(goal);
  let calories = maintenance;
  if (category === "cut") {
    calories = Math.max(maintenance - 400, maintenance * 0.8);
  } else if (category === "gain") {
    calories = maintenance + 250;
  }
  const weightLb = weightKg * 2.20462;
  const protein = Math.round(weightLb * 1.0);
  let fat = Math.max(Math.round((calories * 0.2) / 9), Math.round(weightLb * 0.35));
  const remainingCalories = Math.max(calories - protein * 4 - fat * 9, calories * 0.25);
  const carbs = Math.round(remainingCalories / 4);
  return { calories: Math.round(calories), protein, carbs, fat };
}

export const generatePlan = functions.https.onCall(async (data: GeneratePlanInput, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  const { lengthWeeks, daysPerWeek, sessionMins, equipment, weakSpots, injuries, goal } = data || ({} as any);
  if (!lengthWeeks || !daysPerWeek || !sessionMins || !goal) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }
  const userSnap = await db.doc(`users/${uid}`).get();
  const weightKg = (userSnap.data()?.profile?.weightKg as number | undefined) ?? defaultWeightKg();
  const nutrition = calculateNutritionTargets(goal, weightKg);
  const planId = crypto.randomUUID();
  const startDate = Timestamp.now();
  const meta: PlanMeta = {
    planId,
    lengthWeeks,
    daysPerWeek,
    sessionMins,
    goal,
    weakSpots,
    equipment,
    startDate,
    nutrition,
    cardioSessions: goalCategory(goal) === "cut" ? 3 : 2,
    rirTarget: 2,
    volumeLevel: 5,
  };
  const aiWeeks = await buildPlanWithOpenAI({ lengthWeeks, daysPerWeek, sessionMins, equipment, weakSpots, injuries, goal }, meta, uid, requestId);
  const weeks = aiWeeks ?? buildPlanWeeks({ lengthWeeks, daysPerWeek, sessionMins, equipment, weakSpots, injuries, goal }, planId, meta);
  const planCollection = db.collection(`users/${uid}/coach/plan`);
  await planCollection.doc("meta").set({ ...meta, createdAt: Timestamp.now(), injuries: injuries ?? null }, { merge: true });
  for (const week of weeks) {
    await planCollection.doc(`week${week.number}`).set({ planId, ...week }, { merge: false });
  }
  await db.doc(`users/${uid}/coach/planSummary`).set({ planId, generatedAt: Timestamp.now() });
  functions.logger.info("plan_generated", { uid, planId, requestId });
  return { planId };
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function adjustSets(blocks: WorkoutBlock[], volumeLevel: number, baseVolume: number): WorkoutBlock[] {
  if (volumeLevel === baseVolume) {
    return blocks.map((block) => ({ ...block }));
  }
  const diff = volumeLevel - baseVolume;
  const multiplier = 1 + diff * 0.1;
  return blocks.map((block) => {
    if (block.type === "main" || block.type === "accessory") {
      const sets = Math.max(1, Math.round(block.sets * multiplier));
      return { ...block, sets };
    }
    return { ...block };
  });
}

export const weeklyCheckIn = functions.https.onCall(async (data: WeeklyCheckInInput, context) => {
  const requestId = crypto.randomUUID();
  const uid = requireCallableAuth(context, requestId);
  const {
    avgWeightNow,
    avgWeightPrev,
    nutritionAdherence,
    proteinAdherence,
    workoutAdherence,
    recoveryScore,
    avgSleepHours,
    cardioFeedback,
    injuriesNote,
    preference,
  } = data || ({} as any);
  if (!avgWeightNow || !avgWeightPrev) {
    throw new functions.https.HttpsError("invalid-argument", "Weight averages required");
  }
  const planMetaRef = db.doc(`users/${uid}/coach/plan/meta`);
  const metaSnap = await planMetaRef.get();
  if (!metaSnap.exists) {
    throw new functions.https.HttpsError("failed-precondition", "Plan not found");
  }
  const meta = metaSnap.data() as PlanMeta;
  const category = goalCategory(meta.goal);
  const deltaWeight = avgWeightNow - avgWeightPrev;
  let calorieAdjustment = 0;
  const adjustments: string[] = [];
  if (category === "cut") {
    if (deltaWeight > -0.1 && nutritionAdherence > 0.7) {
      calorieAdjustment = -150;
      adjustments.push("Calories reduced by 150 for fat loss momentum.");
    } else if (deltaWeight < -0.8) {
      calorieAdjustment = 150;
      adjustments.push("Calories increased to slow rapid loss.");
    }
  } else if (category === "gain") {
    if (deltaWeight < 0.15 && nutritionAdherence > 0.7) {
      calorieAdjustment = 200;
      adjustments.push("Calories increased by 200 to drive gains.");
    } else if (deltaWeight > 0.6) {
      calorieAdjustment = -150;
      adjustments.push("Calories reduced slightly to control rate.");
    }
  } else {
    if (deltaWeight > 0.4) {
      calorieAdjustment = -150;
      adjustments.push("Calories trimmed to maintain weight.");
    } else if (deltaWeight < -0.4) {
      calorieAdjustment = 150;
      adjustments.push("Calories bumped to maintain weight.");
    }
  }
  calorieAdjustment = clamp(calorieAdjustment, -300, 300);
  const newCalories = clamp(meta.nutrition.calories + calorieAdjustment, 1200, 5000);
  const weightLb = avgWeightNow * 2.20462;
  const protein = Math.round(weightLb * 1.0);
  let fat = Math.max(Math.round((newCalories * 0.2) / 9), Math.round(weightLb * 0.35));
  const carbs = Math.max(Math.round((newCalories - protein * 4 - fat * 9) / 4), 30);
  fat = clamp(fat, 40, Math.round(newCalories * 0.35 / 9));

  let newVolume = meta.volumeLevel;
  if (workoutAdherence > 0.85 && recoveryScore >= 7) {
    newVolume = clamp(meta.volumeLevel + 1, 3, 8);
    adjustments.push("Training volume increased by ~10%.");
  }
  if (recoveryScore <= 4 || injuriesNote) {
    newVolume = clamp(newVolume - 2, 2, 8);
    adjustments.push("Deload implemented for recovery.");
  }

  let newRir = meta.rirTarget;
  if (preference?.toLowerCase() === "harder" && recoveryScore >= 6) {
    newRir = clamp(newRir - 1, 0, 3);
    adjustments.push("RIR lowered by 1 for more challenge.");
  } else if (recoveryScore <= 4) {
    newRir = clamp(newRir + 1, 1, 4);
    adjustments.push("RIR increased to prioritize recovery.");
  }

  let cardioSessions = meta.cardioSessions;
  if (category === "cut" && cardioFeedback?.includes("easy")) {
    cardioSessions = clamp(cardioSessions + 1, 2, 6);
    adjustments.push("Added one cardio session.");
  } else if (recoveryScore <= 4 || cardioFeedback?.includes("too much")) {
    cardioSessions = clamp(cardioSessions - 1, 0, 6);
    adjustments.push("Reduced cardio to aid recovery.");
  }

  const checkinsRef = db.collection(`users/${uid}/coach/checkins`);
  const existing = await checkinsRef.orderBy("createdAt", "asc").get();
  const nextWeek = existing.size + 2; // upcoming week number
  const baseWeekNumber = Math.min(existing.size + 1, meta.lengthWeeks);
  const baseWeekSnap = await db.doc(`users/${uid}/coach/plan/week${baseWeekNumber}`).get();
  let baseWeekDays: WorkoutDay[] = [];
  if (baseWeekSnap.exists) {
    const weekData = baseWeekSnap.data() as PlanWeek;
    baseWeekDays = weekData.days;
  }
  const adjustedDays = baseWeekDays.map((day) => ({
    ...day,
    blocks: adjustSets(day.blocks, newVolume, meta.volumeLevel).map((block) =>
      block.rir !== undefined ? { ...block, rir: clamp(newRir, 0, 4) } : block
    ),
  }));
  await db.doc(`users/${uid}/coach/plan/week${nextWeek}`).set({
    planId: meta.planId,
    number: nextWeek,
    days: adjustedDays,
    changes: adjustments,
  });
  await planMetaRef.set(
    {
      nutrition: { calories: newCalories, protein, carbs, fat },
      volumeLevel: newVolume,
      rirTarget: newRir,
      cardioSessions,
      updatedAt: Timestamp.now(),
      lastCheckInAt: Timestamp.now(),
    },
    { merge: true }
  );
  await checkinsRef.add({
    avgWeightNow,
    avgWeightPrev,
    nutritionAdherence,
    proteinAdherence,
    workoutAdherence,
    recoveryScore,
    avgSleepHours,
    cardioFeedback: cardioFeedback ?? null,
    injuriesNote: injuriesNote ?? null,
    preference: preference ?? null,
    createdAt: Timestamp.now(),
    adjustments,
    nextWeek,
  });
  functions.logger.info("weekly_checkin", { uid, requestId, nextWeek });
  return { updated: true, nextWeek };
});
