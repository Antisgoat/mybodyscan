import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";

import { getFirestore, getStorage } from "./firebase.js";
import { requireProEntitlement } from "./lib/proEntitlements.js";
import { getOpenAIKey, openAiSecretParam } from "./openai/keys.js";
import { scanObjectPath } from "./scan/paths.js";
import { onCallWithOptionalAppCheck } from "./util/callable.js";

const db = getFirestore();
const storage = getStorage();
const MODEL = "gpt-image-2";
const DISCLAIMER =
  "Illustrative motivational wellness visualization only. Not a prediction, guarantee, medical result, or exact representation of future appearance.";

const GOALS = [
  "lose_fat",
  "gain_muscle",
  "recomp",
  "maintain",
  "performance",
] as const;
type Goal = (typeof GOALS)[number];

export function buildTransformationPrompt(input: {
  goal: Goal;
  timelineWeeks: number;
}): string {
  const direction: Record<Goal, string> = {
    lose_fat:
      "show a moderate, realistic leaner fitness outcome while preserving natural proportions",
    gain_muscle:
      "show a moderate, realistic increase in visible muscular development while preserving natural proportions",
    recomp:
      "show a moderate, realistic body-recomposition outcome with slightly more definition and development",
    maintain:
      "show a healthy maintenance outcome with subtle posture and presentation improvements only",
    performance:
      "show a moderate, realistic athletic-development outcome without bodybuilding exaggeration",
  };
  return [
    "Edit the supplied reference photo into a photorealistic adult fitness progress portrait.",
    "Preserve the person's identity, facial features, skin tone, body proportions, pose, camera angle, background, and clothing coverage.",
    direction[input.goal],
    `Treat ${input.timelineWeeks} weeks only as motivational context, not as a guaranteed outcome.`,
    "Keep the result plausible and subtle. Do not exaggerate muscle size, thinness, vascularity, or body definition.",
    "Do not add text, measurements, internal anatomy, medical imagery, diagnoses, before-and-after labels, nudity, or revealing clothing.",
    "The person must remain fully clothed. Produce one clean portrait image.",
  ].join(" ");
}

function normalizeGoal(value: unknown): Goal {
  return GOALS.includes(value as Goal) ? (value as Goal) : "recomp";
}

function readAge(profile: Record<string, unknown>): number | null {
  const age = Number(profile.age);
  return Number.isFinite(age) ? Math.round(age) : null;
}

function isValidScan(scan: Record<string, unknown>): boolean {
  const estimate =
    scan.estimate && typeof scan.estimate === "object"
      ? (scan.estimate as Record<string, unknown>)
      : {};
  const bodyFat = Number(estimate.bodyFatPercent);
  return (
    (scan.status === "complete" || scan.status === "completed") &&
    scan.usedFallback !== true &&
    scan.resultSource !== "fallback" &&
    Number.isFinite(bodyFat)
  );
}

async function createImage(input: {
  source: Buffer;
  contentType: string;
  goal: Goal;
  timelineWeeks: number;
  uid: string;
  requestId: string;
}): Promise<Buffer> {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", buildTransformationPrompt(input));
  form.append("size", "1024x1536");
  form.append("quality", "medium");
  form.append("output_format", "jpeg");
  form.append("output_compression", "82");
  form.append(
    "image[]",
    new Blob([input.source], { type: input.contentType }),
    "front.jpg"
  );
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "X-Client-Request-Id": input.requestId,
    },
    body: form,
    signal: AbortSignal.timeout(240_000),
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    console.error("transformation_preview_provider_error", {
      uid: input.uid,
      requestId: input.requestId,
      status: response.status,
      code: payload?.error?.code || null,
      type: payload?.error?.type || null,
    });
    throw new Error(`provider_${response.status}`);
  }
  const encoded = payload?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded) {
    throw new Error("provider_missing_image");
  }
  const result = Buffer.from(encoded, "base64");
  if (!result.length || result.length > 20 * 1024 * 1024) {
    throw new Error("provider_invalid_image");
  }
  return result;
}

