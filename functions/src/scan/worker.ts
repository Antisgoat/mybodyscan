/**
 * Pipeline map — Background scan processor:
 * - Triggered when a scan doc transitions to `queued`.
 * - Claims processing, heartbeats progress, calls OpenAI, and writes final results.
 */
import { randomUUID } from "node:crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "../firebase.js";
import { deriveNutritionPlan } from "../lib/nutritionGoals.js";
import type { ScanDocument } from "../types.js";
import {
  OpenAIClientError,
  buildAnalysisFromResult,
  buildImageInputs,
  callOpenAI,
  deriveErrorReason,
  buildPlanMarkdown,
} from "./analysis.js";
import { getEngineConfigOrThrow } from "./engineConfig.js";
import { openAiSecretParam } from "../openai/keys.js";

const db = getFirestore();
const serverTimestamp = (): FirebaseFirestore.Timestamp =>
  Timestamp.now() as FirebaseFirestore.Timestamp;
const HEARTBEAT_MS = 25_000;
const ANALYSIS_TIMEOUT_MS = 60_000;

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") {
    try {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OpenAIClientError(tag, 504, `${tag}_timeout`)),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function buildFallbackAnalysis(input: {
  currentWeightKg: number;
  goalWeightKg: number;
  uid: string;
}): {
  estimate: ScanDocument["estimate"];
  workoutPlan: NonNullable<ScanDocument["workoutPlan"]>;
  nutritionPlan: NonNullable<ScanDocument["nutritionPlan"]>;
  recommendations: string[];
  improvementAreas: string[];
  usedFallback: boolean;
} {
  const estimate = {
    bodyFatPercent: 24,
    bmi: null,
    notes: "Fallback estimate (engine timeout).",
  };
  const workoutPlan = {
    summary: "Foundational push/pull/legs split",
    progressionRules: [
      "Add 1-2 reps weekly until the top of the range.",
      "Increase load 2-5% when you hit the top of the rep range.",
      "Rest 2-3 minutes on compounds, 60-90s on accessories.",
    ],
    weeks: Array.from({ length: 4 }).map((_, i) => ({
      weekNumber: i + 1,
      days: [
        {
          day: "Push",
          focus: "Chest/Shoulders",
          exercises: [
            { name: "Bench press", sets: 3, reps: "6-10" },
            { name: "Overhead press", sets: 3, reps: "6-10" },
            { name: "Dips or push-ups", sets: 3, reps: "8-12" },
          ],
        },
        {
          day: "Pull",
          focus: "Back",
          exercises: [
            { name: "Deadlift or RDL", sets: 3, reps: "5-8" },
            { name: "Row variation", sets: 3, reps: "8-12" },
            { name: "Lat pulldown/Pull-up", sets: 3, reps: "8-12" },
          ],
        },
        {
          day: "Legs",
          focus: "Lower body",
          exercises: [
            { name: "Squat or leg press", sets: 3, reps: "6-10" },
            { name: "Lunge/step-up", sets: 3, reps: "8-12" },
            { name: "Leg curl/hinge", sets: 3, reps: "10-15" },
          ],
        },
        {
          day: "Accessory",
          focus: "Arms/Core",
          exercises: [
            { name: "Biceps + triceps superset", sets: 3, reps: "10-15" },
            { name: "Planks/side planks", sets: 3, reps: "45-60s" },
            { name: "Calves", sets: 3, reps: "12-20" },
          ],
        },
      ],
    })),
  };
  const nutritionPlan = deriveNutritionPlan({
    weightKg: input.currentWeightKg,
    bodyFatPercent: estimate.bodyFatPercent,
    goalWeightKg: input.goalWeightKg,
  });
  const recommendations = [
    "Walk 7-10k steps daily; add a 10-minute walk after meals.",
    "Keep protein at every meal; track 3-4 days/week for accuracy.",
    "Prioritize sleep and hydration to keep training quality high.",
  ];
  return {
    estimate,
    workoutPlan,
    nutritionPlan: {
      ...nutritionPlan,
      adjustmentRules: [
        "If weekly change <0.25 kg, reduce calories by 150–200.",
        "If losing >1% body weight/week, add 150–200 calories.",
        "Keep protein steady; adjust carbs/fats first.",
      ],
      trainingDay: {
        calories: nutritionPlan.caloriesPerDay,
        proteinGrams: nutritionPlan.proteinGrams,
        carbsGrams: Math.round(nutritionPlan.carbsGrams * 1.05),
        fatsGrams: Math.round(nutritionPlan.fatsGrams * 0.95),
      },
      restDay: {
        calories: Math.max(1200, Math.round(nutritionPlan.caloriesPerDay - 150)),
        proteinGrams: nutritionPlan.proteinGrams,
        carbsGrams: Math.max(0, Math.round(nutritionPlan.carbsGrams * 0.85)),
        fatsGrams: Math.round(nutritionPlan.fatsGrams + 8),
      },
      sampleDay: [
        {
          mealName: "Breakfast",
          description: "Eggs + oats + berries",
          calories: Math.round(nutritionPlan.caloriesPerDay * 0.25),
          proteinGrams: Math.round(nutritionPlan.proteinGrams * 0.3),
          carbsGrams: Math.round(nutritionPlan.carbsGrams * 0.25),
          fatsGrams: Math.round(nutritionPlan.fatsGrams * 0.35),
        },
        {
          mealName: "Lunch",
          description: "Chicken, rice, veggies",
          calories: Math.round(nutritionPlan.caloriesPerDay * 0.3),
          proteinGrams: Math.round(nutritionPlan.proteinGrams * 0.35),
          carbsGrams: Math.round(nutritionPlan.carbsGrams * 0.35),
          fatsGrams: Math.round(nutritionPlan.fatsGrams * 0.25),
        },
        {
          mealName: "Dinner",
          description: "Lean protein, potatoes, salad",
          calories: Math.round(nutritionPlan.caloriesPerDay * 0.3),
          proteinGrams: Math.round(nutritionPlan.proteinGrams * 0.3),
          carbsGrams: Math.round(nutritionPlan.carbsGrams * 0.3),
          fatsGrams: Math.round(nutritionPlan.fatsGrams * 0.25),
        },
      ],
    },
    recommendations,
    improvementAreas: recommendations,
    usedFallback: true,
  };
}

