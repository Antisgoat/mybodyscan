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
import type {
  ScanDocument,
  ScanNutritionPlan,
  ScanWorkoutPlan,
} from "../types.js";
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
import { refundCredit } from "./creditUtils.js";
import {
  hasAllRequiredPhotoPaths,
  isSaneWeightKg,
  normalizeScanStatus,
} from "./contract.js";

const db = getFirestore();
const serverTimestamp = (): FirebaseFirestore.Timestamp =>
  Timestamp.now() as FirebaseFirestore.Timestamp;
const HEARTBEAT_MS = 25_000;
const ANALYSIS_TIMEOUT_MS = 110_000;
const ANALYSIS_MAX_ATTEMPTS = 2;

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function bmiCategory(bmi: number): string | null {
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  if (bmi < 35) return "Obesity I";
  if (bmi < 40) return "Obesity II";
  return "Obesity III";
}

export function deriveDeterministicWorkoutPlan(profile: any): ScanWorkoutPlan {
  const requested = Number(
    profile?.training_days_per_week ??
      profile?.trainingDaysPerWeek ??
      profile?.programPreferences?.daysPerWeek ??
      profile?.daysPerWeek ??
      profile?.training_days
  );
  const daysPerWeek =
    Number.isInteger(requested) && requested >= 2 && requested <= 6
      ? requested
      : 3;
  const injuries = Array.isArray(profile?.injuries)
    ? profile.injuries.filter(
        (item: unknown) => typeof item === "string" && item.trim()
      )
    : [];
  const goal = typeof profile?.goal === "string" ? profile.goal : null;
  const experience =
    typeof profile?.experience === "string" ? profile.experience : null;
  const equipment = Array.isArray(profile?.equipment)
    ? profile.equipment.filter(
        (item: unknown) => typeof item === "string" && item.trim()
      )
    : [];
  const templates =
    daysPerWeek === 2
      ? ["Full Body A", "Full Body B"]
      : daysPerWeek === 3
        ? ["Full Body A", "Full Body B", "Full Body C"]
        : daysPerWeek === 4
          ? ["Upper A", "Lower A", "Upper B", "Lower B"]
          : daysPerWeek === 5
            ? ["Upper", "Lower", "Push", "Pull", "Full Body"]
            : ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"];
  const exercisesFor = (focus: string) => {
    const lower = /lower|legs/i.test(focus);
    const upper = /upper|push|pull/i.test(focus);
    return (
      lower
        ? ["Squat pattern", "Hip hinge", "Split squat", "Calf raise"]
        : upper
          ? ["Horizontal press", "Row", "Vertical press", "Pulldown"]
          : ["Squat pattern", "Horizontal press", "Row", "Hip hinge"]
    ).map((name) => ({
      name,
      sets: 3,
      reps: "6-12",
      notes: "Use a pain-free range of motion.",
    }));
  };
  return {
    summary: `${daysPerWeek}-day ${daysPerWeek <= 3 ? "full-body" : "balanced split"} plan based on your available training frequency${goal ? ` and ${goal.replace(/_/g, " ")} goal` : ""}${experience ? ` (${experience.replace(/_/g, " ")} level)` : ""}${equipment.length ? ` using your available equipment` : ""}.`,
    progressionRules: [
      "Leave 2-3 repetitions in reserve while learning each movement.",
      "Add repetitions before increasing load by 2-5%.",
      "Stop painful movements and substitute a comfortable variation; never train through pain.",
      ...(injuries.length
        ? [
            "Use conservative exercise selection around the limitations listed in your profile.",
          ]
        : []),
    ],
    weeks: Array.from({ length: 8 }, (_, weekIndex) => ({
      weekNumber: weekIndex + 1,
      days: templates.map((focus, dayIndex) => ({
        day: `Day ${dayIndex + 1}`,
        focus,
        exercises: exercisesFor(focus),
      })),
    })),
  };
}

