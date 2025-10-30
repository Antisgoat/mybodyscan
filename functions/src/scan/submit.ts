import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, getStorage, Timestamp } from "../firebase.js";
import { requireAuth, requireAuthWithClaims, verifyAppCheckStrict } from "../http.js";
import { consumeCredit } from "../credits.js";
import { getOpenAIKey, hasOpenAI } from "../lib/env.js";
import fetch from "node-fetch";

const db = getFirestore();
const storage = getStorage();
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const READ_URL_EXPIRATION_MS = 5 * 60 * 1000;
const POSES = ["front", "back", "left", "right"] as const;
const OPENAI_MODEL = "gpt-4o-mini";

type OpenAIChatChoice = { message?: { content?: string } };
function extractOpenAIContent(data: any): string | undefined {
  try {
    const choices = (data?.choices ?? []) as OpenAIChatChoice[];
    return choices[0]?.message?.content;
  } catch {
    return undefined;
  }
}

type Pose = (typeof POSES)[number];

type ConfidenceLevel = "low" | "medium" | "high";

interface SubmitPayload {
  scanId: string;
  weightLb?: number;
  heightIn?: number;
  age?: number;
  sex?: "male" | "female";
  idempotencyKey?: string;
  imageUrls?: string[]; // optional direct URLs path
}

interface ParsedResult {
  bfPercent: number;
  low: number;
  high: number;
  confidence: ConfidenceLevel;
  notes: string;
}

interface ImageMeta {
  pose: Pose;
  sizeBytes: number;
  md5Hash?: string | null;
  path: string;
}

interface StoredScan {
  createdAt: Timestamp;
  completedAt: Timestamp;
  engine: string;
  status: "complete";
  inputs: Record<string, unknown>;
  result: ParsedResult;
  metadata: {
    sessionId: string;
    images: Array<Pick<ImageMeta, "pose" | "sizeBytes" | "md5Hash">>;
  };
}