export const requestTransformationPreview = onCallWithOptionalAppCheck(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    await requireProEntitlement(uid);
    const scanId =
      typeof request.data?.scanId === "string"
        ? request.data.scanId.trim()
        : "";
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(scanId)) {
      throw new HttpsError("invalid-argument", "Invalid scan.");
    }
    if (request.data?.consent !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Consent is required before generating a preview."
      );
    }
    const goal = normalizeGoal(request.data?.goal);
    const timelineWeeks = Math.min(
      52,
      Math.max(8, Math.round(Number(request.data?.timelineWeeks) || 12))
    );
    const [scanSnap, profileSnap] = await Promise.all([
      db.doc(`users/${uid}/scans/${scanId}`).get(),
      db.doc(`users/${uid}/coach/profile`).get(),
    ]);
    if (!scanSnap.exists) throw new HttpsError("not-found", "Scan not found.");
    const scan = scanSnap.data() as Record<string, unknown>;
    if (!isValidScan(scan)) {
      throw new HttpsError(
        "failed-precondition",
        "A completed valid scan is required."
      );
    }
    const age = readAge((profileSnap.data() || {}) as Record<string, unknown>);
    if (age == null || age < 18) {
      throw new HttpsError(
        "failed-precondition",
        "Transformation Preview is available only to adults with age completed in their profile."
      );
    }
    const previewRef = db.doc(`users/${uid}/transformationPreviews/${scanId}`);
    const requestId = randomUUID();
    const claim = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(previewRef);
      const existingData = existing.data() as
        | Record<string, unknown>
        | undefined;
      if (existingData?.status === "ready" && existingData.storagePath) {
        return { generate: false, status: "ready" } as const;
      }
      const updatedAt = existingData?.updatedAt as
        | { toMillis?: () => number }
        | undefined;
      if (
        (existingData?.status === "queued" ||
          existingData?.status === "processing") &&
        typeof updatedAt?.toMillis === "function" &&
        Date.now() - updatedAt.toMillis() < 10 * 60 * 1000
      ) {
        return {
          generate: false,
          status: existingData.status as "queued" | "processing",
        } as const;
      }
      transaction.set(
        previewRef,
        {
          scanId,
          status: "processing",
          goal,
          timelineWeeks,
          consentVersion: "2026-07-22",
          requestId,
          requestedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          disclaimer: DISCLAIMER,
          model: MODEL,
          failureReason: null,
        },
        { merge: true }
      );
      return { generate: true, status: "processing" } as const;
    });
    if (!claim.generate) {
      return { status: claim.status, scanId };
    }

    try {
      const path = scanObjectPath({ uid, scanId, pose: "front" });
      const file = storage.bucket().file(path);
      const [[metadata], [source]] = await Promise.all([
        file.getMetadata(),
        file.download(),
      ]);
      const contentType = String(metadata.contentType || "image/jpeg");
      if (!contentType.startsWith("image/")) {
        throw new Error("invalid_source_image");
      }
      const output = await createImage({
        source,
        contentType,
        goal,
        timelineWeeks,
        uid,
        requestId,
      });
      const storagePath = `transformation-previews/${uid}/${scanId}/goal-preview.jpg`;
      await storage
        .bucket()
        .file(storagePath)
        .save(output, {
          resumable: false,
          contentType: "image/jpeg",
          metadata: {
            cacheControl: "private, max-age=3600",
            metadata: { ownerUid: uid, scanId, model: MODEL },
          },
        });
      await previewRef.set(
        {
          status: "ready",
          storagePath,
          readyAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          promptSummary:
            "A moderate, realistic, fully clothed motivational visualization aligned with the selected goal.",
          failureReason: null,
        },
        { merge: true }
      );
      console.info("transformation_preview_ready", {
        uid,
        scanId,
        requestId,
        model: MODEL,
      });
      return { status: "ready", scanId };
    } catch (error) {
      const reason =
        error instanceof Error && error.message.startsWith("provider_")
          ? error.message
          : "generation_failed";
      await previewRef.set(
        {
          status: "failed",
          failureReason: reason,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.error("transformation_preview_failed", {
        uid,
        scanId,
        requestId,
        reason,
      });
      throw new HttpsError(
        "unavailable",
        "The preview could not be generated right now. Please try again later."
      );
    }
  },
  {
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "1GiB",
    concurrency: 4,
    maxInstances: 10,
    secrets: [openAiSecretParam],
  }
);