export function deriveDeterministicNutritionPlan(args: {
  currentWeightKg: number;
  goalWeightKg?: number | null;
  bodyFatPercent: number;
  profile?: any;
}): ScanNutritionPlan {
  const derived = deriveNutritionPlan({
    weightKg: args.currentWeightKg,
    goalWeightKg: args.goalWeightKg,
    bodyFatPercent: args.bodyFatPercent,
    goal: args.profile?.goal,
    activityLevel: args.profile?.activityLevel ?? args.profile?.activity_level,
  });
  const calories = Math.min(4500, Math.max(1200, derived.caloriesPerDay));
  const protein = derived.proteinGrams;
  const fats = derived.fatsGrams;
  const carbs = Math.max(
    0,
    Math.round((calories - protein * 4 - fats * 9) / 4)
  );
  const trainingDay = {
    calories,
    proteinGrams: protein,
    carbsGrams: carbs,
    fatsGrams: fats,
  };
  const restCalories = Math.max(1200, calories - 150);
  const restCarbs = Math.max(
    0,
    Math.round((restCalories - protein * 4 - fats * 9) / 4)
  );
  const portions = [0.25, 0.3, 0.15, 0.3];
  const names = ["Breakfast", "Lunch", "Snack", "Dinner"];
  return {
    caloriesPerDay: calories,
    proteinGrams: protein,
    carbsGrams: carbs,
    fatsGrams: fats,
    trainingDay,
    restDay: {
      calories: restCalories,
      proteinGrams: protein,
      carbsGrams: restCarbs,
      fatsGrams: fats,
    },
    adjustmentRules: [
      "Review the weekly weight trend after two consistent weeks.",
      "Adjust by 100-200 calories if progress is outside the intended range.",
      "Keep protein stable and avoid crash diets.",
    ],
    sampleDay: portions.map((portion, index) => ({
      mealName: names[index],
      description:
        "Choose minimally processed foods, a lean protein, and produce.",
      calories: Math.round(calories * portion),
      proteinGrams: Math.round(protein * portion),
      carbsGrams: Math.round(carbs * portion),
      fatsGrams: Math.round(fats * portion),
    })),
  };
}

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

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  tag: string
): Promise<T> {
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
    if (!scan || normalizeScanStatus(scan.status) !== "queued") return;

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
      if (normalizeScanStatus(current.status) !== "queued") return false;
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
    let engine: ReturnType<typeof getEngineConfigOrThrow> | null = null;
    const queueRequestedAtMs = toMillis((scan as any).processingRequestedAt);
    const queueDurationMs =
      queueRequestedAtMs != null
        ? Math.max(0, Date.now() - queueRequestedAtMs)
        : null;

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
      // Resolve runtime secrets inside the failure boundary so configuration errors
      // are persisted and refunded instead of leaving a scan stuck in processing.
      engine = getEngineConfigOrThrow(correlationId);
      await updateStep({
        lastStep: "Validating uploads",
        progress: 10,
        processingHeartbeatAt: serverTimestamp(),
      });

      const photoPaths = scan.photoPaths as
        | ScanDocument["photoPaths"]
        | undefined;
      const input = scan.input as ScanDocument["input"] | undefined;
      if (!hasAllRequiredPhotoPaths(photoPaths)) {
        throw new Error("missing_photo_paths");
      }
      const currentWeightKg = Number(input?.currentWeightKg);
      const goalWeightCandidate = Number(input?.goalWeightKg);
      if (!isSaneWeightKg(currentWeightKg)) {
        throw new Error("missing_scan_input");
      }
      const goalWeightKg = isSaneWeightKg(goalWeightCandidate)
        ? goalWeightCandidate
        : currentWeightKg;

      // Pull height (and other profile details later) to compute BMI deterministically.
      const profileSnap = await db
        .doc(`users/${uid}/coach/profile`)
        .get()
        .catch(() => null);
      const profile = profileSnap?.exists ? (profileSnap.data() as any) : null;
      const scanHeight = Number(
        (input as any)?.heightCm ?? (input as any)?.height_cm
      );
      const profileHeight = Number(profile?.height_cm ?? profile?.heightCm);
      const chosenHeight =
        Number.isFinite(scanHeight) && scanHeight > 0
          ? scanHeight
          : profileHeight;
      const heightOk =
        Number.isFinite(chosenHeight) && chosenHeight > 50 && chosenHeight < 260
          ? Math.round(chosenHeight)
          : null;
      const bmiComputed =
        heightOk != null
          ? round1(currentWeightKg / Math.pow(heightOk / 100, 2))
          : null;
      const bmiCategoryComputed =
        bmiComputed != null ? bmiCategory(bmiComputed) : null;

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
      startHeartbeat("Analyzing body composition", 45);
      const openAiStartedAtMs = Date.now();
      let result: Awaited<ReturnType<typeof callOpenAI>> | null = null;
      let analysis: ReturnType<typeof buildAnalysisFromResult> | null = null;
      let lastAnalysisError: unknown = null;
      for (let attempt = 1; attempt <= ANALYSIS_MAX_ATTEMPTS; attempt += 1) {
        try {
          result = await withTimeout(
            callOpenAI(
              images,
              { currentWeightKg, goalWeightKg, uid, heightCm: heightOk },
              `${correlationId}:attempt${attempt}`,
              engine
            ),
            ANALYSIS_TIMEOUT_MS,
            "analysis"
          );
          // Validate the only required model output inside the retry boundary.
          analysis = buildAnalysisFromResult(result as any);
          break;
        } catch (analysisError) {
          lastAnalysisError = analysisError;
          const reason = deriveErrorReason(analysisError);
          const transient =
            (analysisError instanceof OpenAIClientError &&
              (analysisError.status === 429 ||
                analysisError.status >= 500 ||
                analysisError.message.includes("timeout") ||
                reason === "invalid_json_payload")) ||
            reason.includes("invalid_body_fat_percent") ||
            analysisError instanceof DOMException ||
            (analysisError as any)?.name === "AbortError";
          if (!transient || attempt >= ANALYSIS_MAX_ATTEMPTS)
            throw analysisError;
          await updateStep({
            lastStep: "Retrying scan analysis",
            progress: 55,
            processingHeartbeatAt: serverTimestamp(),
          });
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
      }
      if (!result || !analysis)
        throw lastAnalysisError ?? new Error("analysis_failed");
      const openAiElapsedMs = Date.now() - openAiStartedAtMs;
      stopHeartbeat();

      await updateStep({
        lastStep: "Generating your plan",
        progress: 80,
        processingHeartbeatAt: serverTimestamp(),
      });

      const leanMassKg = Number.isFinite(currentWeightKg)
        ? Number(
            (
              currentWeightKg *
              (1 - analysis.estimate.bodyFatPercent / 100)
            ).toFixed(1)
          )
        : null;
      const fatMassKg = Number.isFinite(currentWeightKg)
        ? Number(
            (
              currentWeightKg *
              (analysis.estimate.bodyFatPercent / 100)
            ).toFixed(1)
          )
        : null;
      analysis.estimate.leanMassKg = leanMassKg;
      analysis.estimate.fatMassKg = fatMassKg;
      // Ensure BMI is always present when height is known (model may omit/miscategorize).
      if (bmiComputed != null) {
        analysis.estimate.bmi = bmiComputed;
        analysis.estimate.bmiCategory = bmiCategoryComputed;
      }
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
        Array.isArray((analysis as any).improvementAreas) &&
        (analysis as any).improvementAreas.length
          ? (analysis as any).improvementAreas
          : Array.isArray(analysis.estimate.keyObservations) &&
              analysis.estimate.keyObservations.length
            ? analysis.estimate.keyObservations
            : Array.isArray(analysis.estimate.goalRecommendations) &&
                analysis.estimate.goalRecommendations.length
              ? analysis.estimate.goalRecommendations
              : analysis.recommendations;

      const nutritionPlan = deriveDeterministicNutritionPlan({
        currentWeightKg,
        goalWeightKg,
        bodyFatPercent: analysis.estimate.bodyFatPercent,
        profile,
      });
      const workoutPlan = deriveDeterministicWorkoutPlan(profile);

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
            heightCm: heightOk,
          },
          estimate: analysis.estimate,
          workoutPlan,
          nutritionPlan,
          recommendations: analysis.recommendations.length
            ? analysis.recommendations
            : null,
          improvementAreas: improvementAreas?.length ? improvementAreas : null,
          disclaimer: "Estimates only. Not medical advice.",
          workoutProgram: workoutPlan,
          planMarkdown: buildPlanMarkdown({
            estimate: analysis.estimate,
            workoutPlan,
            nutritionPlan,
            recommendations: analysis.recommendations,
            improvementAreas,
            input: { currentWeightKg, goalWeightKg },
            usedFallback: false,
          }),
          metrics: {
            leanMassKg,
            fatMassKg,
            bmi: analysis.estimate.bmi,
            bmiCategory: analysis.estimate.bmiCategory ?? null,
            heightCm: heightOk,
            bodyFatEstimate: bfRange,
          },
          usedFallback: false,
          resultSource: "ai",
          aiProcessing: {
            status: "succeeded",
            provider: engine.provider,
            model: engine.model,
            elapsedMs: openAiElapsedMs,
            completedAt: serverTimestamp(),
          },
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
        usedFallback: false,
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
      const missingConfig = Array.isArray(errorDetails?.missing)
        ? errorDetails.missing.filter((item: unknown) => typeof item === "string")
        : [];
      const effectiveReason = (() => {
        if (rawMessage?.startsWith("missing_photo_")) return "missing_photos";
        if (rawMessage?.startsWith("invalid_photo_path_"))
          return "invalid_photo_paths";
        if (rawMessage === "missing_photo_paths") return "missing_photo_paths";
        if (rawMessage === "missing_scan_input") return "missing_scan_input";
        if (missingConfig.includes("OPENAI_API_KEY")) return "openai_missing_key";
        if (missingConfig.includes("OPENAI_MODEL")) return "openai_missing_model";
        if (missingConfig.includes("STORAGE_BUCKET"))
          return "missing_storage_bucket";
        if (missingConfig.includes("PROJECT_ID")) return "missing_project_id";
        if (errorDetails?.reason === "scan_engine_not_configured")
          return "scan_engine_not_configured";
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
            return "Scan is temporarily unavailable. Please try again in a few minutes or contact support.";
          }
          if (error.status === 429) {
            return "Scan engine is busy. Please try again shortly.";
          }
          return "Scan engine is temporarily unavailable. Please try again.";
        }
        if (
          effectiveReason === "scan_engine_not_configured" ||
          effectiveReason === "openai_missing_key" ||
          effectiveReason === "openai_missing_model" ||
          effectiveReason === "missing_storage_bucket" ||
          effectiveReason === "missing_project_id"
        ) {
          return "Scan is temporarily unavailable. Please try again in a few minutes or contact support.";
        }
        return rawMessage ?? "Unexpected error while processing scan.";
      })();
      const stack =
        typeof error?.stack === "string"
          ? error.stack.split("\n").slice(0, 3).join("\n")
          : undefined;
      const failedAt = serverTimestamp();
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
            lastStepAt: failedAt,
            updatedAt: failedAt,
            completedAt: failedAt,
            processingHeartbeatAt: failedAt,
            estimate: null,
            workoutPlan: null,
            workoutProgram: null,
            nutritionPlan: null,
            planMarkdown: null,
            recommendations: null,
            improvementAreas: null,
            usedFallback: false,
            resultSource: "failed",
            aiProcessing: {
              status: "failed",
              provider: engine?.provider ?? null,
              model: engine?.model ?? null,
              errorCode: effectiveReason,
              errorMessage: message,
              failedAt,
            },
          },
          { merge: true }
        )
        .catch(() => undefined);

      if ((scan as any).charged) {
        await db
          .runTransaction(async (tx) => {
            const latest = await tx.get(scanRef);
            const data = latest.exists ? (latest.data() as any) : null;
            if (!data?.charged || data?.refundedAt) return;
            const creditRef = db.doc(`users/${uid}/private/credits`);
            await refundCredit(tx, creditRef, `scan-failed:${scanId}`);
            tx.set(
              scanRef,
              {
                charged: false,
                refundedAt: serverTimestamp(),
                refundReason: effectiveReason,
                creditStatus: "refunded",
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          })
          .catch((refundError) => {
            console.error("scan_refund_failed", {
              uid,
              scanId,
              correlationId,
              message: (refundError as Error)?.message,
            });
          });
      }
      console.error("scan_processing_failed", {
        uid,
        scanId,
        correlationId,
        processingAttemptId,
        message: error?.message,
        reason: effectiveReason,
        missingConfig,
      });
    } finally {
      stopHeartbeat();
    }
  }
);
