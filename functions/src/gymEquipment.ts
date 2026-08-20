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
import {
  GYM_EQUIPMENT_IDS,
  type GymEquipmentId,
} from "./gymEquipmentCatalog.js";

export { GYM_EQUIPMENT_IDS } from "./gymEquipmentCatalog.js";

type Detection = {
  id: GymEquipmentId;
  confidence: number;
  evidence: string;
};

export type GymEquipmentAnalysis = {
  detected: Detection[];
  uncertain: Detection[];
  notes: string;
};

const EQUIPMENT_SET = new Set<string>(GYM_EQUIPMENT_IDS);
const DATA_URL_PATTERN =
  /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_FRAMES = 6;
const MAX_FRAME_CHARS = 700_000;
const MAX_TOTAL_CHARS = 3_000_000;

function normalizeDetection(value: unknown): Detection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!EQUIPMENT_SET.has(id)) return null;
  const confidenceRaw = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;
  const evidence =
    typeof raw.evidence === "string"
      ? raw.evidence.trim().slice(0, 120)
      : "Visible in the submitted gym view.";
  return { id: id as GymEquipmentId, confidence, evidence };
}

function uniqueDetections(value: unknown, max: number): Detection[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<GymEquipmentId, Detection>();
  for (const item of value) {
    const detection = normalizeDetection(item);
    if (!detection) continue;
    const previous = byId.get(detection.id);
    if (!previous || detection.confidence > previous.confidence) {
      byId.set(detection.id, detection);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max);
}

export function validateGymEquipmentAnalysis(
  value: unknown
): GymEquipmentAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_gym_equipment_payload");
  }
  const raw = value as Record<string, unknown>;
  const detected = uniqueDetections(raw.detected, GYM_EQUIPMENT_IDS.length);
  const detectedIds = new Set(detected.map((item) => item.id));
  const uncertain = uniqueDetections(raw.uncertain, 12).filter(
    (item) => !detectedIds.has(item.id)
  );
  const notes =
    typeof raw.notes === "string" ? raw.notes.trim().slice(0, 300) : "";
  return { detected, uncertain, notes };
}

export function validateGymFrames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FRAMES) {
    throw new HttpsError(
      "invalid-argument",
      `Add between 1 and ${MAX_FRAMES} gym views.`
    );
  }
  const frames = value.map((item) =>
    typeof item === "string" ? item.trim() : ""
  );
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
      "One or more gym views could not be processed. Try a shorter video or fewer photos."
    );
  }
  return frames;
}

const SYSTEM_PROMPT = [
  "You inspect gym photos to draft an equipment inventory for workout planning.",
  "Ignore people, faces, screens, logos, addresses, and all other identifying details.",
  "Only report equipment that is visibly supported by the images. Never assume a full gym.",
  "Use only these IDs:",
  GYM_EQUIPMENT_IDS.join(", "),
  'Return JSON shaped as {"detected":[{"id":"dumbbells","confidence":0.95,"evidence":"rack of dumbbells"}],"uncertain":[{"id":"leg_curl","confidence":0.45,"evidence":"partly obscured machine"}],"notes":"short coverage note"}.',
  "Put clear items in detected and ambiguous items in uncertain. Confidence must be 0 to 1.",
  "Do not identify brands. Do not provide medical, safety, or exercise advice.",
].join("\n");

export const analyzeGymEquipment = onCallWithOptionalAppCheck(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    await requireProEntitlement(uid);
    await enforceRateLimit({
      uid,
      key: "analyzeGymEquipment",
      limit: 4,
      windowMs: 60 * 60 * 1000,
    });
    const frames = validateGymFrames(request.data?.frames);
    const requestId = randomUUID();
    const content: ChatContentPart[] = [
      {
        type: "text",
        text: `Review all ${frames.length} views together. Return one deduplicated inventory.`,
      },
      ...frames.map((url): ChatContentPart => ({
        type: "image_url",
        image_url: { url, detail: "low" },
      })),
    ];

    try {
      const { data } = await structuredJsonChat<GymEquipmentAnalysis>({
        systemPrompt: SYSTEM_PROMPT,
        userContent: content,
        temperature: 0.1,
        maxTokens: 900,
        userId: uid,
        requestId,
        timeoutMs: 30_000,
        validate: validateGymEquipmentAnalysis,
      });
      return { ...data, reviewRequired: true, requestId };
    } catch (error) {
      console.error("gym_equipment_analysis_failed", {
        uid,
        requestId,
        code:
          error instanceof OpenAIClientError
            ? error.code
            : "gym_equipment_analysis_failed",
        status: error instanceof OpenAIClientError ? error.status : 500,
      });
      if (error instanceof OpenAIClientError && error.status === 429) {
        throw new HttpsError(
          "resource-exhausted",
          "Gym analysis is busy. Please try again shortly."
        );
      }
      throw new HttpsError(
        "unavailable",
        "We could not review those gym views. You can still select equipment manually."
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
