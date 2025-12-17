/**
 * Pipeline map — Scan processing & plan generation:
 * - Validates ownership, fetches signed URLs for each pose, and calls OpenAI Vision (`gpt-4o-mini`) with photos + weights.
 * - Parses out body-fat estimate, BMI, workout plan, and nutrition plan; clamps values before writing to Firestore.
 * - Transitions scan doc `status` through `processing` → `complete` (or `error`) so the client never sees a stuck state.
 */
import { randomUUID } from "node:crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { Timestamp, getFirestore, getStorage } from "../firebase.js";
import { requireAuthWithClaims } from "../http.js";
import { hasOpenAI } from "../lib/env.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import { deriveNutritionPlan } from "../lib/nutritionGoals.js";
import type { ScanDocument } from "../types.js";
import {
  OpenAIClientError,
  structuredJsonChat,
  type ChatContentPart,
} from "../openai/client.js";

const db = getFirestore();
const storage = getStorage();
const POSES = ["front", "back", "left", "right"] as const;
const OPENAI_MODEL = "gpt-4o-mini";
// Vision + structured output can take longer on cold starts / busy periods.
// Keep this comfortably below the function timeout so we can still map errors cleanly.
const OPENAI_TIMEOUT_MS = 60000;

const serverTimestamp = (): FirebaseFirestore.Timestamp =>
  Timestamp.now() as FirebaseFirestore.Timestamp;

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
  recommendations?: unknown;
};

