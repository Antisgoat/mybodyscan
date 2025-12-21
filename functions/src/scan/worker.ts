/**
 * Pipeline map — Background scan processor:
 * - Triggered when a scan doc transitions to `queued`.
 * - Claims processing, heartbeats progress, calls OpenAI, and writes final results.
 */
import { randomUUID } from "node:crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { Timestamp, getFirestore } from "../firebase.js";
import { deriveNutritionPlan } from "../lib/nutritionGoals.js";
import type { ScanDocument } from "../types.js";
import {
  OpenAIClientError,
  buildAnalysisFromResult,
  buildImageInputs,
  callOpenAI,
  deriveErrorReason,
} from "./analysis.js";

const db = getFirestore();
const serverTimestamp = (): FirebaseFirestore.Timestamp =>
  Timestamp.now() as FirebaseFirestore.Timestamp;
const HEARTBEAT_MS = 25_000;

export const processQueuedScan = onDocumentWritten(
  {
    document: "users/{uid}/scans/{scanId}",
    region: "us-central1",
    timeoutSeconds: 300,
    concurrency: 10,
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

      const images = await buildImageInputs(uid, photoPaths);

      await updateStep({
        lastStep: "Analyzing body composition",
        progress: 40,
        processingHeartbeatAt: serverTimestamp(),
      });

      startHeartbeat("Analyzing body composition", 45);
      const result = await callOpenAI(
        images,
        { currentWeightKg, goalWeightKg, uid },
        correlationId
      );
      stopHeartbeat();

      await updateStep({
        lastStep: "Generating your plan",
        progress: 80,
        processingHeartbeatAt: serverTimestamp(),
      });

      const analysis = buildAnalysisFromResult(result);

      const nutritionPlan = (() => {
        const derived = deriveNutritionPlan({
          weightKg: currentWeightKg,
          bodyFatPercent: analysis.estimate.bodyFatPercent,
          goalWeightKg,
        });
        return {
          ...analysis.nutritionPlan,
          caloriesPerDay: derived.caloriesPerDay,
          proteinGrams: derived.proteinGrams,
          carbsGrams: derived.carbsGrams,
          fatsGrams: derived.fatsGrams,
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
          errorMessage: null,
          errorReason: null,
          errorInfo: null,
        },
        { merge: true }
      );

      console.info("scan_processing_complete", {
        uid,
        scanId,
        correlationId,
        processingAttemptId,
      });
    } catch (error: any) {
      stopHeartbeat();
      const errorReason = deriveErrorReason(error);
      const rawMessage =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : null;
      const effectiveReason = (() => {
        if (rawMessage?.startsWith("missing_photo_")) return "missing_photos";
        if (rawMessage?.startsWith("invalid_photo_path_")) return "invalid_photo_paths";
        if (rawMessage === "missing_photo_paths") return "missing_photo_paths";
        if (rawMessage === "missing_scan_input") return "missing_scan_input";
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
            return "Scan engine not configured.";
          }
          if (error.status === 429) {
            return "Scan engine is busy. Please try again shortly.";
          }
          return "Scan engine is temporarily unavailable. Please try again.";
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
