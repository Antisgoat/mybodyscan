import { onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { getFirestore, getStorage, Timestamp } from "../firebase.js";
import { requireAuth, verifyAppCheckStrict } from "../http.js";
import { consumeCreditBuckets } from "./creditUtils.js";
import { isStaff } from "../claims.js";
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
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
      }
      await verifyAppCheckStrict(req as Request);
      const uid = await requireAuth(req as Request);
      const { imageUrls = [], imageUrl, idempotencyKey } = (req.body as any) || {};

      if (!hasOpenAI()) {
        res.status(503).json({ error: "openai_not_configured" });
        return;
      }
      const apiKey = getOpenAIKey() as string;
      const images = Array.isArray(imageUrls) && imageUrls.length ? imageUrls : imageUrl ? [imageUrl] : [];
      if (!images.length) {
        res.status(400).json({ error: "bad_request", message: "No image URL(s) provided" });
        return;
      }

      const payload = {
        model: OPENAI_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Estimate bodyFat%, weight, and BMI from these photo(s). Return compact JSON: { bodyFat:number, weight?:number, bmi?:number }",
              },
              ...images.map((u: string) => ({ type: "image_url", image_url: { url: u } })),
            ],
          },
        ],
        temperature: 0.2,
      } as const;

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const text = await r.text().catch(() => "");
        res.status(502).json({ error: "openai_upstream", status: r.status, body: text.slice(0, 800) });
        return;
      }
      const data: any = await r.json();
      const content = extractOpenAIContent(data);
      let parsed: any = {};
      try {
        const jsonBlock = content?.match(/{[\s\S]*}/)?.[0];
        if (jsonBlock) parsed = JSON.parse(jsonBlock);
      } catch {}

      res.json({
        provider: "openai",
        engine: OPENAI_MODEL,
        bodyFat: parsed?.bodyFat ?? null,
        weight: parsed?.weight ?? null,
        bmi: parsed?.bmi ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: "scan_failed", message: err?.message || "error" });
    }
  }
);