type ParsedAnalysis = {
  estimate: ScanEstimate;
  workoutPlan: WorkoutPlan;
  nutritionPlan: NutritionPlan;
  recommendations: string[];
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function sanitizeEstimate(
  raw: Partial<ScanEstimate> | undefined
): ScanEstimate {
  const source = raw as any;
  const bodyFatPercent = clamp(
    Number(raw?.bodyFatPercent ?? source?.body_fat ?? source?.bodyFat),
    3,
    60
  );
  const bmiRaw = Number(source?.bmi);
  const bmi =
    Number.isFinite(bmiRaw) && bmiRaw > 0 ? Number(bmiRaw.toFixed(1)) : null;
  const notes =
    typeof source?.notes === "string" && source.notes.trim()
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
    summary:
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : "Personalized training plan",
    weeks: weeks.map((week, index) => ({
      weekNumber:
        typeof (week as any)?.weekNumber === "number"
          ? (week as any).weekNumber
          : index + 1,
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

function sanitizeNutrition(
  raw: Partial<NutritionPlan> | undefined
): NutritionPlan {
  const source = raw as any;
  const calories = clamp(
    Number(raw?.caloriesPerDay ?? source?.calories_per_day),
    1000,
    6000
  );
  const protein = Math.max(
    0,
    Number(raw?.proteinGrams ?? source?.protein_grams ?? 0)
  );
  const carbs = Math.max(
    0,
    Number(raw?.carbsGrams ?? source?.carbs_grams ?? 0)
  );
  const fats = Math.max(0, Number(raw?.fatsGrams ?? source?.fats_grams ?? 0));
  const sampleDayRaw = Array.isArray(raw?.sampleDay) ? raw?.sampleDay : [];
  const sampleDay = sampleDayRaw.map((meal: any) => ({
    mealName: typeof meal?.mealName === "string" ? meal.mealName : "Meal",
    description: typeof meal?.description === "string" ? meal.description : "",
    calories: Number.isFinite(meal?.calories) ? Number(meal.calories) : 0,
    proteinGrams: Number.isFinite(meal?.proteinGrams)
      ? Number(meal.proteinGrams)
      : 0,
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

function sanitizeRecommendations(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/^[\u2022\-*\d.]+\s*/, "").trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 5)
    .map((entry) => entry.slice(0, 180));
  return cleaned;
}

function parsePayload(body: any): SubmitPayload | null {
  if (!body || typeof body !== "object") return null;
  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  const photoPathsRaw =
    body.photoPaths && typeof body.photoPaths === "object"
      ? body.photoPaths
      : null;
  const currentWeightKg = Number(body.currentWeightKg);
  const goalWeightKg = Number(body.goalWeightKg);
  if (!scanId || !photoPathsRaw) return null;
  const photoPaths: Record<Pose, string> = {
    front: typeof photoPathsRaw.front === "string" ? photoPathsRaw.front : "",
    back: typeof photoPathsRaw.back === "string" ? photoPathsRaw.back : "",
    left: typeof photoPathsRaw.left === "string" ? photoPathsRaw.left : "",
    right: typeof photoPathsRaw.right === "string" ? photoPathsRaw.right : "",
  };
  if (
    !photoPaths.front ||
    !photoPaths.back ||
    !photoPaths.left ||
    !photoPaths.right
  )
    return null;
  if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg))
    return null;
  return { scanId, photoPaths, currentWeightKg, goalWeightKg };
}

async function buildImageInputs(
  uid: string,
  paths: Record<Pose, string>
): Promise<Array<{ pose: Pose; url: string }>> {
  const bucket = storage.bucket();
  const entries: Array<{ pose: Pose; url: string }> = [];
  for (const pose of POSES) {
    const path = paths[pose];
    if (!path || !path.startsWith(`user_uploads/${uid}/scans/`)) {
      throw new Error(`invalid_photo_path_${pose}`);
    }
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

function validateVisionPayload(raw: unknown): OpenAIResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_analysis_payload");
  }
  const payload = raw as Record<string, unknown>;
  const coerce = (value: unknown) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  return {
    estimate: coerce(payload.estimate),
    workoutPlan: coerce(payload.workoutPlan),
    nutritionPlan: coerce(payload.nutritionPlan),
    recommendations: payload.recommendations,
  };
}

async function callOpenAI(
  images: Array<{ pose: Pose; url: string }>,
  input: { currentWeightKg: number; goalWeightKg: number; uid: string },
  requestId: string
): Promise<OpenAIResult> {
  const systemPrompt = [
    "You are a fitness coach who analyzes body photos to estimate body fat percentage and BMI.",
    'Respond with JSON matching {"estimate": ScanEstimate, "workoutPlan": WorkoutPlan, "nutritionPlan": NutritionPlan, "recommendations": string[]}.',
    "Use concise language and realistic programming for an intermediate trainee.",
  ].join("\n");

  const userText = [
    `Current weight: ${input.currentWeightKg} kg`,
    `Goal weight: ${input.goalWeightKg} kg`,
    "Use the four photos (front, back, left, right) to inform the estimate and plans.",
    "BMI can be null if unreliable. Notes must remind this is only an estimate.",
    "Workout plan should span multiple weeks with daily splits.",
    "Nutrition plan must include daily calories/macros and a sample day of meals.",
    "Recommendations must be 3-5 short bullets (no numbering), focused on next steps for training and nutrition.",
    "Respond with JSON only. Do not include markdown fences.",
  ].join("\n");

  const imageParts: ChatContentPart[] = images.map(({ url }) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));
  const userContent: ChatContentPart[] = [
    { type: "text", text: userText },
    ...imageParts,
  ];

  const { data } = await structuredJsonChat<OpenAIResult>({
    systemPrompt,
    userContent,
    temperature: 0.4,
    maxTokens: 900,
    userId: input.uid,
    requestId,
    timeoutMs: OPENAI_TIMEOUT_MS,
    model: OPENAI_MODEL,
    validate: validateVisionPayload,
  });

  return data;
}

function buildAnalysisFromResult(raw: OpenAIResult): ParsedAnalysis {
  try {
    const estimate = sanitizeEstimate(raw.estimate);
    const workoutPlan = sanitizeWorkout(raw.workoutPlan);
    const nutritionPlan = sanitizeNutrition(raw.nutritionPlan);
    const recommendations = sanitizeRecommendations(raw.recommendations);
    return { estimate, workoutPlan, nutritionPlan, recommendations };
  } catch (error) {
    throw new Error(
      `openai_parse_failed:${(error as Error)?.message ?? "unknown"}`
    );
  }
}

export const submitScan = onRequest(
  { invoker: "public", concurrency: 10, region: "us-central1", timeoutSeconds: 300 },
  async (req, res) => {
    let scanRef: FirebaseFirestore.DocumentReference<ScanDocument> | null =
      null;
    const requestId = req.get?.("x-request-id")?.trim() || randomUUID();
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Firebase-AppCheck"
    );
    res.set("X-Request-Id", requestId);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    try {
      if (req.method !== "POST") {
        throw new HttpsError("unimplemented", "Method not allowed.", {
          debugId: requestId,
          reason: "method_not_allowed",
        });
      }

      const authContext = await requireAuthWithClaims(req as Request);
      await ensureSoftAppCheckFromRequest(req as Request, {
        fn: "submitScan",
        uid: authContext.uid,
        requestId,
      });

      const payload = parsePayload(req.body);
      if (!payload) {
        throw new HttpsError(
          "invalid-argument",
          "Missing or invalid scan data.",
          {
            debugId: requestId,
            reason: "invalid_scan_request",
          }
        );
      }

      const { uid } = authContext;
      const docRef = db.doc(
        `users/${uid}/scans/${payload.scanId}`
      ) as FirebaseFirestore.DocumentReference<ScanDocument>;
      const snap = await docRef.get();
      if (!snap.exists) {
        throw new HttpsError("not-found", "Scan not found.", {
          debugId: requestId,
          reason: "scan_not_found",
        });
      }
      const existing = snap.data() as ScanDocument;
      if (existing.uid && existing.uid !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Scan does not belong to this user.",
          {
            debugId: requestId,
            reason: "scan_wrong_owner",
          }
        );
      }
      scanRef = docRef;

      if (!hasOpenAI()) {
        throw new HttpsError(
          "failed-precondition",
          "Scan engine not configured.",
          {
            debugId: requestId,
            reason: "openai_not_configured",
          }
        );
      }

      await scanRef.set(
        {
          status: "processing",
          updatedAt: serverTimestamp(),
          completedAt: null,
          errorMessage: null,
          errorReason: null,
        },
        { merge: true }
      );

      let analysis: ParsedAnalysis;
      try {
        const images = await buildImageInputs(uid, payload.photoPaths);
        const result = await callOpenAI(images, { ...payload, uid }, requestId);
        analysis = buildAnalysisFromResult(result);
      } catch (error: any) {
        const message = error?.message ?? "Unknown";
        console.error("scan_submit_processing_failed", {
          message,
          stack: error?.stack,
          uid,
          scanId: payload.scanId,
          requestId,
        });
        if (
          typeof message === "string" &&
          message.startsWith("missing_photo_")
        ) {
          throw new HttpsError(
            "failed-precondition",
            "We could not find your uploaded photos. Please re-upload each angle and try again.",
            { debugId: requestId, reason: "missing_photos" }
          );
        }
        if (
          typeof message === "string" &&
          message.startsWith("invalid_photo_path_")
        ) {
          throw new HttpsError(
            "invalid-argument",
            "Invalid photo path supplied.",
            {
              debugId: requestId,
              reason: "invalid_photo_paths",
            }
          );
        }
        if (error instanceof OpenAIClientError) {
          if (error.code === "openai_missing_key") {
            throw new HttpsError(
              "failed-precondition",
              "Scan engine not configured.",
              {
                debugId: requestId,
                reason: "openai_not_configured",
              }
            );
          }
          if (error.status === 429) {
            throw new HttpsError(
              "unavailable",
              "Scan engine is busy. Please try again shortly.",
              {
                debugId: requestId,
                reason: "openai_rate_limited",
              }
            );
          }
          throw new HttpsError(
            "unavailable",
            "Scan engine is temporarily unavailable. Please try again.",
            {
              debugId: requestId,
              reason: "openai_unavailable",
            }
          );
        }
        throw new HttpsError(
          "internal",
          "Unexpected error while processing scan.",
          {
            debugId: requestId,
            reason: "openai_processing_failed",
          }
        );
      }

      const update: Partial<ScanDocument> = {
        status: "complete",
        updatedAt: serverTimestamp(),
        completedAt: serverTimestamp(),
        photoPaths: payload.photoPaths,
        input: {
          currentWeightKg: payload.currentWeightKg,
          goalWeightKg: payload.goalWeightKg,
        },
        estimate: analysis.estimate,
        workoutPlan: analysis.workoutPlan,
        nutritionPlan: (() => {
          const derived = deriveNutritionPlan({
            weightKg: payload.currentWeightKg,
            bodyFatPercent: analysis.estimate.bodyFatPercent,
            goalWeightKg: payload.goalWeightKg,
          });
          // Keep OpenAI's sample day (if provided) but enforce deterministic totals/macros.
          return {
            ...analysis.nutritionPlan,
            caloriesPerDay: derived.caloriesPerDay,
            proteinGrams: derived.proteinGrams,
            carbsGrams: derived.carbsGrams,
            fatsGrams: derived.fatsGrams,
          };
        })(),
        recommendations: analysis.recommendations.length ? analysis.recommendations : null,
        errorMessage: null,
        errorReason: null,
      };

      await scanRef.set(update, { merge: true });

      console.info("scan_submit_complete", {
        uid,
        scanId: payload.scanId,
        requestId,
      });

      res.json({
        scanId: payload.scanId,
        estimate: analysis.estimate,
        workoutPlan: analysis.workoutPlan,
        nutritionPlan: update.nutritionPlan,
        recommendations: update.recommendations,
        debugId: requestId,
      });
    } catch (error) {
      if (scanRef) {
        const errorMessage =
          error instanceof HttpsError
            ? error.message
            : "Unexpected error while processing scan.";
        const errorReason = deriveErrorReason(error);
        await scanRef
          .set(
            {
              status: "error",
              errorMessage,
              errorReason,
              updatedAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => undefined);
      }
      respondWithSubmitError(res, error, requestId);
    }
  }
);

function respondWithSubmitError(
  res: any,
  error: unknown,
  requestId: string
): void {
  if (error instanceof HttpsError) {
    const details = (error as { details?: any }).details || {};
    const debugId = details?.debugId ?? requestId;
    const reason = details?.reason;
    res.status(statusFromHttpsError(error)).json({
      code: error.code,
      message:
        error.code === "internal"
          ? "Unexpected error while processing scan."
          : error.message || "Unable to process scan.",
      debugId,
      reason,
    });
    return;
  }
  console.error("scan_submit_unhandled", {
    message: (error as Error)?.message,
    stack: (error as Error)?.stack,
    requestId,
  });
  res.status(500).json({
    code: "scan_internal_error",
    message: "Unexpected error while processing scan.",
    debugId: requestId,
    reason: "server_error",
  });
}

function deriveErrorReason(error: unknown): string {
  if (error instanceof HttpsError) {
    const details = (error as { details?: any }).details;
    if (
      details &&
      typeof details === "object" &&
      typeof details.reason === "string"
    ) {
      return details.reason;
    }
    return error.code;
  }
  if (error instanceof OpenAIClientError) {
    return error.code;
  }
  const message = (error as Error)?.message;
  return typeof message === "string" && message
    ? message.slice(0, 80)
    : "unknown_error";
}

function statusFromHttpsError(error: HttpsError): number {
  const status = (error as any)?.httpErrorCode?.status;
  if (typeof status === "number") {
    return status;
  }
  switch (error.code) {
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    default:
      return 500;
  }
}