export const processQueuedScan = onDocumentWritten(
  {
    document: "users/{uid}/scans/{scanId}",
    region: "us-central1",
    timeoutSeconds: 300,
    concurrency: 10,
    secrets: [openAiSecretParam],
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const scan = after.data() as ScanDocument;
    if (!scan || scan.status !== "queued") return;

    const { uid, scanId } = event.params as { uid: string; scanId: string };
    const scanRef = db.doc(
      `users/${uid}/scans/${scanId}`
    ) as FirebaseFirestore.DocumentReference<ScanDocument>;
    const processingAttemptId = randomUUID();
    const processingStartedAtMs = Date.now();

    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(scanRef);
      if (!snap.exists) return false;
      const current = snap.data() as ScanDocument;
      if (current.status !== "queued") return false;
      tx.set(
        scanRef,
        {
          status: "processing",
          processingAttemptId,
          processingStartedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastStep: "Processing started",
          lastStepAt: serverTimestamp(),
          processingHeartbeatAt: serverTimestamp(),
          errorMessage: null,
          errorReason: null,
          errorInfo: null,
          progress: 5,
        },
        { merge: true }
      );
      return true;
    });

    if (!claimed) return;

    const correlationId = scan.correlationId || processingAttemptId;
    const engine = getEngineConfigOrThrow(correlationId);
      const queueRequestedAtMs = toMillis((scan as any).processingRequestedAt);
      const queueDurationMs =
        queueRequestedAtMs != null ? Math.max(0, Date.now() - queueRequestedAtMs) : null;

    const updateStep = async (patch: Partial<ScanDocument>) => {
      await scanRef.set(
        {
          ...patch,
          updatedAt: serverTimestamp(),
          lastStepAt: serverTimestamp(),
        },
        { merge: true }
      );
    };

    let heartbeatTimer: NodeJS.Timeout | null = null;
    const startHeartbeat = (stage: string, progress: number) => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        void scanRef
          .set(
            {
              lastStep: stage,
              progress,
              processingHeartbeatAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastStepAt: serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => undefined);
      }, HEARTBEAT_MS);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    try {
      await updateStep({
        lastStep: "Validating uploads",
        progress: 10,
        processingHeartbeatAt: serverTimestamp(),
      });

      const photoPaths = scan.photoPaths as ScanDocument["photoPaths"] | undefined;
      const input = scan.input as ScanDocument["input"] | undefined;
      if (!photoPaths) {
        throw new Error("missing_photo_paths");
      }
      const currentWeightKg = Number(input?.currentWeightKg);
      const goalWeightKg = Number(input?.goalWeightKg);
      if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
        throw new Error("missing_scan_input");
      }

      await updateStep({
        lastStep: "Fetching photo URLs",
        progress: 20,
        processingHeartbeatAt: serverTimestamp(),
      });

      const downloadsStartedAtMs = Date.now();
      const images = await buildImageInputs(uid, photoPaths);
      const downloadElapsedMs = Date.now() - downloadsStartedAtMs;

      await updateStep({
        lastStep: "Analyzing body composition",
        progress: 40,
        processingHeartbeatAt: serverTimestamp(),
      });
      const engine = getEngineConfigOrThrow(correlationId);

      startHeartbeat("Analyzing body composition", 45);
      let usedFallback = false;
      const openAiStartedAtMs = Date.now();
      const result = await withTimeout(
        callOpenAI(images, { currentWeightKg, goalWeightKg, uid }, correlationId, engine),
        ANALYSIS_TIMEOUT_MS,
        "analysis"
      ).catch((err) => {
        if (err instanceof OpenAIClientError && err.code === "openai_missing_key") {
          throw err;
        }
        usedFallback = true;
        return buildFallbackAnalysis({ currentWeightKg, goalWeightKg, uid });
      });
      const openAiElapsedMs = Date.now() - openAiStartedAtMs;
      stopHeartbeat();

      await updateStep({
        lastStep: "Generating your plan",
        progress: 80,
        processingHeartbeatAt: serverTimestamp(),
      });

      const analysis = usedFallback
        ? {
            estimate: (result as any).estimate,
            workoutPlan: (result as any).workoutPlan,
            nutritionPlan: (result as any).nutritionPlan,
            recommendations: (result as any).recommendations ?? [],
            improvementAreas:
              (result as any).improvementAreas ??
              (result as any).recommendations ??
              [],
          }
        : buildAnalysisFromResult(result as any);
      const leanMassKg = Number.isFinite(currentWeightKg)
        ? Number((currentWeightKg * (1 - analysis.estimate.bodyFatPercent / 100)).toFixed(1))
        : null;
      const fatMassKg = Number.isFinite(currentWeightKg)
        ? Number((currentWeightKg * (analysis.estimate.bodyFatPercent / 100)).toFixed(1))
        : null;
      analysis.estimate.leanMassKg = leanMassKg;
      analysis.estimate.fatMassKg = fatMassKg;
      const bfPoint = Number.isFinite(analysis.estimate.bodyFatPercent)
        ? analysis.estimate.bodyFatPercent
        : null;
      const bfRange =
        bfPoint != null
          ? {
              min: Math.max(3, Number((bfPoint - 3).toFixed(1))),
              max: Math.min(60, Number((bfPoint + 3).toFixed(1))),
              point: Number(bfPoint.toFixed(1)),
            }
          : null;

      const improvementAreas =
        Array.isArray((analysis as any).improvementAreas) && (analysis as any).improvementAreas.length
          ? (analysis as any).improvementAreas
          : Array.isArray(analysis.estimate.keyObservations) && analysis.estimate.keyObservations.length
            ? analysis.estimate.keyObservations
            : Array.isArray(analysis.estimate.goalRecommendations) &&
                analysis.estimate.goalRecommendations.length
              ? analysis.estimate.goalRecommendations
              : analysis.recommendations;

      const nutritionPlan = (() => {
        const derived = deriveNutritionPlan({
          weightKg: currentWeightKg,
          bodyFatPercent: analysis.estimate.bodyFatPercent,
          goalWeightKg,
        });
        const baseDay = {
          calories: derived.caloriesPerDay,
          proteinGrams: derived.proteinGrams,
          carbsGrams: derived.carbsGrams,
          fatsGrams: derived.fatsGrams,
        };
        const coerceDay = (
          day: any,
          fallback: { calories: number; proteinGrams: number; carbsGrams: number; fatsGrams: number }
        ) => ({
          calories: Math.round(Number.isFinite(day?.calories) ? day.calories : fallback.calories),
          proteinGrams: Math.round(
            Number.isFinite(day?.proteinGrams) ? day.proteinGrams : fallback.proteinGrams
          ),
          carbsGrams: Math.round(
            Number.isFinite(day?.carbsGrams) ? day.carbsGrams : fallback.carbsGrams
          ),
          fatsGrams: Math.round(
            Number.isFinite(day?.fatsGrams) ? day.fatsGrams : fallback.fatsGrams
          ),
        });
        const restFallback = {
          calories: Math.max(1200, Math.round(baseDay.calories - 150)),
          proteinGrams: baseDay.proteinGrams,
          carbsGrams: Math.max(0, Math.round(baseDay.carbsGrams * 0.85)),
          fatsGrams: Math.max(0, Math.round(baseDay.fatsGrams + 8)),
        };
        return {
          ...analysis.nutritionPlan,
          caloriesPerDay: derived.caloriesPerDay,
          proteinGrams: derived.proteinGrams,
          carbsGrams: derived.carbsGrams,
          fatsGrams: derived.fatsGrams,
          trainingDay: coerceDay((analysis as any)?.nutritionPlan?.trainingDay, baseDay),
          restDay: coerceDay((analysis as any)?.nutritionPlan?.restDay, restFallback),
        };
      })();

      await scanRef.set(
        {
          status: "complete",
          updatedAt: serverTimestamp(),
          completedAt: serverTimestamp(),
          lastStep: "complete",
          lastStepAt: serverTimestamp(),
          processingHeartbeatAt: serverTimestamp(),
          progress: 100,
          photoPaths,
          input: {
            currentWeightKg,
            goalWeightKg,
          },
          estimate: analysis.estimate,
          workoutPlan: analysis.workoutPlan,
          nutritionPlan,
          recommendations: analysis.recommendations.length
            ? analysis.recommendations
            : null,
          improvementAreas: improvementAreas?.length ? improvementAreas : null,
          disclaimer: "Estimates only. Not medical advice.",
          workoutProgram: analysis.workoutPlan,
          planMarkdown: buildPlanMarkdown({
            estimate: analysis.estimate,
            workoutPlan: analysis.workoutPlan,
            nutritionPlan,
            recommendations: analysis.recommendations,
            improvementAreas,
            input: { currentWeightKg, goalWeightKg },
            usedFallback,
          }),
          metrics: {
            leanMassKg,
            fatMassKg,
            bmi: analysis.estimate.bmi,
            bodyFatEstimate: bfRange,
          },
          usedFallback,
          errorMessage: null,
          errorReason: null,
          errorInfo: null,
        },
        { merge: true }
      );

      const totalProcessingMs = Date.now() - processingStartedAtMs;
      console.info("scan_processing_complete", {
        uid,
        scanId,
        correlationId,
        processingAttemptId,
        downloadElapsedMs,
        openAiElapsedMs,
        totalProcessingMs,
        usedFallback,
        queueDurationMs,
      });
    } catch (error: any) {
      stopHeartbeat();
      const errorReason = deriveErrorReason(error);
      const errorDetails =
        error instanceof HttpsError ? ((error as any)?.details ?? {}) : {};
      const rawMessage =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : null;
      const effectiveReason = (() => {
        if (rawMessage?.startsWith("missing_photo_")) return "missing_photos";
        if (rawMessage?.startsWith("invalid_photo_path_")) return "invalid_photo_paths";
        if (rawMessage === "missing_photo_paths") return "missing_photo_paths";
        if (rawMessage === "missing_scan_input") return "missing_scan_input";
        if (errorDetails?.reason === "scan_engine_not_configured") return "scan_engine_not_configured";
        if (error instanceof OpenAIClientError && error.code) return error.code;
        return errorReason;
      })();
      const message = (() => {
        if (rawMessage?.startsWith("missing_photo_")) {
          return "We could not find your uploaded photos. Please re-upload each angle and try again.";
        }
        if (rawMessage?.startsWith("invalid_photo_path_")) {
          return "Invalid photo path supplied.";
        }
        if (rawMessage === "missing_photo_paths") {
          return "Missing photo paths for this scan.";
        }
        if (rawMessage === "missing_scan_input") {
          return "Missing scan input (weights).";
        }
        if (error instanceof OpenAIClientError) {
          if (error.code === "openai_missing_key") {
            return "Scan engine not configured. Set OPENAI_API_KEY and OPENAI_MODEL in Cloud Functions.";
          }
          if (error.status === 429) {
            return "Scan engine is busy. Please try again shortly.";
          }
          return "Scan engine is temporarily unavailable. Please try again.";
        }
        if (effectiveReason === "scan_engine_not_configured") {
          return rawMessage?.length
            ? rawMessage
            : "Scan engine not configured. Set OPENAI_API_KEY and OPENAI_MODEL in Cloud Functions.";
        }
        return rawMessage ?? "Unexpected error while processing scan.";
      })();
      const stack =
        typeof error?.stack === "string"
          ? error.stack.split("\n").slice(0, 3).join("\n")
          : undefined;
      await scanRef
        .set(
          {
            status: "error",
            errorMessage: message,
            errorReason: effectiveReason,
            errorInfo: {
              code: effectiveReason,
              message,
              stage: "processing",
              debugId: correlationId,
              stack,
            },
            lastStep: "error",
            lastStepAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            completedAt: serverTimestamp(),
            processingHeartbeatAt: serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => undefined);
      console.error("scan_processing_failed", {
        uid,
        scanId,
        correlationId,
        processingAttemptId,
        message: error?.message,
        reason: effectiveReason,
      });
    } finally {
      stopHeartbeat();
    }
  }
);
