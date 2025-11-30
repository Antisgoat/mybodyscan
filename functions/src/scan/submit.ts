import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore, getStorage } from "../firebase.js";
import { requireAuthWithClaims, verifyAppCheckStrict } from "../http.js";
import { getOpenAIKey, hasOpenAI } from "../lib/env.js";
import fetch from "node-fetch";

const db = getFirestore();
const storage = getStorage();
const POSES = ["front", "back", "left", "right"] as const;
const OPENAI_MODEL = "gpt-4o-mini";

type Pose = (typeof POSES)[number];

type SubmitPayload = {
  scanId: string;
  photoPaths: Record<Pose, string>;
  currentWeightKg: number;
  goalWeightKg: number;
};

type OpenAIResult = {
  estimate?: Partial<ScanEstimate>;
  workoutPlan?: Partial<WorkoutPlan>;
  nutritionPlan?: Partial<NutritionPlan>;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function extractJson(text: string): any {
  let trimmed = text.trim();
  const fenced = trimmed.match(/```json([\s\S]*?)```/i);
  if (fenced) {
    trimmed = fenced[1];
  } else if (trimmed.startsWith("```")) {
    const generic = trimmed.match(/```([\s\S]*?)```/);
    if (generic) trimmed = generic[1];
  }
  return JSON.parse(trimmed.trim());
}

function sanitizeEstimate(raw: Partial<ScanEstimate> | undefined): ScanEstimate {
  const source = raw as any;
  const bodyFatPercent = clamp(Number(raw?.bodyFatPercent ?? source?.body_fat ?? source?.bodyFat), 3, 60);
  const bmiRaw = Number(source?.bmi);
  const bmi = Number.isFinite(bmiRaw) && bmiRaw > 0 ? Number(bmiRaw.toFixed(1)) : null;
  const notes = typeof source?.notes === "string" && source.notes.trim()
    ? source.notes.trim().slice(0, 400)
    : "Visual estimate only. Not medical advice.";
  return {
    bodyFatPercent: Number(bodyFatPercent.toFixed(1)),
    bmi,
    notes,
  };
}

function sanitizeWorkout(raw: Partial<WorkoutPlan> | undefined): WorkoutPlan {
  const weeks = Array.isArray(raw?.weeks) ? raw.weeks : [];
  return {
    summary: typeof raw?.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "Personalized training plan",
    weeks: weeks.map((week, index) => ({
      weekNumber: typeof (week as any)?.weekNumber === "number" ? (week as any).weekNumber : index + 1,
      days: Array.isArray((week as any)?.days)
        ? (week as any).days.map((day: any) => ({
            day: typeof day?.day === "string" ? day.day : "Day",
            focus: typeof day?.focus === "string" ? day.focus : "Full body",
            exercises: Array.isArray(day?.exercises)
              ? day.exercises.map((ex: any) => ({
                  name: typeof ex?.name === "string" ? ex.name : "Exercise",
                  sets: Number.isFinite(ex?.sets) ? Number(ex.sets) : 3,
                  reps: typeof ex?.reps === "string" ? ex.reps : "8-12",
                  notes: typeof ex?.notes === "string" ? ex.notes : undefined,
                }))
              : [],
          }))
        : [],
    })),
  };
}

function sanitizeNutrition(raw: Partial<NutritionPlan> | undefined): NutritionPlan {
  const source = raw as any;
  const calories = clamp(Number(raw?.caloriesPerDay ?? source?.calories_per_day), 1000, 6000);
  const protein = Math.max(0, Number(raw?.proteinGrams ?? source?.protein_grams ?? 0));
  const carbs = Math.max(0, Number(raw?.carbsGrams ?? source?.carbs_grams ?? 0));
  const fats = Math.max(0, Number(raw?.fatsGrams ?? source?.fats_grams ?? 0));
  const sampleDayRaw = Array.isArray(raw?.sampleDay) ? raw?.sampleDay : [];
  const sampleDay = sampleDayRaw.map((meal: any) => ({
    mealName: typeof meal?.mealName === "string" ? meal.mealName : "Meal",
    description: typeof meal?.description === "string" ? meal.description : "",
    calories: Number.isFinite(meal?.calories) ? Number(meal.calories) : 0,
    proteinGrams: Number.isFinite(meal?.proteinGrams) ? Number(meal.proteinGrams) : 0,
    carbsGrams: Number.isFinite(meal?.carbsGrams) ? Number(meal.carbsGrams) : 0,
    fatsGrams: Number.isFinite(meal?.fatsGrams) ? Number(meal.fatsGrams) : 0,
  }));

  return {
    caloriesPerDay: Math.round(calories),
    proteinGrams: Math.round(protein),
    carbsGrams: Math.round(carbs),
    fatsGrams: Math.round(fats),
    sampleDay,
  };
}

function parsePayload(body: any): SubmitPayload | null {
  if (!body || typeof body !== "object") return null;
  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  const photoPathsRaw = body.photoPaths && typeof body.photoPaths === "object" ? body.photoPaths : null;
  if (!scanId || !photoPathsRaw) return null;
  const photoPaths: Record<Pose, string> = {
    front: typeof photoPathsRaw.front === "string" ? photoPathsRaw.front : "",
    back: typeof photoPathsRaw.back === "string" ? photoPathsRaw.back : "",
    left: typeof photoPathsRaw.left === "string" ? photoPathsRaw.left : "",
    right: typeof photoPathsRaw.right === "string" ? photoPathsRaw.right : "",
  };
  if (!photoPaths.front || !photoPaths.back || !photoPaths.left || !photoPaths.right) return null;
  const currentWeightKg = Number(body.currentWeightKg);
  const goalWeightKg = Number(body.goalWeightKg);
  if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) return null;
  return { scanId, photoPaths, currentWeightKg, goalWeightKg };
}