function buildUploadPath(uid: string, scanId: string, pose: Pose): string {
  return `uploads/${uid}/${scanId}/${pose}.jpg`;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function sanitizeNotes(notes: unknown): string {
  if (typeof notes !== "string") return "Visual estimate only.";
  const trimmed = notes.trim();
  if (!trimmed) return "Visual estimate only.";
  return trimmed.slice(0, 400);
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  if (raw === "high" || raw === "medium" || raw === "low") {
    return raw;
  }
  const text = typeof raw === "string" ? raw.toLowerCase() : "";
  if (text.includes("high")) return "high";
  if (text.includes("medium")) return "medium";
  if (text.includes("low")) return "low";
  return "low";
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function validatePayload(body: any): SubmitPayload | null {
  if (!body || typeof body !== "object") return null;
  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  if (!scanId || scanId.length > 128) return null;
  const sex = body.sex === "male" || body.sex === "female" ? body.sex : undefined;
  const weight = parseNumber(body.weightLb);
  const height = parseNumber(body.heightIn);
  const age = parseNumber(body.age);
  const payload: SubmitPayload = { scanId };
  if (weight && weight > 0 && weight < 2000) payload.weightLb = weight;
  if (height && height > 0 && height < 120) payload.heightIn = height;
  if (age && age > 0 && age < 130) payload.age = Math.round(age);
  if (sex) payload.sex = sex;
  if (typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length) {
    payload.idempotencyKey = body.idempotencyKey.trim().slice(0, 128);
  }
  if (Array.isArray(body.imageUrls)) {
    const urls = body.imageUrls
      .map((u: unknown) => (typeof u === "string" ? u.trim() : ""))
      .filter(Boolean);
    if (urls.length) payload.imageUrls = urls.slice(0, 4);
  }
  return payload;
}

function toInputRecord(payload: SubmitPayload): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  if (payload.weightLb != null) {
    record.weightLb = Number(payload.weightLb.toFixed(1));
  }
  if (payload.heightIn != null) {
    record.heightIn = Number(payload.heightIn.toFixed(1));
  }
  if (payload.age != null) {
    record.age = payload.age;
  }
  if (payload.sex) {
    record.sex = payload.sex;
  }
  return record;
}

function extractJson(text: string): any {
  let trimmed = text.trim();
  const fenced = trimmed.match(/```json([\s\S]*?)```/i);
  if (fenced) {
    trimmed = fenced[1];
  } else if (trimmed.startsWith("```")) {
    const generic = trimmed.match(/```([\s\S]*?)```/);
    if (generic) {
      trimmed = generic[1];
    }
  }
  trimmed = trimmed.trim();
  return JSON.parse(trimmed);
}

function parseOpenAiResponse(content: string): ParsedResult {
  let parsed: any;
  try {
    parsed = extractJson(content);
  } catch (err) {
    console.error("scan_parse_json_error", { message: (err as any)?.message });
    throw new Error("invalid_json");
  }
  const bf = clamp(Number(parsed?.bfPercent ?? parsed?.bodyFat ?? parsed?.body_fat), 3, 60);
  const lowRaw = Number(parsed?.low ?? parsed?.lower ?? parsed?.min);
  const highRaw = Number(parsed?.high ?? parsed?.upper ?? parsed?.max);
  let low = clamp(lowRaw || bf - 2, 3, 60);
  let high = clamp(highRaw || bf + 2, 3, 60);
  if (low > high) {
    const mid = low;
    low = high;
    high = mid;
  }
  const confidence = normalizeConfidence(parsed?.confidence);
  const notesRaw = sanitizeNotes(parsed?.notes ?? parsed?.summary ?? "");
  const lower = notesRaw.toLowerCase();
  let normalized = notesRaw;
  if (!lower.includes("estimate")) {
    normalized = `${normalized}${normalized.endsWith(".") ? "" : "."} Estimate only.`;
  }
  if (!normalized.toLowerCase().includes("medical")) {
    normalized = `${normalized.trim()} Not medical advice.`;
  }
  return {
    bfPercent: Number(bf.toFixed(1)),
    low: Number(low.toFixed(1)),
    high: Number(high.toFixed(1)),
    confidence,
    notes: normalized.trim(),
  };
}

async function toImageMeta(uid: string, scanId: string, pose: Pose): Promise<{ meta: ImageMeta; url: string }> {
  const path = buildUploadPath(uid, scanId, pose);
  const file = storage.bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`missing_${pose}`);
  }
  const [metadata] = await file.getMetadata();
  const sizeBytes = Number(metadata.size ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error(`invalid_size_${pose}`);
  }
  const contentType = metadata.contentType || metadata.content_type || "";
  if (typeof contentType !== "string" || !contentType.startsWith("image/")) {
    throw new Error(`invalid_type_${pose}`);
  }
  const md5 = metadata.md5Hash ? Buffer.from(metadata.md5Hash, "base64").toString("hex") : null;
  const expires = new Date(Date.now() + READ_URL_EXPIRATION_MS);
  const [url] = await file.getSignedUrl({ version: "v4", action: "read", expires });
  return {
    meta: { pose, sizeBytes, md5Hash: md5, path },
    url,
  };
}

function buildUserContext(inputs: SubmitPayload): string {
  const parts: string[] = [];
  if (inputs.weightLb) parts.push(`Weight: ${inputs.weightLb.toFixed(1)} lb`);
  if (inputs.heightIn) parts.push(`Height: ${inputs.heightIn.toFixed(1)} in`);
  if (inputs.age) parts.push(`Age: ${inputs.age} years`);
  if (inputs.sex) parts.push(`Sex: ${inputs.sex}`);
  if (!parts.length) return "No additional numeric context provided.";
  return parts.join("; ");
}

