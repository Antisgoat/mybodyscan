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
    const engine = getEngineConfigOrThrow(correlationId);
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
      const goalWeightKg = Number(input?.goalWeightKg);
      if (!isSaneWeightKg(currentWeightKg) || !isSaneWeightKg(goalWeightKg)) {
        throw new Error("missing_scan_input");
      }

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
          break;
        } catch (analysisError) {
          lastAnalysisError = analysisError;
          const transient =
            analysisError instanceof OpenAIClientError &&
            (analysisError.status === 429 ||
              analysisError.status >= 500 ||
              analysisError.message.includes("timeout"));
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
      if (!result) throw lastAnalysisError ?? new Error("analysis_failed");
      const openAiElapsedMs = Date.now() - openAiStartedAtMs;
      stopHeartbeat();

      await updateStep({
        lastStep: "Generating your plan",
        progress: 80,
        processingHeartbeatAt: serverTimestamp(),
      });

      const analysis = buildAnalysisFromResult(result as any);
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
          fallback: {
            calories: number;
            proteinGrams: number;
            carbsGrams: number;
            fatsGrams: number;
          }
        ) => ({
          calories: Math.round(
            Number.isFinite(day?.calories) ? day.calories : fallback.calories
          ),
          proteinGrams: Math.round(
            Number.isFinite(day?.proteinGrams)
              ? day.proteinGrams
              : fallback.proteinGrams
          ),
          carbsGrams: Math.round(
            Number.isFinite(day?.carbsGrams)
              ? day.carbsGrams
              : fallback.carbsGrams
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
          trainingDay: coerceDay(
            (analysis as any)?.nutritionPlan?.trainingDay,
            baseDay
          ),
          restDay: coerceDay(
            (analysis as any)?.nutritionPlan?.restDay,
            restFallback
          ),
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
            heightCm: heightOk,
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
      const effectiveReason = (() => {
        if (rawMessage?.startsWith("missing_photo_")) return "missing_photos";
        if (rawMessage?.startsWith("invalid_photo_path_"))
          return "invalid_photo_paths";
        if (rawMessage === "missing_photo_paths") return "missing_photo_paths";
        if (rawMessage === "missing_scan_input") return "missing_scan_input";
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
      });
    } finally {
      stopHeartbeat();
    }
  }
);