async function buildImageInputs(paths: Record<Pose, string>): Promise<Array<{ pose: Pose; url: string }>> {
  const bucket = storage.bucket();
  const entries: Array<{ pose: Pose; url: string }> = [];
  for (const pose of POSES) {
    const path = paths[pose];
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`missing_photo_${pose}`);
    }
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });
    entries.push({ pose, url });
  }
  return entries;
}

async function callOpenAI(
  apiKey: string,
  images: Array<{ pose: Pose; url: string }>,
  input: { currentWeightKg: number; goalWeightKg: number; uid: string },
): Promise<OpenAIResult> {
  const systemPrompt = [
    "You are a fitness coach who analyzes body photos to estimate body fat percentage and BMI.",
    "Return JSON only matching {\"estimate\": ScanEstimate, \"workoutPlan\": WorkoutPlan, \"nutritionPlan\": NutritionPlan}.",
    "Use concise language and realistic programming for an intermediate trainee.",
  ].join("\n");

  const userText = [
    `Current weight: ${input.currentWeightKg} kg`,
    `Goal weight: ${input.goalWeightKg} kg`,
    "Use the four photos (front, back, left, right) to inform the estimate and plans.",
    "BMI can be null if unreliable. Notes must remind this is only an estimate.",
    "Workout plan should span multiple weeks with daily splits.",
    "Nutrition plan should include daily calories/macros and a sample day of meals.",
    "Respond with JSON only. Do not include markdown fences.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...images.map(({ url }) => ({ type: "image_url", image_url: { url, detail: "high" } })),
          ],
        },
      ],
      user: input.uid,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("scan_openai_error", { status: response.status, body: text.slice(0, 500) });
    throw new Error("openai_error");
  }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("openai_no_content");
  }

  const parsed = extractJson(content) as OpenAIResult;
  return parsed;
}

export const submitScan = onRequest(
  { invoker: "public", concurrency: 10, region: "us-central1" },
  async (req, res) => {
    let scanRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null = null;
    try {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
      if (req.method === "OPTIONS") { res.status(204).end(); return; }
      if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed", code: "method_not_allowed" });
        return;
      }

      try {
        await verifyAppCheckStrict(req as Request);
      } catch (error: any) {
        console.warn("scan_submit_appcheck_failed", { message: error?.message });
        res.status(401).json({ error: "app_check_unavailable", code: "app_check_unavailable" });
        return;
      }

      let authContext: { uid: string; claims?: Record<string, unknown> };
      try {
        authContext = await requireAuthWithClaims(req as Request);
      } catch (error: any) {
        console.warn("scan_submit_auth_failed", { message: error?.message });
        res.status(401).json({ error: "auth_required", code: "auth_required" });
        return;
      }

      if (!hasOpenAI()) {
        res.status(503).json({ error: "openai_not_configured", code: "openai_not_configured" });
        return;
      }

      const payload = parsePayload(req.body);
      if (!payload) {
        res.status(400).json({ error: "invalid_payload", code: "invalid_payload" });
        return;
      }

      const { uid } = authContext;
      scanRef = db.doc(`users/${uid}/scans/${payload.scanId}`);
      const snap = await scanRef.get();
      if (!snap.exists) {
        res.status(404).json({ error: "not_found", code: "not_found" });
        return;
      }
      const existing = snap.data() as ScanDocument;
      if (existing.uid && existing.uid !== uid) {
        res.status(403).json({ error: "forbidden", code: "forbidden" });
        return;
      }

      await scanRef.set({ status: "processing", updatedAt: Timestamp.now() }, { merge: true });

      let aiResult: OpenAIResult;
      try {
        const images = await buildImageInputs(payload.photoPaths);
        const apiKey = getOpenAIKey() as string;
        aiResult = await callOpenAI(apiKey, images, { ...payload, uid });
      } catch (error: any) {
        console.error("scan_submit_openai_failed", { message: error?.message });
        await scanRef.set({ status: "error", errorMessage: "Analysis failed", updatedAt: Timestamp.now() }, { merge: true });
        res.status(502).json({ error: "scan_engine_unavailable", code: "scan_engine_unavailable" });
        return;
      }

      let estimate: ScanEstimate | null = null;
      let workoutPlan: WorkoutPlan | null = null;
      let nutritionPlan: NutritionPlan | null = null;

      try {
        estimate = sanitizeEstimate(aiResult.estimate);
        workoutPlan = sanitizeWorkout(aiResult.workoutPlan);
        nutritionPlan = sanitizeNutrition(aiResult.nutritionPlan);
      } catch (error: any) {
        console.error("scan_submit_parse_failed", { message: error?.message });
        await scanRef.set({ status: "error", errorMessage: "Could not parse analysis", updatedAt: Timestamp.now() }, { merge: true });
        res.status(500).json({ error: "parse_error", code: "parse_error" });
        return;
      }

      const update: Partial<ScanDocument> = {
        status: "complete",
        updatedAt: Timestamp.now(),
        photoPaths: payload.photoPaths,
        input: {
          currentWeightKg: payload.currentWeightKg,
          goalWeightKg: payload.goalWeightKg,
        },
        estimate,
        workoutPlan,
        nutritionPlan,
      };

      await scanRef.set(update, { merge: true });

      res.json({ status: "complete" });
    } catch (err: any) {
      console.error("scan_submit_unhandled", { message: err?.message });
      if (scanRef) {
        await scanRef
          .set({ status: "error", errorMessage: "Server error", updatedAt: Timestamp.now() }, { merge: true })
          .catch(() => undefined);
      }
      res.status(500).json({ error: "server_error", code: "server_error" });
    }
  },
);