async function callOpenAi(
  apiKey: string,
  images: Array<{ pose: Pose; url: string }>,
  inputs: SubmitPayload
): Promise<ParsedResult> {
  const systemPrompt =
    "You are a body-composition assistant. Estimate body fat percentage from photographs. Provide only the requested JSON.";
  const context = buildUserContext(inputs);
  const userText = [
    "Estimate the person's body fat percentage based on the attached front, back, left, and right photos.",
    "Use visual cues and any provided context.",
    "Respond with compact JSON matching: {\"bfPercent\": number, \"low\": number, \"high\": number, \"confidence\": \"low\"|\"medium\"|\"high\", \"notes\": string}.",
    "Do not mention medical conditions. Notes must remind that this is an estimate, not medical advice.",
    `Context: ${context}`,
    "Return JSON only without markdown or additional commentary.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...images.map(({ pose, url }) => ({
              type: "image_url",
              image_url: { url, detail: "high" },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("scan_openai_error", { status: response.status, body: text.slice(0, 500) });
    const error = new Error("openai_error");
    (error as any).status = 502;
    throw error;
  }

  const data: any = await response.json();
  const content = extractOpenAIContent(data);
  if (!content) {
    console.error("scan_openai_missing_content", { data });
    throw new Error("no_content");
  }

  return parseOpenAiResponse(content);
}

async function deleteUploads(paths: string[]) {
  await Promise.allSettled(
    paths.map(async (path) => {
      try {
        await storage.bucket().file(path).delete({ ignoreNotFound: true });
      } catch (err) {
        console.warn("scan_cleanup_error", { path, message: (err as any)?.message });
      }
    })
  );
}

async function isFounder(uid: string): Promise<boolean> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    if (!snap.exists) return false;
    return Boolean((snap.data() as any)?.meta?.founder);
  } catch (err) {
    console.warn("scan_submit_founder_lookup_error", { uid, message: (err as any)?.message });
    return false;
  }
}

export const submitScan = onRequest(
  { invoker: "public", concurrency: 10, region: "us-central1" },
  async (req, res) => {
    let scanRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null = null;
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
      }
      await verifyAppCheckStrict(req as Request);
      const { uid, claims } = await requireAuthWithClaims(req as Request);
      const unlimitedCredits = claims?.unlimitedCredits === true;
      const payload = validatePayload((req.body as any) || {});
      if (!payload) {
        res.status(400).json({ error: "invalid_payload" });
        return;
      }
      const idempotencyKey = payload.idempotencyKey || undefined;

      if (!hasOpenAI()) {
        res.status(503).json({ error: "openai_not_configured" });
        return;
      }
      const apiKey = getOpenAIKey() as string;
      // Build images list: prefer direct imageUrls if provided, else infer from signed Storage read URLs
      let imagePairs: Array<{ pose: Pose; url: string }> = [];
      let imageMetaList: ImageMeta[] = [];
      const poses: Pose[] = ["front", "back", "left", "right"];
      if (payload.imageUrls && (payload.imageUrls.length === 2 || payload.imageUrls.length === 4)) {
        // Map provided URLs to the first N poses
        imagePairs = payload.imageUrls.map((url, index) => ({ pose: poses[index]!, url }));
      } else {
        // Read from Storage based on uploaded files
        const metas: Array<{ meta: ImageMeta; url: string }> = [];
        for (const pose of poses) {
          try {
            const item = await toImageMeta(uid, payload.scanId, pose);
            metas.push(item);
          } catch (err) {
            // If strictly requiring 4, return error; allow 2-photo submissions if at least 2 found
          }
        }
        if (metas.length < 2) {
          res.status(400).json({ error: "bad_request", message: "Missing required photos (need 2 or 4)." });
          return;
        }
        imageMetaList = metas.map(({ meta }) => meta);
        imagePairs = metas.map(({ meta, url }) => ({ pose: meta.pose, url }));
      }

      // Idempotency: record processing state early to avoid double credit
      const idempRef = idempotencyKey
        ? db.doc(`users/${uid}/private/idempotency/${payload.scanId}_${idempotencyKey}`)
        : null;
      scanRef = db.doc(`users/${uid}/scans/${payload.scanId}`);

      const inputRecord = toInputRecord(payload);

      const processingUpdate: Record<string, unknown> = {
        status: "processing",
        updatedAt: Timestamp.now(),
        inputs: inputRecord,
      };
      processingUpdate["metadata.sessionId"] = payload.scanId;
      if (imageMetaList.length) {
        processingUpdate["metadata.images"] = imageMetaList.map(({ pose, sizeBytes, md5Hash }) => ({
          pose,
          sizeBytes,
          md5Hash: md5Hash ?? null,
        }));
      }

      if (idempRef) {
        const existing = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
          const snap = (await tx.get(idempRef)) as unknown as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
          if (snap.exists) return snap.data() as any;
          tx.create(idempRef, { status: "processing", createdAt: Timestamp.now(), scanId: payload.scanId });
          return null;
        });
        if (existing && existing.status === "complete") {
          const doneSnap = await scanRef.get();
          if (doneSnap.exists) {
            const data = doneSnap.data() as any;
            res.json({ id: payload.scanId, ...data });
            return;
          }
        }
      }

      await scanRef.set(processingUpdate, { merge: true }).catch((error: unknown) => {
        console.warn("scan_processing_update_failed", { uid, scanId: payload.scanId, message: (error as any)?.message });
      });

      // Call OpenAI Vision
      let parsed: ParsedResult;
      try {
        parsed = await callOpenAi(apiKey, imagePairs, payload);
      } catch (err: any) {
        // Do not consume credit on model error
        res.status(typeof err?.status === "number" ? err.status : 502).json({
          error: "scan_engine_unavailable",
          message: "Vision model temporarily unavailable. Try again shortly.",
        });
        await scanRef.set(
          { status: "failed", updatedAt: Timestamp.now(), error: "scan_engine_unavailable" },
          { merge: true }
        ).catch(() => undefined);
        if (idempRef) await idempRef.set({ status: "failed", failedAt: Timestamp.now() }, { merge: true }).catch(() => undefined);
        return;
      }

      // Attempt to consume exactly one credit AFTER successful model call
      let credit = { consumed: true, remaining: 0 };
      
      if (unlimitedCredits) {
        // Skip credit consumption for whitelisted users
        console.info("scan_submit_unlimited_credits", { uid });
        credit = { consumed: true, remaining: Infinity };
      } else {
        credit = await consumeCredit(uid);
        if (!credit.consumed) {
          await scanRef
            .set({ status: "failed", updatedAt: Timestamp.now(), error: "no_credits" }, { merge: true })
            .catch(() => undefined);
          if (idempRef) await idempRef.set({ status: "failed_credit", failedAt: Timestamp.now() }, { merge: true }).catch(() => undefined);
          res.status(402).json({ error: "no_credits" });
          return;
        }
      }

      // Persist scan result
      const completedAt = Timestamp.now();
      const remainingCredits = Number.isFinite(credit.remaining) ? credit.remaining : null;
      const metadataImages = imageMetaList.length
        ? imageMetaList.map(({ pose, sizeBytes, md5Hash }) => ({ pose, sizeBytes, md5Hash: md5Hash ?? null }))
        : imagePairs.map((p) => ({ pose: p.pose, sizeBytes: 0, md5Hash: null }));

      const stored: StoredScan = {
        createdAt: completedAt,
        completedAt,
        engine: OPENAI_MODEL,
        status: "complete",
        inputs: inputRecord,
        result: parsed,
        metadata: {
          sessionId: payload.scanId,
          images: metadataImages,
        },
      };

      const finalUpdate: Record<string, unknown> = {
        ...stored,
        updatedAt: completedAt,
        creditsRemaining: remainingCredits,
        charged: !unlimitedCredits,
      };
      finalUpdate["metadata.sessionId"] = payload.scanId;
      finalUpdate["metadata.images"] = metadataImages;

      await scanRef.set(finalUpdate, { merge: true });
      if (idempRef)
        await idempRef.set({ status: "complete", completedAt: Timestamp.now() }, { merge: true }).catch(() => undefined);

      res.json({
        id: payload.scanId,
        createdAt: completedAt.toMillis(),
        completedAt: completedAt.toMillis(),
        engine: OPENAI_MODEL,
        status: "complete",
        inputs: inputRecord,
        result: parsed,
        metadata: stored.metadata,
        creditsRemaining: remainingCredits,
        provider: "openai",
      });
    } catch (err: any) {
      if (scanRef) {
        await scanRef
          .set({ status: "failed", updatedAt: Timestamp.now(), error: err?.message || "scan_failed" }, { merge: true })
          .catch(() => undefined);
      }
      res.status(500).json({ error: "scan_failed", message: err?.message || "error" });
    }
  }
);

